import {
  accessTokenListResponseSchema,
  accessTokenResponseSchema,
  apiErrorSchema,
  progressResponseSchema,
  redeemAccessResponseSchema,
  resolveAccessResponseSchema,
} from '@libro/shared';
import { Types } from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, maskAccessToken } from '../app.js';
import { parseEnv } from '../config/env.js';
import { buildAccessToken } from '../lib/accessToken.js';
import { AccessToken } from '../models/AccessToken.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { UserProgress } from '../models/UserProgress.js';
import { staffWorld } from '../test-utils/admin.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { decodePdfQr } from '../test-utils/qrDecode.js';
import { playQuizToEnd } from '../test-utils/quizPlay.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const env = parseEnv({ NODE_ENV: 'test' });
const SECRET = env.ACCESS_TOKEN_SECRET;
const tokenFor = (id: string) => buildAccessToken(id, SECRET);
const GENERIC = { error: { code: 'TOKEN_INVALID', message: 'Este código no es válido' } };

async function world(options: Parameters<typeof staffWorld>[0] = {}) {
  const w = await staffWorld({ env: { REQUIRE_QR_UNLOCK: 'true' }, ...options });
  const book = await createBook();
  const quiz1 = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: '[PLACEHOLDER] Quiz 1' }),
    publishedBy: w.adminUser._id,
  });
  const quiz2 = await createQuiz({
    bookId: book._id,
    order: 2,
    content: simpleContent({ title: '[PLACEHOLDER] Quiz 2' }),
    publishedBy: w.adminUser._id,
  });
  const create = async (quizId: string) =>
    accessTokenResponseSchema.parse(
      (
        await w.admin
          .post('/api/admin/access-tokens')
          .send({ kind: 'quiz', refId: quizId })
          .expect(201)
      ).body,
    );
  return { ...w, book, quiz1, quiz2, create };
}

describe('permisos de /api/admin/access-tokens (solo administradoras)', () => {
  it('sin sesión 401; lectora 403; EDITORA 403; ADMIN permitida', async () => {
    const { app, reader, editor, admin, quiz1 } = await world();
    const body = { kind: 'quiz', refId: quiz1._id.toString() };
    await request(app).get('/api/admin/access-tokens').expect(401);
    for (const agent of [reader, editor]) {
      expect((await agent.get('/api/admin/access-tokens')).status).toBe(403);
      expect((await agent.post('/api/admin/access-tokens').send(body)).status).toBe(403);
      expect(
        (await agent.post('/api/admin/access-tokens/670000000000000000000001/revoke').send({}))
          .status,
      ).toBe(403);
      expect(
        (await agent.get('/api/admin/access-tokens/670000000000000000000001/qr.pdf')).status,
      ).toBe(403);
    }
    expect(await AccessToken.countDocuments()).toBe(0);
    await admin.get('/api/admin/access-tokens').expect(200);
    await admin.post('/api/admin/access-tokens').send(body).expect(201);
  });
});

describe('crear, listar, revocar y rotar', () => {
  it('crea un QR por quiz; en la BD solo queda el hash (no el token ni su firma)', async () => {
    const { create, quiz1, adminUser } = await world();
    const created = await create(quiz1._id.toString());
    expect(created).toMatchObject({
      status: 'active',
      redeemCount: 0,
      target: { kind: 'quiz', refId: quiz1._id.toString() },
    });
    expect(created.label).toBe('[PLACEHOLDER] Libro 1 — Quiz 1: [PLACEHOLDER] Quiz 1');
    const stored = await AccessToken.findById(created.id).lean();
    const token = tokenFor(created.id);
    expect(stored?.tokenHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token.split('.')[1]);
    expect(stored?.createdBy.toString()).toBe(adminUser._id.toString());
  });

  it('un segundo QR activo para el mismo quiz responde 409; el del juego se rechaza hasta la fase 10; quiz inexistente 404', async () => {
    const { admin, create, quiz1 } = await world();
    await create(quiz1._id.toString());
    const dup = await admin
      .post('/api/admin/access-tokens')
      .send({ kind: 'quiz', refId: quiz1._id.toString() });
    expect(dup.status).toBe(409);
    expect(apiErrorSchema.parse(dup.body).error.code).toBe('CONFLICT');
    expect(
      (
        await admin
          .post('/api/admin/access-tokens')
          .send({ kind: 'game', refId: quiz1._id.toString() })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin
          .post('/api/admin/access-tokens')
          .send({ kind: 'quiz', refId: '670000000000000000000099' })
      ).status,
    ).toBe(404);
    expect(
      (await admin.post('/api/admin/access-tokens').send({ kind: 'quiz', refId: 'no' })).status,
    ).toBe(400);
    expect(await AccessToken.countDocuments()).toBe(1);
  });

  it('lista (filtrable por libro) del más nuevo al más viejo', async () => {
    const { admin, create, quiz1, quiz2, book } = await world();
    await create(quiz1._id.toString());
    await create(quiz2._id.toString());
    const all = accessTokenListResponseSchema.parse(
      (await admin.get('/api/admin/access-tokens').expect(200)).body,
    );
    expect(all.tokens.map((t) => t.target.refId)).toEqual([
      quiz2._id.toString(),
      quiz1._id.toString(),
    ]);
    const other = await createBook({ slug: 'otro' });
    const none = accessTokenListResponseSchema.parse(
      (
        await admin
          .get('/api/admin/access-tokens')
          .query({ bookId: other._id.toString() })
          .expect(200)
      ).body,
    );
    expect(none.tokens).toEqual([]);
    const mine = accessTokenListResponseSchema.parse(
      (
        await admin
          .get('/api/admin/access-tokens')
          .query({ bookId: book._id.toString() })
          .expect(200)
      ).body,
    );
    expect(mine.tokens).toHaveLength(2);
  });

  it('revocar libera el lugar (se puede crear otro), no se revoca dos veces y 404 si no existe', async () => {
    const { admin, create, quiz1 } = await world();
    const first = await create(quiz1._id.toString());
    const revoked = accessTokenResponseSchema.parse(
      (
        await admin
          .post(`/api/admin/access-tokens/${first.id}/revoke`)
          .send({ reason: 'Se imprimió mal' })
          .expect(200)
      ).body,
    );
    expect(revoked).toMatchObject({ status: 'revoked', revokedReason: 'Se imprimió mal' });
    expect((await admin.post(`/api/admin/access-tokens/${first.id}/revoke`).send({})).status).toBe(
      409,
    );
    expect(
      (await admin.post('/api/admin/access-tokens/670000000000000000000099/revoke').send({}))
        .status,
    ).toBe(404);
    const second = await create(quiz1._id.toString());
    expect(second.id).not.toBe(first.id);
  });

  it('rotar: el anterior queda revocado y enlazado, el nuevo sirve y el viejo ya no se puede canjear', async () => {
    const { admin, reader, create, quiz1 } = await world();
    const first = await create(quiz1._id.toString());
    const rotated = accessTokenResponseSchema.parse(
      (await admin.post(`/api/admin/access-tokens/${first.id}/rotate`).expect(201)).body,
    );
    expect(rotated.status).toBe('active');
    expect(rotated.id).not.toBe(first.id);
    const old = await AccessToken.findById(first.id).lean();
    expect(old).toMatchObject({ status: 'revoked', revokedReason: 'Rotado' });
    expect(old?.replacedBy?.toString()).toBe(rotated.id);

    expect(
      (await reader.post('/api/access/redeem').send({ token: tokenFor(first.id) })).status,
    ).toBe(400);
    await reader
      .post('/api/access/redeem')
      .send({ token: tokenFor(rotated.id) })
      .expect(200);
    expect((await admin.post(`/api/admin/access-tokens/${first.id}/rotate`)).status).toBe(409);
  });
});

describe('descarga del QR (SVG y PDF vectoriales)', () => {
  it('el PDF decodifica a la URL del token, el SVG es vectorial y descargar dos veces da lo mismo', async () => {
    const { admin, create, quiz1 } = await world();
    const created = await create(quiz1._id.toString());
    const expected = `${env.APP_URL}/u/${tokenFor(created.id)}`;

    const get = (format: 'pdf' | 'svg') =>
      admin
        .get(`/api/admin/access-tokens/${created.id}/qr.${format}`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });

    const pdfA = await get('pdf');
    const pdfB = await get('pdf');
    expect(pdfA.status).toBe(200);
    expect(pdfA.headers['content-type']).toBe('application/pdf');
    expect(pdfA.headers['cache-control']).toBe('no-store');
    expect(pdfA.headers['content-disposition']).toMatch(
      /^attachment; filename="qr-[0-9a-f]{24}\.pdf"$/,
    );
    expect((pdfA.body as Buffer).equals(pdfB.body as Buffer)).toBe(true);
    expect((pdfA.body as Buffer).toString('latin1', 0, 5)).toBe('%PDF-');
    expect(decodePdfQr(pdfA.body as Buffer)).toBe(expected);

    const svgA = await get('svg');
    const svgB = await get('svg');
    expect(svgA.headers['content-type']).toContain('image/svg+xml');
    expect((svgA.body as Buffer).equals(svgB.body as Buffer)).toBe(true);
    expect((svgA.body as Buffer).toString()).not.toMatch(/<image|<script/);
  });

  it('escanear el QR descargado (leído con un lector independiente) desbloquea el quiz en la cuenta', async () => {
    const { app, admin, reader, create, quiz1 } = await world();
    const created = await create(quiz1._id.toString());
    const pdf = await admin
      .get(`/api/admin/access-tokens/${created.id}/qr.pdf`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    const scanned = decodePdfQr(pdf.body as Buffer);
    expect(scanned).toBeDefined();
    const token = new URL(scanned ?? '').pathname.replace('/u/', '');

    expect((await reader.get(`/api/quizzes/${quiz1._id.toString()}`)).status).toBe(403);
    await request(app).get(`/api/access/resolve/${token}`).expect(200);
    await reader.post('/api/access/redeem').send({ token }).expect(200);
    await reader.get(`/api/quizzes/${quiz1._id.toString()}`).expect(200);
  });

  it('un código revocado no se puede descargar (409) y uno inexistente da 404', async () => {
    const { admin, create, quiz1 } = await world();
    const created = await create(quiz1._id.toString());
    await admin.post(`/api/admin/access-tokens/${created.id}/revoke`).send({}).expect(200);
    expect((await admin.get(`/api/admin/access-tokens/${created.id}/qr.pdf`)).status).toBe(409);
    expect((await admin.get(`/api/admin/access-tokens/${created.id}/qr.svg`)).status).toBe(409);
    expect(
      (await admin.get('/api/admin/access-tokens/670000000000000000000099/qr.svg')).status,
    ).toBe(404);
  });
});

describe('GET /api/access/resolve/:token (público y mínimo)', () => {
  it('sin sesión devuelve solo libro, tipo y nombre de la experiencia (nada protegido) y no se guarda en caché', async () => {
    const { app, create, quiz1 } = await world();
    const created = await create(quiz1._id.toString());
    const res = await request(app)
      .get(`/api/access/resolve/${tokenFor(created.id)}`)
      .expect(200);
    expect(resolveAccessResponseSchema.parse(res.body)).toEqual({
      valid: true,
      bookTitle: '[PLACEHOLDER] Libro 1',
      kind: 'quiz',
      title: '[PLACEHOLDER] Quiz 1',
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toMatch(/pregunta|resultKey|stages|instructions/i);
  });

  it('TODO código que no sirve responde EXACTAMENTE igual: mal formado, firma alterada, desconocido, revocado y sin publicar', async () => {
    const { app, admin, create, quiz1, quiz2, book } = await world();
    const good = await create(quiz1._id.toString());
    const revoked = await create(quiz2._id.toString());
    await admin.post(`/api/admin/access-tokens/${revoked.id}/revoke`).send({}).expect(200);

    const [id, signature] = tokenFor(good.id).split('.') as [string, string];
    const forged = `${id}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    // Firma auténtica pero para un id que no existe en la BD.
    const unknown = tokenFor(new Types.ObjectId().toString());
    const unpublished = await createQuiz({ bookId: book._id, order: 3, content: simpleContent() }); // borrador
    const draftToken = await admin
      .post('/api/admin/access-tokens')
      .send({ kind: 'quiz', refId: unpublished._id.toString() });
    const draftId = accessTokenResponseSchema.parse(draftToken.body).id;

    const bad = [
      'basura',
      'a.b',
      forged,
      unknown,
      tokenFor(revoked.id),
      tokenFor(draftId),
      `${id}.`,
      'x'.repeat(250),
    ];
    const responses = await Promise.all(
      bad.map((token) => request(app).get(`/api/access/resolve/${encodeURIComponent(token)}`)),
    );
    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual(GENERIC);
    }
    // Un quiz que se archiva después también deja de servir, con el mismo mensaje.
    await Quiz.updateOne({ _id: quiz1._id }, { $set: { status: 'archived' } });
    const archived = await request(app).get(`/api/access/resolve/${tokenFor(good.id)}`);
    expect([archived.status, archived.body]).toEqual([400, GENERIC]);
    await Quiz.updateOne({ _id: quiz1._id }, { $set: { status: 'published' } });
    await Book.updateOne({ _id: book._id }, { $set: { status: 'draft' } });
    const draftBook = await request(app).get(`/api/access/resolve/${tokenFor(good.id)}`);
    expect([draftBook.status, draftBook.body]).toEqual([400, GENERIC]);
  });

  it('tiene límite por IP (429)', async () => {
    const { app } = await world({ limits: { accessResolve: { windowMs: 60_000, limit: 2 } } });
    for (let i = 0; i < 2; i += 1) await request(app).get('/api/access/resolve/basura').expect(400);
    expect((await request(app).get('/api/access/resolve/basura')).status).toBe(429);
  });
});

describe('POST /api/access/redeem', () => {
  it('exige sesión y valida el cuerpo', async () => {
    const { app, reader, create, quiz1 } = await world();
    const created = await create(quiz1._id.toString());
    await request(app)
      .post('/api/access/redeem')
      .send({ token: tokenFor(created.id) })
      .expect(401);
    expect((await reader.post('/api/access/redeem').send({})).status).toBe(400);
    expect((await reader.post('/api/access/redeem').send({ token: '' })).status).toBe(400);
  });

  it('desbloquea el quiz en la cuenta y es idempotente (canjear dos veces no duplica nada)', async () => {
    const { reader, create, quiz1, book } = await world();
    const created = await create(quiz1._id.toString());
    const url = `/api/quizzes/${quiz1._id.toString()}`;
    // Sin canjear: 403 sin contenido aunque no falte ningún prerrequisito.
    const before = await reader.get(url);
    expect(before.status).toBe(403);
    expect(apiErrorSchema.parse(before.body).error.code).toBe('NOT_UNLOCKED');

    const first = redeemAccessResponseSchema.parse(
      (
        await reader
          .post('/api/access/redeem')
          .send({ token: tokenFor(created.id) })
          .expect(200)
      ).body,
    );
    expect(first).toMatchObject({
      kind: 'quiz',
      refId: quiz1._id.toString(),
      alreadyUnlocked: false,
    });
    const again = redeemAccessResponseSchema.parse(
      (
        await reader
          .post('/api/access/redeem')
          .send({ token: tokenFor(created.id) })
          .expect(200)
      ).body,
    );
    expect(again.alreadyUnlocked).toBe(true);

    await reader.get(url).expect(200);
    const progress = await UserProgress.find({ bookId: book._id }).lean();
    expect(progress).toHaveLength(1);
    expect(progress[0]?.unlocked).toHaveLength(1);
    expect(progress[0]?.unlocked[0]?.accessTokenId?.toString()).toBe(created.id);
    const stored = await AccessToken.findById(created.id).lean();
    expect(stored?.redeemCount).toBe(1); // solo cuenta el primer desbloqueo
    expect(stored?.lastRedeemedAt).toBeInstanceOf(Date);
  });

  it('el código solo abre ESE quiz y no se salta la progresión: el quiz 2 sigue cerrado hasta completar el 1', async () => {
    const { reader, create, quiz1, quiz2, book } = await world();
    const t1 = await create(quiz1._id.toString());
    const t2 = await create(quiz2._id.toString());
    await reader
      .post('/api/access/redeem')
      .send({ token: tokenFor(t2.id) })
      .expect(200);
    const status = async () =>
      progressResponseSchema
        .parse(
          (await reader.get('/api/me/progress').query({ bookId: book._id.toString() }).expect(200))
            .body,
        )
        .experiences.map((e) => e.status);

    expect((await reader.get(`/api/quizzes/${quiz2._id.toString()}`)).status).toBe(403); // falta el 1.º
    expect(await status()).toEqual(['locked', 'locked']);

    await reader
      .post('/api/access/redeem')
      .send({ token: tokenFor(t1.id) })
      .expect(200);
    expect(await status()).toEqual(['available', 'locked']);
    await playQuizToEnd(reader, quiz1._id.toString());
    expect(await status()).toEqual(['completed', 'available']);
    await reader.get(`/api/quizzes/${quiz2._id.toString()}`).expect(200);
  });

  it('un código inválido responde igual que en resolve, sin pistas', async () => {
    const { reader, create, quiz1, admin } = await world();
    const created = await create(quiz1._id.toString());
    await admin.post(`/api/admin/access-tokens/${created.id}/revoke`).send({}).expect(200);
    for (const token of [
      'basura',
      tokenFor(created.id),
      tokenFor(new Types.ObjectId().toString()),
    ]) {
      const res = await reader.post('/api/access/redeem').send({ token });
      expect([res.status, res.body]).toEqual([400, GENERIC]);
    }
    expect(await UserProgress.countDocuments()).toBe(0);
  });

  it('revocar impide nuevos canjes pero conserva el acceso ya concedido', async () => {
    const { app, reader, admin, create, quiz1 } = await world();
    const created = await create(quiz1._id.toString());
    await reader
      .post('/api/access/redeem')
      .send({ token: tokenFor(created.id) })
      .expect(200);
    await admin.post(`/api/admin/access-tokens/${created.id}/revoke`).send({}).expect(200);
    await reader.get(`/api/quizzes/${quiz1._id.toString()}`).expect(200); // ya lo tenía

    await createUser({ email: 'otra@ejemplo.com' });
    const other = await loginAgent(app, 'otra@ejemplo.com');
    expect(
      (await other.post('/api/access/redeem').send({ token: tokenFor(created.id) })).status,
    ).toBe(400);
  });

  it('el desbloqueo es de la CUENTA: otra persona no lo hereda', async () => {
    const { app, reader, create, quiz1 } = await world();
    const created = await create(quiz1._id.toString());
    await reader
      .post('/api/access/redeem')
      .send({ token: tokenFor(created.id) })
      .expect(200);
    await createUser({ email: 'otra@ejemplo.com' });
    const other = await loginAgent(app, 'otra@ejemplo.com');
    expect((await other.get(`/api/quizzes/${quiz1._id.toString()}`)).status).toBe(403);
  });

  it('dos canjes simultáneos dejan un solo desbloqueo', async () => {
    const { reader, create, quiz1, book } = await world();
    const created = await create(quiz1._id.toString());
    const results = await Promise.all(
      [1, 2, 3].map(() => reader.post('/api/access/redeem').send({ token: tokenFor(created.id) })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const progress = await UserProgress.findOne({ bookId: book._id }).lean();
    expect(progress?.unlocked).toHaveLength(1);
    expect((await AccessToken.findById(created.id).lean())?.redeemCount).toBe(1);
  });

  it('tiene límite por IP (429)', async () => {
    const { reader } = await world({ limits: { accessRedeem: { windowMs: 60_000, limit: 2 } } });
    for (let i = 0; i < 2; i += 1)
      await reader.post('/api/access/redeem').send({ token: 'basura' }).expect(400);
    expect((await reader.post('/api/access/redeem').send({ token: 'basura' })).status).toBe(429);
  });

  it('las editoras y administradoras prueban sin QR (siguen jugando en modo prueba)', async () => {
    const { editor, quiz2 } = await world();
    await editor.get(`/api/quizzes/${quiz2._id.toString()}`).expect(200);
  });
});

describe('el token del QR no queda en los logs', () => {
  it('maskAccessToken oculta el token en la URL de resolve y no toca otras URLs', () => {
    expect(maskAccessToken('/api/access/resolve/abc.def?x=1')).toBe(
      '/api/access/resolve/[REDACTADO]?x=1',
    );
    expect(maskAccessToken('/api/access/resolve/abc.def')).toBe('/api/access/resolve/[REDACTADO]');
    expect(maskAccessToken('/api/quizzes/123')).toBe('/api/quizzes/123');
    expect(maskAccessToken(undefined)).toBeUndefined();
  });

  it('una petición real a /access/resolve/<token> se registra sin el token', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const app = createApp({ env: parseEnv({ NODE_ENV: 'test' }), logger, isDbUp: () => true });
    const secretLookingToken = tokenFor(new Types.ObjectId().toString());
    await request(app).get(`/api/access/resolve/${secretLookingToken}`).expect(400);
    const log = lines.join('\n');
    expect(log).toContain('/api/access/resolve/[REDACTADO]');
    expect(log).not.toContain(secretLookingToken);
    expect(log).not.toContain(secretLookingToken.split('.')[1]);
  });
});
