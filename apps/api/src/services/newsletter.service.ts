import {
  LEGAL_VERSION,
  NEWSLETTER_MINOR_MESSAGE,
  canSubscribeToNewsletter,
  type NewsletterState,
} from '@libro/shared';
import type { Types } from 'mongoose';
import type { BackgroundTasks } from '../lib/background.js';
import { addDays, type Clock } from '../lib/clock.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { normalizeEmail } from '../lib/email.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { verifySvix, type SvixHeaders } from '../lib/svix.js';
import { verifyUnsubscribeToken } from '../lib/unsubscribeToken.js';
import { User, type UserDoc } from '../models/User.js';
import type { MailProvider } from '../providers/mail/MailProvider.js';
import { newsletterConfirmEmail } from './email.templates.js';

/** Cuánto vale el enlace de confirmación. */
export const NEWSLETTER_CONFIRM_TTL_DAYS = 7;
/** No se reenvía el correo de confirmación más de una vez en este plazo (aunque se apague y encienda la casilla). */
export const NEWSLETTER_CONFIRM_RESEND_MS = 10 * 60_000;

export type NewsletterSource = 'register' | 'google' | 'login' | 'account';
export type UnsubscribeVia = 'account' | 'link' | 'header' | 'bounce' | 'complaint';

export interface NewsletterDeps {
  clock: Clock;
  mail: MailProvider;
  tasks: BackgroundTasks;
  logger: Logger;
  /** Dirección pública del sitio (para el enlace de confirmación). */
  appUrl: string;
  unsubscribeSecret: string;
  /** Secreto del webhook de Resend; sin él, el webhook no existe (404). */
  webhookSecret?: string | undefined;
}

const NO_BIRTH_MESSAGE =
  'Tu cuenta no tiene fecha de nacimiento guardada: no podemos comprobar que tengas 18 años o más.';
const CONFIRM_INVALID = 'El enlace no es válido o ya caducó. Vuelve a apuntarte desde tu cuenta.';

function birthOf(user: UserDoc) {
  return user.birthYear && user.birthMonth
    ? { year: user.birthYear, month: user.birthMonth }
    : undefined;
}

/**
 * Altas, bajas y confirmación de los correos de novedades. El servidor decide quién puede apuntarse (mayor de 18 con
 * fecha de nacimiento guardada); quien no tiene el correo comprobado recibe primero un enlace y no queda apuntado hasta
 * abrirlo. Confirmar los avisos **no** marca el correo de la cuenta como comprobado: si otra persona creó la cuenta con
 * ese correo, el dueño del correo debe poder recuperarla igual (ver `claimUnverifiedAccount`).
 */
export function createNewsletterService(deps: NewsletterDeps) {
  const { clock } = deps;

  function stateOf(user: UserDoc): NewsletterState {
    const n = user.newsletter;
    const status = n?.status === 'subscribed' || n?.status === 'pending' ? n.status : 'none';
    const eligible = user.status === 'active' && canSubscribeToNewsletter(birthOf(user), clock());
    return {
      status,
      eligible,
      // Invitación única: nunca a quien ya se apuntó, pidió apuntarse o se dio de baja, ni a quien ya respondió.
      invitation: eligible && !n?.status && !n?.invitationAnsweredAt,
      ...(status === 'subscribed' && n?.subscribedAt
        ? { subscribedAt: n.subscribedAt.toISOString() }
        : {}),
      ...(status === 'pending' && n?.requestedAt
        ? { pendingSince: n.requestedAt.toISOString() }
        : {}),
    };
  }

  async function activeUser(userId: string | Types.ObjectId): Promise<UserDoc> {
    const user = await User.findById(userId);
    if (!user || user.status !== 'active') {
      throw new AppError('UNAUTHENTICATED', 'Debes iniciar sesión');
    }
    return user;
  }

  async function optIn(userId: string | Types.ObjectId, source: NewsletterSource) {
    const user = await activeUser(userId);
    const birth = birthOf(user);
    if (!birth) throw new AppError('VALIDATION', NO_BIRTH_MESSAGE);
    if (!canSubscribeToNewsletter(birth, clock())) {
      throw new AppError('VALIDATION', NEWSLETTER_MINOR_MESSAGE);
    }
    const current = user.newsletter?.status;
    if (current === 'subscribed') return stateOf(user);
    const now = clock();

    if (user.emailVerifiedAt) {
      // Correo comprobado (Google o recuperación de contraseña): queda apuntado al instante.
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            'newsletter.status': 'subscribed',
            'newsletter.requestedAt': now,
            'newsletter.subscribedAt': now,
            'newsletter.version': LEGAL_VERSION,
            'newsletter.source': source,
          },
          // Apuntarse por cualquier camino cuenta como responder a la invitación (se conserva la primera fecha).
          $min: { 'newsletter.invitationAnsweredAt': now },
          $unset: {
            'newsletter.confirmTokenHash': 1,
            'newsletter.confirmTokenExpiresAt': 1,
          },
        },
      );
      return stateOf(await activeUser(user._id));
    }

    // Sin correo comprobado: doble confirmación. No se reenvía si se pidió hace muy poco.
    const requestedAt = user.newsletter?.requestedAt;
    if (
      current === 'pending' &&
      requestedAt &&
      now.getTime() - requestedAt.getTime() < NEWSLETTER_CONFIRM_RESEND_MS
    ) {
      return stateOf(user);
    }
    const token = randomToken(32);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'newsletter.status': 'pending',
          'newsletter.requestedAt': now,
          'newsletter.version': LEGAL_VERSION,
          'newsletter.source': source,
          'newsletter.confirmTokenHash': sha256Hex(token),
          'newsletter.confirmTokenExpiresAt': addDays(now, NEWSLETTER_CONFIRM_TTL_DAYS),
        },
        $min: { 'newsletter.invitationAnsweredAt': now },
        $unset: { 'newsletter.subscribedAt': 1 },
      },
    );
    const link = `${deps.appUrl}/confirmar-novedades?t=${encodeURIComponent(token)}`;
    deps.tasks.run('newsletter-confirm-email', () =>
      deps.mail.send({
        to: user.email,
        ...newsletterConfirmEmail({
          name: user.name,
          link,
          ttlDays: NEWSLETTER_CONFIRM_TTL_DAYS,
        }),
      }),
    );
    return stateOf(await activeUser(user._id));
  }

  /** Da de baja (o cancela una alta pendiente). Idempotente; no hace nada si nunca se apuntó. */
  async function optOut(userId: string | Types.ObjectId, via: UnsubscribeVia): Promise<boolean> {
    const result = await User.updateOne(
      { _id: userId, 'newsletter.status': { $in: ['pending', 'subscribed'] } },
      {
        $set: {
          'newsletter.status': 'unsubscribed',
          'newsletter.unsubscribedAt': clock(),
          'newsletter.unsubscribedVia': via,
        },
        $unset: {
          'newsletter.subscribedAt': 1,
          'newsletter.confirmTokenHash': 1,
          'newsletter.confirmTokenExpiresAt': 1,
        },
      },
    );
    return result.modifiedCount > 0;
  }

  return {
    async state(userId: string): Promise<NewsletterState> {
      return stateOf(await activeUser(userId));
    },

    /** Desde la cuenta: apuntarse (con confirmación si hace falta) o darse de baja. */
    async setFromAccount(userId: string, subscribed: boolean): Promise<NewsletterState> {
      if (subscribed) return optIn(userId, 'account');
      await optOut(userId, 'account');
      return stateOf(await activeUser(userId));
    },

    /**
     * «No, gracias» a la invitación del panel: se guarda la respuesta y no vuelve a salir nunca. Idempotente. A quien no
     * puede apuntarse no se le guarda nada (no se le ofrece).
     */
    async declineInvitation(userId: string): Promise<NewsletterState> {
      const user = await activeUser(userId);
      if (stateOf(user).eligible) {
        await User.updateOne(
          { _id: user._id },
          { $min: { 'newsletter.invitationAnsweredAt': clock() } },
        );
      }
      return stateOf(await activeUser(userId));
    },

    /**
     * Después de declarar la edad y los consentimientos (registro, segundo paso de Google, volver a declarar). Quien
     * marcó la casilla se apunta; quien la vio (mayor de edad) y no la marcó ya respondió que no: se guarda como
     * respondida la invitación del panel para no volver a preguntarle. Las menores no ven la casilla ni la invitación.
     * Nunca hace fallar el alta: un problema aquí se anota y la persona puede apuntarse desde la cuenta.
     */
    async afterSignup(
      userId: string,
      source: NewsletterSource,
      checked: boolean | undefined,
    ): Promise<void> {
      try {
        if (checked) {
          await optIn(userId, source);
          return;
        }
        const user = await activeUser(userId);
        if (stateOf(user).eligible) {
          await User.updateOne(
            { _id: user._id },
            { $min: { 'newsletter.invitationAnsweredAt': clock() } },
          );
        }
      } catch (error) {
        deps.logger.warn(
          { userId, reason: error instanceof Error ? error.message : String(error) },
          'No se pudo guardar la respuesta a la casilla de novedades después del alta',
        );
      }
    },

    /** Enlace del correo de confirmación (sin sesión). Un solo uso: el token se borra al confirmar. */
    async confirm(token: string): Promise<NewsletterState> {
      const now = clock();
      const user = await User.findOneAndUpdate(
        {
          status: 'active',
          'newsletter.status': 'pending',
          'newsletter.confirmTokenHash': sha256Hex(token),
          'newsletter.confirmTokenExpiresAt': { $gt: now },
        },
        {
          $set: { 'newsletter.status': 'subscribed', 'newsletter.subscribedAt': now },
          $unset: { 'newsletter.confirmTokenHash': 1, 'newsletter.confirmTokenExpiresAt': 1 },
        },
        { returnDocument: 'after' },
      );
      if (!user) throw new AppError('TOKEN_INVALID', CONFIRM_INVALID);
      return stateOf(user);
    },

    /**
     * Baja con el token del correo (enlace visible o botón de baja del cliente de correo, RFC 8058). Sin sesión. Nunca
     * dice si el token era válido ni si la cuenta existe: responde igual siempre.
     */
    async unsubscribeByToken(token: string, via: 'link' | 'header'): Promise<void> {
      const userId = verifyUnsubscribeToken(token, deps.unsubscribeSecret);
      if (userId) await optOut(userId, via);
    },

    webhookEnabled(): boolean {
      return Boolean(deps.webhookSecret);
    },

    /**
     * Webhook de Resend: un rebote permanente o una queja de spam dan de baja sola la dirección. La firma Svix se
     * verifica sobre el cuerpo crudo. Responde sin errores aunque el correo no sea de nadie (no revela cuentas).
     */
    async handleResendWebhook(rawBody: string, headers: SvixHeaders): Promise<void> {
      const secret = deps.webhookSecret;
      if (!secret) throw new AppError('NOT_FOUND', 'Recurso no encontrado');
      if (!verifySvix(secret, headers, rawBody, clock())) {
        throw new AppError('VALIDATION', 'Firma no válida');
      }
      let event: unknown;
      try {
        event = JSON.parse(rawBody);
      } catch {
        throw new AppError('VALIDATION', 'Cuerpo no válido');
      }
      const { type, data } = (event ?? {}) as {
        type?: unknown;
        data?: { to?: unknown; bounce?: { type?: unknown } };
      };
      let via: UnsubscribeVia | null = null;
      if (type === 'email.complained') via = 'complaint';
      else if (type === 'email.bounced' && data?.bounce?.type === 'Permanent') via = 'bounce';
      if (!via) return;
      const recipients = (Array.isArray(data?.to) ? data.to : [data?.to]).filter(
        (value): value is string => typeof value === 'string' && value.includes('@'),
      );
      let changed = 0;
      for (const email of recipients.slice(0, 50)) {
        const user = await User.findOne({ emailNormalized: normalizeEmail(email) }).select('_id');
        if (user && (await optOut(user._id, via))) changed += 1;
      }
      // Sin correos en el registro: solo el tipo y cuántas bajas hubo.
      deps.logger.info({ event: type, unsubscribed: changed }, 'Webhook de Resend procesado');
    },
  };
}

export type NewsletterService = ReturnType<typeof createNewsletterService>;
