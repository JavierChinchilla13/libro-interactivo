import {
  NOTIFICATION_BATCH_SIZE,
  type NotificationJob as NotificationJobView,
  type NotificationKind,
  type NotificationPreview,
  type NotificationPreviewQuery,
  type NotificationTarget,
} from '@libro/shared';
import { Types } from 'mongoose';
import type { BackgroundTasks } from '../lib/background.js';
import type { Clock } from '../lib/clock.js';
import { randomToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { createUnsubscribeToken } from '../lib/unsubscribeToken.js';
import { Book } from '../models/Book.js';
import { Extra } from '../models/Extra.js';
import {
  NotificationDelivery,
  type NotificationDeliveryAttrs,
} from '../models/NotificationDelivery.js';
import { NotificationJob, type NotificationJobDoc } from '../models/NotificationJob.js';
import { Post } from '../models/Post.js';
import { ACTIVE_ACCOUNT, User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';
import {
  MailDeliveryError,
  sendMany,
  type MailMessage,
  type MailProvider,
} from '../providers/mail/MailProvider.js';
import { emailImageUrl, notificationEmail } from './email.templates.js';
import {
  estimateDays,
  nextUtcMidnight,
  nextUtcMonth,
  type MailQuotaService,
} from './mailQuota.service.js';

/** Cuánto dura la reserva de un aviso por el trabajador (se renueva en cada lote). */
export const NOTIFICATION_LEASE_MS = 2 * 60_000;
/** Un lote en `sending` más viejo que esto se da por cortado y se reintenta con la misma clave. */
export const STALE_BATCH_MS = 5 * 60_000;
/** Resend recuerda la clave de idempotencia 24 h: pasado esto, reintentar podría duplicar; se marca «desconocido». */
export const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60_000;
/** Pausa ante un error temporal del proveedor (red o error del servidor). */
export const TEMPORARY_PAUSE_MS = 5 * 60_000;
/** Las filas por destinatario se borran estos días después de terminar el aviso. */
export const DELIVERY_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

export interface NotificationDeps {
  clock: Clock;
  /** El proveedor con contador (los lotes cuentan como avisos). */
  mail: MailProvider;
  quota: MailQuotaService;
  tasks: BackgroundTasks;
  logger: Logger;
  /** Dirección pública del sitio (enlaces del correo, sin barra final). */
  appUrl: string;
  unsubscribeSecret: string;
  /** Remitente de los avisos (`MAIL_FROM_NEWS`); sin él, el del proveedor. */
  fromNews?: string | undefined;
}

interface Built {
  available: boolean;
  reason?: string;
  notBefore: Date;
  bookId?: Types.ObjectId | undefined;
  content: {
    subject: string;
    title: string;
    summary?: string | undefined;
    imageUrl?: string | undefined;
    imageAlt?: string | undefined;
    path: string;
  };
}

/** Correos y nombres fuera de los mensajes de error que se guardan (el proveedor a veces los repite). */
function scrub(message: string): string {
  return message.replace(/[^\s<>"'@]+@[^\s<>"'@]+/g, '[correo]').slice(0, 300);
}

/**
 * Avisos por correo a los apuntados a las novedades. Un aviso por elemento publicado; la lista de destinatarios se
 * fija al pedirlo y se envía por lotes respetando el cupo del día y del mes (los transaccionales siempre tienen
 * prioridad). La cola vive en la base: el trabajador la retoma al arrancar, cada pocos minutos y al pedir o mirar un
 * aviso.
 */
export function createNotificationService(deps: NotificationDeps) {
  const { clock } = deps;
  let running: Promise<void> | null = null;

  async function build(target: NotificationTarget): Promise<Built> {
    const now = clock();
    if (target.kind === 'post') {
      const post = await Post.findById(target.refId).lean();
      if (!post) throw new AppError('NOT_FOUND', 'No encontramos esa actualización');
      const thumbnail = post.thumbnail as { url?: string; alt?: string } | undefined;
      return {
        available: post.status === 'published',
        ...(post.status === 'published'
          ? {}
          : { reason: 'Publica la actualización para poder avisar por correo.' }),
        notBefore: post.publishedAt && post.publishedAt > now ? post.publishedAt : now,
        bookId: post.bookId ?? undefined,
        content: {
          subject: `Novedad en Universo Memorias: ${post.title}`,
          title: post.title,
          summary: post.excerpt?.slice(0, 280) || undefined,
          imageUrl: thumbnail?.url ? emailImageUrl(thumbnail.url) : undefined,
          imageAlt: thumbnail?.alt,
          path: `/actualizaciones/${post.slug}`,
        },
      };
    }
    const extra = await Extra.findById(target.refId).lean();
    if (!extra) throw new AppError('NOT_FOUND', 'No encontramos ese capítulo extra');
    const book = await Book.findById(extra.bookId).lean();
    if (!book) throw new AppError('NOT_FOUND', 'No encontramos el libro de ese capítulo extra');
    const cover = book.cover as { url?: string; alt?: string } | undefined;
    // Decisión P8: del extra no va el título ni nada de su contenido; solo que hay uno nuevo y de qué libro.
    const subject = `Hay un capítulo extra nuevo de ${book.title}`;
    return {
      available: extra.status === 'published',
      ...(extra.status === 'published'
        ? {}
        : { reason: 'Publica el capítulo extra para poder avisar por correo.' }),
      notBefore: now,
      bookId: extra.bookId,
      content: {
        subject,
        title: subject,
        summary: 'Ya puedes leerlo en tu panel de lector, en la sección de extras del libro.',
        imageUrl: cover?.url ? emailImageUrl(cover.url) : undefined,
        imageAlt: cover?.alt,
        path: `/panel/libros/${book.slug}/extras`,
      },
    };
  }

  /**
   * Apuntados activos; de un extra, solo quienes ya terminaron ese libro (decisión P8). Activo = no desactivado: una
   * cuenta sin el campo `status` cuenta como activa (Mongoose se lo pone al leerla, y así la ve su cuenta y el
   * ingreso), y esta consulta directa tiene que coincidir con eso.
   */
  async function recipientIds(
    kind: NotificationKind,
    bookId?: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const filter: Record<string, unknown> = {
      ...ACTIVE_ACCOUNT,
      'newsletter.status': 'subscribed',
    };
    if (kind === 'extra') {
      // Sin libro no hay a quién avisar (nunca «cualquier libro»).
      if (!bookId) return [];
      const completed = await UserProgress.find({
        bookId,
        bookCompletedAt: { $exists: true, $ne: null },
      }).distinct('userId');
      filter['_id'] = { $in: completed };
    }
    const users = await User.find(filter).select('_id').lean();
    return users.map((user) => user._id);
  }

  async function view(job: NotificationJobDoc): Promise<NotificationJobView> {
    const author = await User.findById(job.createdBy).select('name').lean();
    const { recipients, sent, skipped, failed } = job.totals;
    return {
      id: String(job._id),
      kind: job.kind,
      refId: String(job.refId),
      subject: job.content.subject,
      status: job.status,
      createdAt: (job.createdAt as Date).toISOString(),
      createdBy: author ? { id: String(author._id), name: author.name } : null,
      notBefore: job.notBefore.toISOString(),
      ...(job.pausedUntil && job.pausedUntil > clock()
        ? { pausedUntil: job.pausedUntil.toISOString() }
        : {}),
      ...(job.finishedAt ? { finishedAt: job.finishedAt.toISOString() } : {}),
      totals: {
        recipients,
        sent,
        skipped,
        failed,
        pending: Math.max(0, recipients - sent - skipped - failed),
      },
    };
  }

  async function finish(job: NotificationJobDoc, status: 'done' | 'cancelled'): Promise<void> {
    const now = clock();
    await NotificationJob.updateOne(
      { _id: job._id },
      { $set: { status, finishedAt: now }, $unset: { leaseUntil: 1, pausedUntil: 1 } },
    );
    await NotificationDelivery.updateMany(
      { jobId: job._id },
      { $set: { expireAt: new Date(now.getTime() + DELIVERY_RETENTION_DAYS * DAY_MS) } },
    );
  }

  async function pause(jobId: Types.ObjectId, until: Date, error?: string): Promise<void> {
    await NotificationJob.updateOne(
      { _id: jobId },
      {
        $set: { pausedUntil: until, ...(error ? { lastError: scrub(error) } : {}) },
        $unset: { leaseUntil: 1 },
      },
    );
  }

  /** Arma los correos de un lote. Quienes ya no están apuntados o activos se saltan. */
  async function messagesFor(
    job: NotificationJobDoc,
    rows: Array<Pick<NotificationDeliveryAttrs, 'userId'> & { _id: Types.ObjectId }>,
  ) {
    const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } })
      .select('email name status newsletter')
      .lean();
    const byId = new Map(users.map((user) => [String(user._id), user]));
    const send: Array<{ rowId: Types.ObjectId; message: MailMessage }> = [];
    const skip: Array<{ rowId: Types.ObjectId; reason: string }> = [];
    const host = new URL(deps.appUrl).host;
    for (const row of rows) {
      const user = byId.get(String(row.userId));
      if (!user || user.status === 'disabled') {
        skip.push({ rowId: row._id, reason: 'inactive' });
        continue;
      }
      if (user.newsletter?.status !== 'subscribed') {
        skip.push({ rowId: row._id, reason: 'unsubscribed' });
        continue;
      }
      const token = createUnsubscribeToken(String(user._id), deps.unsubscribeSecret);
      const rendered = notificationEmail({
        name: user.name,
        subject: job.content.subject,
        title: job.content.title,
        summary: job.content.summary ?? undefined,
        imageUrl: job.content.imageUrl ?? undefined,
        imageAlt: job.content.imageAlt ?? undefined,
        link: `${deps.appUrl}${job.content.path}`,
        unsubscribeUrl: `${deps.appUrl}/baja?t=${token}`,
      });
      send.push({
        rowId: row._id,
        message: {
          to: user.email,
          ...rendered,
          ...(deps.fromNews ? { from: deps.fromNews } : {}),
          headers: {
            // Baja en un clic desde el propio cliente de correo (RFC 8058): POST a esta dirección, sin sesión.
            'List-Unsubscribe': `<${deps.appUrl}/api/newsletter/unsubscribe?t=${token}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'List-Id': `Novedades de Universo Memorias <novedades.${host}>`,
          },
        },
      });
    }
    return { send, skip };
  }

  /**
   * Trabaja un aviso reservado: lotes de hasta 100 mientras quede cupo hoy. Devuelve cuando termina, se pausa o no
   * queda nada que hacer por ahora.
   */
  async function work(job: NotificationJobDoc): Promise<void> {
    for (;;) {
      const now = clock();
      const fresh = await NotificationJob.findOneAndUpdate(
        { _id: job._id, status: 'sending' },
        { $set: { leaseUntil: new Date(now.getTime() + NOTIFICATION_LEASE_MS) } },
        { returnDocument: 'after' },
      );
      // Cancelado mientras tanto.
      if (!fresh) return;

      // 1. Un lote que se cortó a mitad (el proceso se cayó): se reintenta con su clave, o se da por desconocido.
      const stale = await NotificationDelivery.findOne({
        jobId: job._id,
        status: 'sending',
        batchStartedAt: { $lte: new Date(now.getTime() - STALE_BATCH_MS) },
      }).lean();
      let batchKey: string;
      let rows: Array<{ _id: Types.ObjectId; userId: Types.ObjectId }>;
      if (stale?.batchKey) {
        batchKey = stale.batchKey;
        if (
          stale.batchStartedAt &&
          now.getTime() - stale.batchStartedAt.getTime() > IDEMPOTENCY_WINDOW_MS
        ) {
          const lost = await NotificationDelivery.updateMany(
            { jobId: job._id, batchKey, status: 'sending' },
            { $set: { status: 'failed', reason: 'unknown' } },
          );
          await NotificationJob.updateOne(
            { _id: job._id },
            { $inc: { 'totals.failed': lost.modifiedCount } },
          );
          continue;
        }
        rows = await NotificationDelivery.find({ jobId: job._id, batchKey, status: 'sending' })
          .select('_id userId')
          .lean();
      } else {
        // 2. Un lote nuevo, si queda cupo hoy.
        const quota = await deps.quota.quota();
        if (quota.todayLeft <= 0) {
          await pause(job._id, quota.monthLeft <= 0 ? nextUtcMonth(now) : nextUtcMidnight(now));
          return;
        }
        const pending = await NotificationDelivery.find({ jobId: job._id, status: 'pending' })
          .sort({ _id: 1 })
          .limit(Math.min(quota.todayLeft, NOTIFICATION_BATCH_SIZE))
          .select('_id')
          .lean();
        if (pending.length === 0) {
          const inFlight = await NotificationDelivery.exists({ jobId: job._id, status: 'sending' });
          if (!inFlight) await finish(fresh, 'done');
          // Queda un lote en curso de otra pasada: se espera a que pueda darse por cortado (no se vuelve a tomar ya).
          else await pause(job._id, new Date(now.getTime() + STALE_BATCH_MS));
          return;
        }
        batchKey = randomToken(12);
        await NotificationDelivery.updateMany(
          { _id: { $in: pending.map((row) => row._id) }, status: 'pending' },
          { $set: { status: 'sending', batchKey, batchStartedAt: now } },
        );
        rows = await NotificationDelivery.find({ jobId: job._id, batchKey, status: 'sending' })
          .select('_id userId')
          .lean();
      }

      const { send, skip } = await messagesFor(fresh, rows);
      if (skip.length > 0) {
        for (const item of skip) {
          await NotificationDelivery.updateOne(
            { _id: item.rowId, status: 'sending' },
            { $set: { status: 'skipped', reason: item.reason }, $unset: { batchKey: 1 } },
          );
        }
        await NotificationJob.updateOne(
          { _id: job._id },
          { $inc: { 'totals.skipped': skip.length } },
        );
      }
      if (send.length === 0) continue;

      const ids = send.map((item) => item.rowId);
      try {
        await sendMany(
          deps.mail,
          send.map((item) => item.message),
          { idempotencyKey: `${String(job._id)}:${batchKey}` },
        );
      } catch (error) {
        const back = () =>
          NotificationDelivery.updateMany(
            { _id: { $in: ids }, status: 'sending' },
            { $set: { status: 'pending' }, $unset: { batchKey: 1, batchStartedAt: 1 } },
          );
        if (error instanceof MailDeliveryError) {
          if (error.reason === 'daily_quota' || error.reason === 'monthly_quota') {
            await back();
            await pause(
              job._id,
              error.reason === 'monthly_quota' ? nextUtcMonth(now) : nextUtcMidnight(now),
              error.message,
            );
            return;
          }
          if (error.reason === 'rate_limit') {
            await back();
            await pause(job._id, new Date(now.getTime() + (error.retryAfterSeconds ?? 60) * 1000));
            return;
          }
          if (error.reason === 'network' || (error.status ?? 0) >= 500) {
            // No se sabe si salió: queda en `sending` y se reintenta más tarde con la misma clave.
            await pause(job._id, new Date(now.getTime() + TEMPORARY_PAUSE_MS), error.message);
            return;
          }
          // El proveedor rechazó el lote (datos no válidos): no se reintenta.
          const failed = await NotificationDelivery.updateMany(
            { _id: { $in: ids }, status: 'sending' },
            { $set: { status: 'failed', reason: 'rejected' }, $unset: { batchKey: 1 } },
          );
          await NotificationJob.updateOne(
            { _id: job._id },
            {
              $inc: { 'totals.failed': failed.modifiedCount },
              $set: { lastError: scrub(error.message) },
            },
          );
          continue;
        }
        await back();
        await pause(
          job._id,
          new Date(now.getTime() + TEMPORARY_PAUSE_MS),
          error instanceof Error ? error.message : String(error),
        );
        deps.logger.error(
          { jobId: String(job._id) },
          'Fallo inesperado al enviar un lote de avisos',
        );
        return;
      }
      const sent = await NotificationDelivery.updateMany(
        { _id: { $in: ids }, status: 'sending' },
        { $set: { status: 'sent', sentAt: clock() }, $unset: { batchKey: 1 } },
      );
      await NotificationJob.updateOne(
        { _id: job._id },
        { $inc: { 'totals.sent': sent.modifiedCount }, $unset: { lastError: 1 } },
      );
      deps.logger.info(
        { jobId: String(job._id), sent: sent.modifiedCount },
        'Lote de avisos por correo enviado',
      );
    }
  }

  /** Una pasada de la cola: toma los avisos listos uno por uno mientras haya cupo. */
  async function pass(): Promise<void> {
    for (;;) {
      const now = clock();
      const job = await NotificationJob.findOneAndUpdate(
        {
          status: { $in: ['queued', 'sending'] },
          notBefore: { $lte: now },
          $and: [
            {
              $or: [
                { pausedUntil: { $exists: false } },
                { pausedUntil: null },
                { pausedUntil: { $lte: now } },
              ],
            },
            {
              $or: [
                { leaseUntil: { $exists: false } },
                { leaseUntil: null },
                { leaseUntil: { $lte: now } },
              ],
            },
          ],
        },
        {
          $set: { status: 'sending', leaseUntil: new Date(now.getTime() + NOTIFICATION_LEASE_MS) },
          $unset: { pausedUntil: 1 },
        },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      );
      if (!job) return;
      await work(job);
      // Si este se pausó por cupo, los demás también esperarían: se corta la pasada.
      const after = await NotificationJob.findById(job._id).select('pausedUntil').lean();
      if (after?.pausedUntil && after.pausedUntil > clock()) {
        const quota = await deps.quota.quota();
        if (quota.todayLeft <= 0) return;
      }
    }
  }

  /** Una pasada de la cola (nunca dos a la vez en el mismo proceso). Devuelve cuando termina. */
  function tick(): Promise<void> {
    running ??= pass()
      .catch((error: unknown) => {
        deps.logger.error(
          { reason: error instanceof Error ? error.message : String(error) },
          'Falló una pasada de la cola de avisos',
        );
      })
      .finally(() => {
        running = null;
      });
    return running;
  }

  /** Lanza una pasada en segundo plano (al pedir o mirar un aviso). */
  function kick(): void {
    deps.tasks.run('notification-queue', tick);
  }

  return {
    tick,
    kick,

    async preview(query: NotificationPreviewQuery): Promise<NotificationPreview> {
      if (!query.refId) {
        // Aún no guardado: a cuántos lectores llegaría al publicarlo y el cupo.
        const quota = await deps.quota.quota();
        const recipients = (
          await recipientIds(
            query.kind,
            query.bookId ? new Types.ObjectId(query.bookId) : undefined,
          )
        ).length;
        return {
          available: true,
          recipients,
          quota,
          estimatedDays: estimateDays(quota, recipients),
          existing: null,
        };
      }
      const target: NotificationTarget = { kind: query.kind, refId: query.refId };
      const built = await build(target);
      const existing = await NotificationJob.findOne({ kind: target.kind, refId: target.refId });
      const quota = await deps.quota.quota();
      const recipients = built.available
        ? (await recipientIds(target.kind, built.bookId)).length
        : 0;
      return {
        available: built.available && !existing,
        ...(built.reason
          ? { reason: built.reason }
          : existing
            ? { reason: 'Este elemento ya se avisó por correo.' }
            : {}),
        recipients,
        quota,
        estimatedDays: estimateDays(quota, recipients),
        ...(built.notBefore > clock() ? { notBefore: built.notBefore.toISOString() } : {}),
        existing: existing ? await view(existing) : null,
      };
    },

    /**
     * Pide el aviso de un elemento publicado. Una sola vez por elemento: si ya existe (doble clic, otra persona a la
     * vez), devuelve el que hay (`created: false`). La lista de destinatarios se fija ahora; mientras se arma, el aviso
     * queda reservado para que el trabajador no lo tome a medias.
     */
    async create(
      actorId: string,
      target: NotificationTarget,
    ): Promise<{ job: NotificationJobView; created: boolean }> {
      const built = await build(target);
      if (!built.available) throw new AppError('CONFLICT', built.reason ?? 'No se puede avisar');
      const existing = await NotificationJob.findOne({ kind: target.kind, refId: target.refId });
      if (existing) return { job: await view(existing), created: false };
      const now = clock();
      let job: NotificationJobDoc;
      try {
        job = await NotificationJob.create({
          kind: target.kind,
          refId: new Types.ObjectId(target.refId),
          ...(built.bookId ? { bookId: built.bookId } : {}),
          createdBy: new Types.ObjectId(actorId),
          notBefore: built.notBefore,
          content: built.content,
          status: 'queued',
          leaseUntil: new Date(now.getTime() + NOTIFICATION_LEASE_MS),
        });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const winner = await NotificationJob.findOne({ kind: target.kind, refId: target.refId });
        if (!winner) throw error;
        return { job: await view(winner), created: false };
      }
      const ids = await recipientIds(target.kind, built.bookId);
      for (let i = 0; i < ids.length; i += 1000) {
        await NotificationDelivery.insertMany(
          ids.slice(i, i + 1000).map((userId) => ({ jobId: job._id, userId, status: 'pending' })),
          { ordered: false },
        );
      }
      await NotificationJob.updateOne(
        { _id: job._id },
        { $set: { 'totals.recipients': ids.length }, $unset: { leaseUntil: 1 } },
      );
      const ready = await NotificationJob.findById(job._id).orFail();
      if (ids.length === 0) await finish(ready, 'done');
      deps.logger.info(
        { jobId: String(job._id), kind: target.kind, recipients: ids.length },
        'Aviso por correo pedido',
      );
      kick();
      return { job: await view(await NotificationJob.findById(job._id).orFail()), created: true };
    },

    async list(): Promise<NotificationJobView[]> {
      const jobs = await NotificationJob.find().sort({ createdAt: -1 }).limit(50);
      // La pantalla de avisos se refresca sola: de paso despierta la cola (Render duerme el servicio sin visitas).
      if (jobs.some((job) => job.status === 'queued' || job.status === 'sending')) kick();
      return Promise.all(jobs.map((job) => view(job)));
    },

    async get(id: string): Promise<NotificationJobView> {
      const job = await NotificationJob.findById(id);
      if (!job) throw new AppError('NOT_FOUND', 'No encontramos ese aviso');
      kick();
      return view(job);
    },

    /** Cancela lo pendiente (lo ya enviado no se puede deshacer). Un aviso cancelado no se reanuda. */
    async cancel(id: string): Promise<NotificationJobView> {
      const job = await NotificationJob.findOneAndUpdate(
        { _id: id, status: { $in: ['queued', 'sending'] } },
        { $set: { status: 'cancelled', finishedAt: clock() }, $unset: { pausedUntil: 1 } },
        { returnDocument: 'after' },
      );
      if (!job) {
        if (!(await NotificationJob.exists({ _id: id }))) {
          throw new AppError('NOT_FOUND', 'No encontramos ese aviso');
        }
        throw new AppError('CONFLICT', 'Ese aviso ya terminó: no hay nada pendiente que cancelar.');
      }
      const skipped = await NotificationDelivery.updateMany(
        { jobId: job._id, status: 'pending' },
        { $set: { status: 'skipped', reason: 'cancelled' } },
      );
      await NotificationJob.updateOne(
        { _id: job._id },
        { $inc: { 'totals.skipped': skipped.modifiedCount }, $unset: { leaseUntil: 1 } },
      );
      await finish(job, 'cancelled');
      deps.logger.info({ jobId: String(job._id) }, 'Aviso por correo cancelado');
      return view(await NotificationJob.findById(job._id).orFail());
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
