import {
  createNotificationResponseSchema,
  notificationJobSchema,
  notificationListResponseSchema,
  notificationPreviewSchema,
} from '@libro/shared';
import { Types } from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { LOG_REDACTION } from '../lib/logger.js';
import { verifyUnsubscribeToken } from '../lib/unsubscribeToken.js';
import { Extra } from '../models/Extra.js';
import { MailUsage } from '../models/MailUsage.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
import { NotificationJob } from '../models/NotificationJob.js';
import { Post } from '../models/Post.js';
import { User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';
import {
  MailDeliveryError,
  MemoryMailProvider,
  type MailMessage,
  type MailProvider,
} from '../providers/mail/MailProvider.js';
import { staffWorld } from '../test-utils/admin.js';
import { createTestClock } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook } from '../test-utils/quizFixtures.js';
import { nextUtcMidnight } from '../services/mailQuota.service.js';

useTestDb();

const UNSUB_SECRET = 'solo-para-desarrollo-enlaces-de-baja-no-usar-en-produccion-5432';
const DAY = 86_400_000;
const NEWS_FROM = 'Universo Memorias <novedades@ejemplo.com>';

type World = Awaited<ReturnType<typeof staffWorld>>;

/** Lectores apuntados (activos), más uno pendiente de confirmar, uno dado de baja y uno desactivado que no cuentan. */
async function readers(count: number) {
  const ids: Types.ObjectId[] = [];
  for (let n = 0; n < count; n += 1) {
    const user = await createUser({ email: `apuntada${n}@ejemplo.com`, name: `Apuntada ${n}` });
    await User.updateOne(
      { _id: user._id },
      { $set: { 'newsletter.status': 'subscribed', 'newsletter.subscribedAt': new Date() } },
    );
    ids.push(user._id);
  }
  const extras: Array<[string, Record<string, unknown>, 'active' | 'disabled']> = [
    ['pendiente', { 'newsletter.status': 'pending' }, 'active'],
    ['baja', { 'newsletter.status': 'unsubscribed' }, 'active'],
    ['desactivada', { 'newsletter.status': 'subscribed' }, 'disabled'],
  ];
  for (const [name, set, status] of extras) {
    const user = await createUser({ email: `${name}@ejemplo.com`, status });
    await User.updateOne({ _id: user._id }, { $set: set });
  }
  return ids;
}

async function post(world: World, over: Record<string, unknown> = {}) {
  return Post.create({
    slug: `post-${new Types.ObjectId().toString()}`,
    title: '[PLACEHOLDER] Lanzamiento del libro dos',
    template: 'text',
    data: {},
    category: 'novedad',
    excerpt: '[PLACEHOLDER] Un resumen corto de la novedad.',
    thumbnail: {
      provider: 'cloudinary',
      publicId: 'libro/portada',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/libro/portada.webp',
      alt: '[PLACEHOLDER] Portada',
      width: 1200,
      height: 800,
    },
    status: 'published',
    publishedAt: new Date(),
    authorId: world.adminUser._id,
    ...over,
  });
}

/** Pide el aviso y espera a que la cola trabaje (la pasada se lanza en segundo plano). */
async function notify(world: World, refId: Types.ObjectId, kind: 'post' | 'extra' = 'post') {
  const res = await world.admin
    .post('/api/admin/notifications')
    .send({ kind, refId: String(refId) });
  await world.flush();
  return res;
}

async function jobOf(world: World, id: string) {
  // Mirar un aviso lanza una pasada de la cola; se espera a que termine y se vuelve a leer.
  await world.admin.get(`/api/admin/notifications/${id}`).expect(200);
  await world.flush();
  const res = await world.admin.get(`/api/admin/notifications/${id}`).expect(200);
  await world.flush();
  return notificationJobSchema.parse(res.body);
}

describe('permisos: solo ADMIN', () => {
  it('sin sesión 401; lector y editor 403', async () => {
    const world = await staffWorld();
    const id = new Types.ObjectId().toString();
    const calls: Array<[string, string]> = [
      ['get', '/api/admin/notifications'],
      ['get', `/api/admin/notifications/preview?kind=post&refId=${id}`],
      ['post', '/api/admin/notifications'],
      ['get', `/api/admin/notifications/${id}`],
      ['post', `/api/admin/notifications/${id}/cancel`],
    ];
    for (const [method, path] of calls) {
      const call = (agent: request.Agent | ReturnType<typeof request>) =>
        (agent as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send({
          kind: 'post',
          refId: id,
        });
      expect((await call(request(world.app))).status, path).toBe(401);
      expect((await call(world.reader)).status, path).toBe(403);
      expect((await call(world.editor)).status, path).toBe(403);
    }
  });
});

describe('vista previa y una sola vez por elemento', () => {
  it('cuenta solo a los apuntados activos y no entrega cifras de cupo ni límites', async () => {
    const world = await staffWorld();
    await readers(3);
    const item = await post(world);
    const res = await world.admin
      .get(`/api/admin/notifications/preview?kind=post&refId=${String(item._id)}`)
      .expect(200);
    const preview = notificationPreviewSchema.parse(res.body);
    expect(preview).toMatchObject({
      available: true,
      recipients: 3,
      continuesNextDays: false,
      existing: null,
    });
    // La web no debe recibir (ni mostrar) los límites ni lo que queda de ellos: cambian con el plan de Resend.
    expect(Object.keys(res.body as object).sort()).toEqual(
      ['available', 'continuesNextDays', 'existing', 'recipients'].sort(),
    );
    expect(JSON.stringify(res.body)).not.toMatch(
      /quota|todayLeft|monthLeft|dailyLimit|monthlyLimit|reserve/,
    );
  });

  it('continuesNextDays solo se enciende si por los límites configurados el envío pasaría de un día', async () => {
    // Con 22 al día y 20 de reserva quedan 2 para avisos hoy: 3 apuntados no caben hoy.
    const tight = await staffWorld({
      env: { MAIL_DAILY_LIMIT: '22', MAIL_TRANSACTIONAL_RESERVE: '20' },
    });
    await readers(3);
    const body = notificationPreviewSchema.parse(
      (await tight.admin.get('/api/admin/notifications/preview?kind=post').expect(200)).body,
    );
    expect(body).toMatchObject({ recipients: 3, continuesNextDays: true });
    expect(Object.keys(body)).not.toContain('quota');
  });

  it('sin apuntados no hay envío que continúe, aunque el cupo sea chico', async () => {
    const world = await staffWorld({
      env: { MAIL_DAILY_LIMIT: '22', MAIL_TRANSACTIONAL_RESERVE: '20' },
    });
    const body = notificationPreviewSchema.parse(
      (await world.admin.get('/api/admin/notifications/preview?kind=post').expect(200)).body,
    );
    expect(body).toMatchObject({ recipients: 0, continuesNextDays: false });
  });

  it('un borrador no se puede avisar (409); un elemento que no existe da 404', async () => {
    const world = await staffWorld();
    const draft = await post(world, { status: 'draft' });
    const preview = notificationPreviewSchema.parse(
      (
        await world.admin.get(
          `/api/admin/notifications/preview?kind=post&refId=${String(draft._id)}`,
        )
      ).body,
    );
    expect(preview).toMatchObject({ available: false, recipients: 0 });
    expect(preview.reason).toMatch(/Publica la actualización/);
    expect((await notify(world, draft._id)).status).toBe(409);
    expect((await notify(world, new Types.ObjectId())).status).toBe(404);
    expect(await NotificationJob.countDocuments()).toBe(0);
  });

  it('doble clic o dos personas a la vez: un solo aviso, una sola fila por destinatario', async () => {
    const world = await staffWorld();
    await readers(3);
    const item = await post(world);
    const body = { kind: 'post', refId: String(item._id) };
    const [a, b] = await Promise.all([
      world.admin.post('/api/admin/notifications').send(body),
      world.admin.post('/api/admin/notifications').send(body),
    ]);
    await world.flush();
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    const created = [a, b].map((res) => createNotificationResponseSchema.parse(res.body));
    expect(created[0]!.job.id).toBe(created[1]!.job.id);
    expect(await NotificationJob.countDocuments()).toBe(1);
    expect(await NotificationDelivery.countDocuments()).toBe(3);
    expect(world.mail.sent).toHaveLength(3);
    // Ya avisado: la vista previa lo dice y no lo ofrece de nuevo.
    const preview = notificationPreviewSchema.parse(
      (
        await world.admin.get(
          `/api/admin/notifications/preview?kind=post&refId=${String(item._id)}`,
        )
      ).body,
    );
    expect(preview.available).toBe(false);
    expect(preview.existing?.totals.sent).toBe(3);
  });
});

describe('vista previa antes de guardar', () => {
  it('sin refId: a cuántos apuntados llegaría al publicar; de un extra, solo quienes terminaron ese libro', async () => {
    const world = await staffWorld();
    const [done] = await readers(2);
    const book = await createBook();
    await UserProgress.create({ userId: done, bookId: book._id, bookCompletedAt: new Date() });
    const ofPost = notificationPreviewSchema.parse(
      (await world.admin.get('/api/admin/notifications/preview?kind=post').expect(200)).body,
    );
    expect(ofPost).toMatchObject({ available: true, recipients: 2, existing: null });
    const ofExtra = notificationPreviewSchema.parse(
      (
        await world.admin
          .get(`/api/admin/notifications/preview?kind=extra&bookId=${String(book._id)}`)
          .expect(200)
      ).body,
    );
    expect(ofExtra.recipients).toBe(1);
    const noBook = notificationPreviewSchema.parse(
      (await world.admin.get('/api/admin/notifications/preview?kind=extra').expect(200)).body,
    );
    expect(noBook.recipients).toBe(0);
  });
});

describe('el envío', () => {
  it('un correo por apuntado, con remitente de novedades, cabeceras de baja en un clic y enlace de baja firmado', async () => {
    const world = await staffWorld({ env: { MAIL_FROM_NEWS: NEWS_FROM } });
    await readers(3);
    const item = await post(world);
    const res = await notify(world, item._id);
    expect(res.status).toBe(201);

    expect(world.mail.batches).toEqual([{ size: 3, idempotencyKey: expect.stringMatching(/:/) }]);
    const sent = world.mail.sent as MailMessage[];
    expect(sent.map((m) => m.to).sort()).toEqual([
      'apuntada0@ejemplo.com',
      'apuntada1@ejemplo.com',
      'apuntada2@ejemplo.com',
    ]);
    const first = sent[0]!;
    expect(first.from).toBe(NEWS_FROM);
    expect(first.subject).toBe(
      'Novedad en Universo Memorias: [PLACEHOLDER] Lanzamiento del libro dos',
    );
    expect(first.html).toContain('w_600,c_limit,q_auto,f_jpg');
    expect(first.text).toContain(`/actualizaciones/${item.slug}`);
    expect(first.text).toContain('[PLACEHOLDER] Un resumen corto de la novedad.');
    // Cada correo lleva solo su destinatario; nada de las demás.
    expect(first.html).not.toContain(sent[1]!.to);
    // Baja en un clic (RFC 8058): la dirección del encabezado lleva el token firmado de esa persona.
    expect(first.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const headerUrl = /<([^>]+)>/.exec(first.headers?.['List-Unsubscribe'] ?? '')?.[1] ?? '';
    const token = new URL(headerUrl).searchParams.get('t') ?? '';
    const owner = await User.findOne({ email: first.to }).lean();
    expect(verifyUnsubscribeToken(token, UNSUB_SECRET)).toBe(String(owner?._id));
    expect(first.text).toContain(`/baja?t=${token}`);
    // Y ese token da de baja de verdad, sin sesión.
    await request(world.app)
      .post(new URL(headerUrl).pathname + new URL(headerUrl).search)
      .expect(200);
    expect((await User.findById(owner?._id).lean())?.newsletter?.status).toBe('unsubscribed');

    // Registro del aviso y contador del cupo.
    const job = createNotificationResponseSchema.parse(res.body).job;
    expect((await jobOf(world, job.id)).totals).toEqual({
      recipients: 3,
      sent: 3,
      skipped: 0,
      failed: 0,
      pending: 0,
    });
    expect((await jobOf(world, job.id)).status).toBe('done');
    expect((await MailUsage.findOne().lean())?.notifications).toBe(3);
  });

  it('sin apuntados el aviso termina enseguida sin enviar nada', async () => {
    const world = await staffWorld();
    const item = await post(world);
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    expect(job.status).toBe('done');
    expect(job.totals.recipients).toBe(0);
    expect(world.mail.sent).toHaveLength(0);
  });

  it('quien se da de baja con el aviso en cola se salta', async () => {
    const world = await staffWorld({
      env: { MAIL_DAILY_LIMIT: '22', MAIL_TRANSACTIONAL_RESERVE: '20' },
    });
    const ids = await readers(3);
    const item = await post(world);
    // Hoy caben 2: la tercera queda en cola y se da de baja antes de su turno.
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    const pending = await NotificationDelivery.findOne({ status: 'pending' }).lean();
    await User.updateOne(
      { _id: pending?.userId },
      { $set: { 'newsletter.status': 'unsubscribed' } },
    );
    expect(ids.map(String)).toContain(String(pending?.userId));
    await NotificationJob.updateOne({ _id: job.id }, { $unset: { pausedUntil: 1 } });
    await MailUsage.deleteMany({});
    const after = await jobOf(world, job.id);
    expect(after.totals).toMatchObject({ sent: 2, skipped: 1, pending: 0 });
    expect(after.status).toBe('done');
  });

  it('una actualización programada no sale antes de su fecha (P11)', async () => {
    const clock = createTestClock();
    const world = await staffWorld({ clock });
    await readers(2);
    const item = await post(world, { publishedAt: new Date(clock().getTime() + 2 * 60 * 60_000) });
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    expect(new Date(job.notBefore).getTime()).toBe(item.publishedAt!.getTime());
    expect(world.mail.sent).toHaveLength(0);
    clock.advance(3 * 60 * 60_000);
    const admin = await loginAgent(world.app, 'admin@ejemplo.com');
    await admin.get(`/api/admin/notifications/${job.id}`).expect(200);
    await world.flush();
    expect(world.mail.sent).toHaveLength(2);
  });
});

describe('cupo y cola', () => {
  it('envía lo que cabe hoy, se pausa hasta la medianoche UTC y sigue sola al día siguiente', async () => {
    const clock = createTestClock();
    // 25 al día con 20 de reserva: 5 avisos por día.
    const world = await staffWorld({
      clock,
      env: { MAIL_DAILY_LIMIT: '25', MAIL_TRANSACTIONAL_RESERVE: '20' },
    });
    await readers(8);
    const item = await post(world, { publishedAt: clock() });
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    let state = await NotificationJob.findById(job.id).lean();
    expect(state?.totals.sent).toBe(5);
    expect(state?.pausedUntil?.toISOString()).toBe(nextUtcMidnight(clock()).toISOString());
    expect(world.mail.batches.map((b) => b.size)).toEqual([5]);

    // Al día siguiente la cola sigue sola (aquí, al mirar el aviso; en el servidor, el temporizador).
    clock.advance(DAY);
    const admin = await loginAgent(world.app, 'admin@ejemplo.com');
    const res = await admin.get(`/api/admin/notifications/${job.id}`).expect(200);
    expect(notificationJobSchema.parse(res.body).totals.pending).toBe(3);
    await world.flush();
    state = await NotificationJob.findById(job.id).lean();
    expect(state?.status).toBe('done');
    expect(state?.totals.sent).toBe(8);
    expect(await NotificationDelivery.countDocuments({ status: 'sent' })).toBe(8);
  });

  it('la lista de avisos también despierta la cola si hay uno en marcha (la pantalla se refresca sola)', async () => {
    const clock = createTestClock();
    const world = await staffWorld({
      clock,
      env: { MAIL_DAILY_LIMIT: '25', MAIL_TRANSACTIONAL_RESERVE: '20' },
    });
    await readers(7);
    const item = await post(world, { publishedAt: clock() });
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    expect((await NotificationJob.findById(job.id).lean())?.totals.sent).toBe(5);
    clock.advance(DAY);
    const admin = await loginAgent(world.app, 'admin@ejemplo.com');
    await admin.get('/api/admin/notifications').expect(200);
    await world.flush();
    expect((await NotificationJob.findById(job.id).lean())?.status).toBe('done');
    // Sin nada en marcha, mirar la lista no lanza pasadas.
    const batches = world.mail.batches.length;
    await admin.get('/api/admin/notifications').expect(200);
    await world.flush();
    expect(world.mail.batches).toHaveLength(batches);
  });

  it('los transaccionales que pasan de la reserva le quitan cupo a los avisos (prioridad)', async () => {
    const world = await staffWorld({
      env: { MAIL_DAILY_LIMIT: '25', MAIL_TRANSACTIONAL_RESERVE: '20' },
    });
    await readers(5);
    // 23 transaccionales hoy: 3 más allá de la reserva → a los avisos les quedan 2.
    await MailUsage.create({
      day: new Date().toISOString().slice(0, 10),
      transactional: 23,
      notifications: 0,
      expireAt: new Date(Date.now() + DAY),
    });
    const item = await post(world);
    await notify(world, item._id);
    expect(world.mail.sent).toHaveLength(2);
  });

  it('si Resend dice que el cupo del día se agotó, nada se pierde: vuelve a la cola hasta mañana', async () => {
    const memory = new MemoryMailProvider();
    let quotaExceeded = true;
    const provider: MailProvider = {
      send: (m) => memory.send(m),
      sendBatch: async (messages, options) => {
        if (quotaExceeded) {
          throw new MailDeliveryError('resend', 'HTTP 429', 429, 'daily_quota');
        }
        await memory.sendBatch(messages, options);
      },
    };
    const world = await staffWorld({ mail: provider });
    await readers(3);
    const item = await post(world);
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    let state = await NotificationJob.findById(job.id).lean();
    expect(state?.totals.sent).toBe(0);
    expect(state?.pausedUntil).toBeDefined();
    expect(await NotificationDelivery.countDocuments({ status: 'pending' })).toBe(3);
    expect((await MailUsage.findOne().lean())?.notifications ?? 0).toBe(0);

    quotaExceeded = false;
    await NotificationJob.updateOne({ _id: job.id }, { $unset: { pausedUntil: 1 } });
    await jobOf(world, job.id);
    state = await NotificationJob.findById(job.id).lean();
    expect(state?.status).toBe('done');
    expect(memory.sent).toHaveLength(3);
  });

  it('un error de red deja el lote en duda: se reintenta después con la MISMA clave (sin duplicar)', async () => {
    const memory = new MemoryMailProvider();
    let down = true;
    const keys: Array<string | undefined> = [];
    const provider: MailProvider = {
      send: (m) => memory.send(m),
      sendBatch: async (messages, options) => {
        keys.push(options?.idempotencyKey);
        if (down) throw new MailDeliveryError('resend', 'red', undefined, 'network');
        await memory.sendBatch(messages, options);
      },
    };
    const clock = createTestClock();
    const world = await staffWorld({ mail: provider, clock });
    await readers(2);
    const item = await post(world, { publishedAt: clock() });
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    expect(await NotificationDelivery.countDocuments({ status: 'sending' })).toBe(2);
    expect(memory.sent).toHaveLength(0);

    down = false;
    clock.advance(6 * 60_000);
    const admin = await loginAgent(world.app, 'admin@ejemplo.com');
    await admin.get(`/api/admin/notifications/${job.id}`).expect(200);
    await world.flush();
    expect(memory.sent).toHaveLength(2);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect((await NotificationJob.findById(job.id).lean())?.status).toBe('done');
  });

  it('un lote cortado hace más de 23 h no se reintenta (podría duplicar): queda como fallido', async () => {
    const world = await staffWorld();
    await readers(2);
    const item = await post(world, { status: 'draft' });
    const job = await NotificationJob.create({
      kind: 'post',
      refId: item._id,
      createdBy: world.adminUser._id,
      notBefore: new Date(),
      content: { subject: 's', title: 't', path: '/actualizaciones/x' },
      status: 'sending',
      totals: { recipients: 2 },
    });
    const old = new Date(Date.now() - 24 * 60 * 60_000);
    for (const user of await User.find({ 'newsletter.status': 'subscribed', status: 'active' })) {
      await NotificationDelivery.create({
        jobId: job._id,
        userId: user._id,
        status: 'sending',
        batchKey: 'lote-viejo',
        batchStartedAt: old,
      });
    }
    await jobOf(world, String(job._id));
    const state = await NotificationJob.findById(job._id).lean();
    expect(state?.totals.failed).toBe(2);
    expect(state?.status).toBe('done');
    expect(world.mail.sent).toHaveLength(0);
  });

  it('un rechazo del proveedor marca el lote como fallido y guarda el error sin correos', async () => {
    const provider: MailProvider = {
      send: async () => undefined,
      sendBatch: async () => {
        throw new MailDeliveryError(
          'resend',
          'Resend rechazó el envío (HTTP 422): Invalid `to` field: apuntada0@ejemplo.com',
          422,
        );
      },
    };
    const world = await staffWorld({ mail: provider });
    await readers(2);
    const item = await post(world);
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    const state = await NotificationJob.findById(job.id).lean();
    expect(state?.totals.failed).toBe(2);
    expect(state?.status).toBe('done');
    expect(state?.lastError).toContain('[correo]');
    expect(state?.lastError).not.toContain('@ejemplo.com');
  });
});

describe('cancelar', () => {
  it('lo pendiente se salta, lo enviado queda; cancelar dos veces es 409 y uno que no existe 404', async () => {
    const world = await staffWorld({
      env: { MAIL_DAILY_LIMIT: '22', MAIL_TRANSACTIONAL_RESERVE: '20' },
    });
    await readers(5);
    const item = await post(world);
    const job = createNotificationResponseSchema.parse((await notify(world, item._id)).body).job;
    const cancelled = notificationJobSchema.parse(
      (await world.admin.post(`/api/admin/notifications/${job.id}/cancel`).expect(200)).body,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.totals).toMatchObject({ sent: 2, skipped: 3, pending: 0 });
    expect((await world.admin.post(`/api/admin/notifications/${job.id}/cancel`)).status).toBe(409);
    expect(
      (await world.admin.post(`/api/admin/notifications/${new Types.ObjectId().toString()}/cancel`))
        .status,
    ).toBe(404);
    // Un aviso cancelado no se vuelve a ofrecer (cada elemento se avisa una vez).
    const preview = notificationPreviewSchema.parse(
      (
        await world.admin.get(
          `/api/admin/notifications/preview?kind=post&refId=${String(item._id)}`,
        )
      ).body,
    );
    expect(preview.available).toBe(false);
  });
});

describe('capítulos extra (P8)', () => {
  it('solo a los apuntados que terminaron ese libro y sin el título ni nada del extra', async () => {
    const world = await staffWorld();
    const [done1, done2, notDone] = await readers(3);
    const book = await createBook();
    for (const userId of [done1, done2]) {
      await UserProgress.create({ userId, bookId: book._id, bookCompletedAt: new Date() });
    }
    await UserProgress.create({ userId: notDone, bookId: book._id });
    const extra = await Extra.create({
      bookId: book._id,
      slug: 'secreto',
      title: 'El secreto de la torre (spoiler)',
      kind: 'text',
      bodyHtml: '<p>Texto protegido del capítulo</p>',
      status: 'published',
      publishedAt: new Date(),
    });
    const preview = notificationPreviewSchema.parse(
      (
        await world.admin.get(
          `/api/admin/notifications/preview?kind=extra&refId=${String(extra._id)}`,
        )
      ).body,
    );
    expect(preview.recipients).toBe(2);
    await notify(world, extra._id, 'extra');
    const sent = world.mail.sent as MailMessage[];
    expect(sent.map((m) => m.to).sort()).toEqual([
      'apuntada0@ejemplo.com',
      'apuntada1@ejemplo.com',
    ]);
    for (const message of sent) {
      expect(message.subject).toBe('Hay un capítulo extra nuevo de [PLACEHOLDER] Libro 1');
      for (const part of [message.subject, message.html, message.text]) {
        expect(part).not.toContain('El secreto de la torre');
        expect(part).not.toContain('Texto protegido');
      }
      expect(message.text).toContain('/panel/libros/libro-1/extras');
    }
  });
});

describe('lista y registros', () => {
  it('la lista muestra quién lo pidió y el progreso; los registros no llevan correos', async () => {
    const lines: string[] = [];
    const logger = pino(
      { level: 'info', redact: LOG_REDACTION },
      { write: (line: string) => void lines.push(line) },
    );
    const world = await staffWorld({ logger });
    await readers(2);
    const item = await post(world);
    await notify(world, item._id);
    const list = notificationListResponseSchema.parse(
      (await world.admin.get('/api/admin/notifications').expect(200)).body,
    );
    expect(list.jobs).toHaveLength(1);
    expect(list.jobs[0]).toMatchObject({
      kind: 'post',
      status: 'done',
      createdBy: { name: 'Persona de Prueba' },
    });
    const log = lines.join('\n');
    expect(log).toContain('Lote de avisos por correo enviado');
    expect(log).not.toContain('apuntada0@ejemplo.com');
  });
});
