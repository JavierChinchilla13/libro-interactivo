import type { AuthUser, Consent, LoginRequest, RegisterRequest, Role } from '@libro/shared';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { addDays, addMinutes, type Clock } from '../lib/clock.js';
import { hashIp, randomToken, sha256Hex } from '../lib/crypto.js';
import { normalizeEmail } from '../lib/email.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User, type UserDoc } from '../models/User.js';
import { createAgeGate, type AgeGate } from './ageGate.service.js';
import { evaluateConsent, type StoredConsent } from './consent.service.js';
import { getDummyHash, hashPassword, verifyPassword } from './password.service.js';
import type { GoogleProfile } from './google.service.js';
import type { TokenService } from './token.service.js';

/** Intentos fallidos que disparan un bloqueo temporal (y cada múltiplo vuelve a bloquear). */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_BASE_MINUTES = 15;
const LOCK_MAX_MINUTES = 24 * 60;
/**
 * Dos pestañas pueden refrescar a la vez con el mismo token: la segunda llega con un token recién
 * rotado. Dentro de esta ventana se rechaza sin tumbar toda la familia de sesiones.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

const INVALID_CREDENTIALS =
  'Correo o contraseña incorrectos, o demasiados intentos. Inténtalo más tarde.';
const REGISTER_CONFLICT =
  'No se pudo completar el registro. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.';
const GOOGLE_INVALID = 'No pudimos iniciar sesión con Google. Inténtalo de nuevo.';
const SESSION_INVALID = 'Tu sesión no es válida o caducó. Inicia sesión de nuevo.';

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface Session {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthContext {
  userId: string;
  role: Role;
}

export interface AuthServiceOptions {
  tokens: TokenService;
  clock: Clock;
  /** Secreto para el HMAC de las IP almacenadas. */
  ipSecret: string;
  refreshTtlDays: number;
  /** Freno a quien prueba fechas de nacimiento; por defecto uno propio (en memoria). */
  ageGate?: AgeGate;
}

export function toAuthUser(user: Pick<UserDoc, 'id' | 'name' | 'email' | 'role'>): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export function createAuthService(options: AuthServiceOptions) {
  const { tokens, clock, ipSecret, refreshTtlDays } = options;
  const ageGate = options.ageGate ?? createAgeGate({ clock, secret: ipSecret });

  async function issueSession(
    user: UserDoc,
    meta: RequestMeta,
    familyId: string,
    refreshDocId?: Types.ObjectId,
  ): Promise<Session> {
    const now = clock();
    const refreshToken = randomToken();
    const refreshExpiresAt = addDays(now, refreshTtlDays);
    await RefreshToken.create({
      ...(refreshDocId ? { _id: refreshDocId } : {}),
      userId: user._id,
      tokenHash: sha256Hex(refreshToken),
      familyId,
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent?.slice(0, 200),
      ipHash: meta.ip ? hashIp(meta.ip, ipSecret) : undefined,
    });
    const access = await tokens.signAccess({
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt,
    };
  }

  async function revokeFamily(familyId: string): Promise<void> {
    await RefreshToken.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: clock() } });
  }

  /** Cuenta un intento fallido y, si corresponde, bloquea la cuenta (más tiempo cada vez). */
  async function registerFailedLogin(user: UserDoc): Promise<void> {
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { failedLoginCount: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated || updated.failedLoginCount % MAX_FAILED_LOGINS !== 0) return;
    const round = updated.failedLoginCount / MAX_FAILED_LOGINS;
    const minutes = Math.min(LOCK_BASE_MINUTES * 2 ** (round - 1), LOCK_MAX_MINUTES);
    await User.updateOne(
      { _id: user._id },
      { $set: { lockedUntil: addMinutes(clock(), minutes) } },
    );
  }

  /** ¿Los datos de edad y consentimiento de esta cuenta pudieron ser puestos por otra persona? */
  function needsFreshConsent(user: UserDoc): boolean {
    return (
      Boolean(user.consentRequiredAt) || (!user.emailVerifiedAt && Boolean(user.termsAcceptedAt))
    );
  }

  /**
   * Una persona acaba de probar que controla el correo de una cuenta creada con contraseña y sin comprobar: se le quita
   * la contraseña a quien la creó (queda una al azar que nadie conoce), se cierran las sesiones que hubiera abiertas
   * y, si ya declaró su edad y sus consentimientos, se guardan en lugar de los que había.
   */
  async function claimUnverifiedAccount(
    userId: Types.ObjectId,
    consent: StoredConsent | undefined,
  ): Promise<UserDoc | null> {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash: await hashPassword(randomToken(24)),
          passwordChangedAt: clock(),
          emailVerifiedAt: clock(),
          failedLoginCount: 0,
          ...consent,
        },
        $unset: { lockedUntil: 1, ...(consent ? { consentRequiredAt: 1 } : {}) },
        // Los access tokens vigentes dejan de valer y los refresh se revocan: se cierran todas las sesiones.
        $inc: { tokenVersion: 1 },
      },
    );
    await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: clock() } });
    return User.findById(userId);
  }

  return {
    async register(
      input: RegisterRequest,
      meta: RequestMeta,
    ): Promise<{ user: AuthUser; session: Session }> {
      // Primero la edad: quien no la alcanza se rechaza sin cifrar nada, sin tocar la base de datos y sin guardar nada.
      const consent = evaluateConsent(input, { now: clock(), gate: ageGate, ip: meta.ip });
      const passwordHash = await hashPassword(input.password);
      let user: UserDoc;
      try {
        user = await User.create({
          email: input.email,
          emailNormalized: normalizeEmail(input.email),
          name: input.name,
          passwordHash,
          role: 'USER',
          ...consent,
        });
      } catch (error) {
        // El índice único es la garantía real (también ante registros simultáneos).
        if (isDuplicateKeyError(error)) throw new AppError('CONFLICT', REGISTER_CONFLICT);
        throw error;
      }
      const session = await issueSession(user, meta, randomToken(16));
      return { user: toAuthUser(user), session };
    },

    async login(
      input: LoginRequest,
      meta: RequestMeta,
    ): Promise<
      | { status: 'ok'; user: AuthUser; session: Session }
      | { status: 'needs_profile'; name: string; email: string }
    > {
      const user = await User.findOne({ emailNormalized: normalizeEmail(input.email) });
      if (!user) {
        // Misma carga de trabajo que con un usuario real: no se delata si el correo existe.
        await verifyPassword(await getDummyHash(), input.password);
        throw new AppError('AUTH_INVALID', INVALID_CREDENTIALS);
      }

      const now = clock();
      const locked =
        user.lockedUntil !== undefined && user.lockedUntil !== null && user.lockedUntil > now;
      const passwordOk = await verifyPassword(user.passwordHash, input.password);

      if (locked || user.status !== 'active') {
        // Cuenta bloqueada o desactivada: se rechaza aunque la contraseña sea correcta (mismo mensaje).
        throw new AppError('AUTH_INVALID', INVALID_CREDENTIALS);
      }
      if (!passwordOk) {
        await registerFailedLogin(user);
        throw new AppError('AUTH_INVALID', INVALID_CREDENTIALS);
      }

      // Cuenta a la que se le borraron la edad y los consentimientos declarados por otra persona: se vuelven a pedir
      // antes de abrir sesión (la contraseña ya se comprobó; no cuenta como intento fallido ni se abre nada).
      let consent: StoredConsent | undefined;
      if (user.role === 'USER' && user.consentRequiredAt) {
        if (!input.profile) return { status: 'needs_profile', name: user.name, email: user.email };
        consent = evaluateConsent(input.profile, { now, gate: ageGate, ip: meta.ip });
      }
      await User.updateOne(
        { _id: user._id },
        {
          $set: { failedLoginCount: 0, lastLoginAt: now, ...consent },
          $unset: { lockedUntil: 1, ...(consent ? { consentRequiredAt: 1 } : {}) },
        },
      );
      const session = await issueSession(user, meta, randomToken(16));
      return { status: 'ok', user: toAuthUser(user), session };
    },

    /**
     * Ingreso con Google (el perfil ya viene verificado por `GoogleVerifier`). Un correo verificado por Google es
     * prueba de que la persona controla esa cuenta.
     *
     * - Si la cuenta **ya existe**, se entra como siempre (aunque no tenga fecha de nacimiento guardada).
     * - Si **no existe** y no llegó el perfil (edad y consentimientos), **no se crea nada**: se responde
     *   `needs_profile` con el nombre y el correo para mostrarlos. Entre los dos pasos el servidor no guarda nada.
     * - Si llegó el perfil, se evalúa igual que en el registro (menor de 16: rechazo, nada guardado) y se crea una
     *   lector con una contraseña al azar que nadie conoce (puede definir una con «Olvidé mi contraseña»).
     */
    async loginWithGoogle(
      profile: GoogleProfile,
      meta: RequestMeta,
      consentInput?: Consent,
    ): Promise<
      | { status: 'ok'; user: AuthUser; session: Session }
      | { status: 'needs_profile'; name: string; email: string }
    > {
      if (!profile.emailVerified) throw new AppError('AUTH_INVALID', GOOGLE_INVALID);
      const emailNormalized = normalizeEmail(profile.email);
      let user = await User.findOne({ emailNormalized });
      if (user && (user.status !== 'active' || (user.lockedUntil && user.lockedUntil > clock()))) {
        throw new AppError('AUTH_INVALID', GOOGLE_INVALID);
      }
      // Un lector cuyos datos de edad y consentimiento pudo poner otra persona (cuenta con contraseña y correo sin
      // comprobar que ya declaró edad, o marcada para volver a declararlos) debe declararlos la propia persona antes de entrar. Sin
      // ellos no se cambia nada. Las cuentas anteriores a la edad y las de equipo no entran aquí.
      let consent: StoredConsent | undefined;
      if (user && user.role === 'USER' && needsFreshConsent(user)) {
        if (!consentInput) {
          return { status: 'needs_profile', name: user.name, email: profile.email };
        }
        consent = evaluateConsent(consentInput, { now: clock(), gate: ageGate, ip: meta.ip });
      }
      if (user && user.role === 'USER' && !user.emailVerifiedAt) {
        // Cuenta creada con contraseña, con un correo que nadie comprobó: quien la creó pudo no ser el dueño del
        // correo. Entrar con Google prueba que esta persona sí lo es.
        user = await claimUnverifiedAccount(user._id, consent);
      } else if (user && consent) {
        // Cuenta ya verificada marcada para volver a declarar: se guardan los datos y se quita la marca.
        await User.updateOne(
          { _id: user._id },
          { $set: { ...consent }, $unset: { consentRequiredAt: 1 } },
        );
      }
      if (!user) {
        if (!consentInput) {
          return { status: 'needs_profile', name: profile.name.slice(0, 80), email: profile.email };
        }
        const declared =
          consent ?? evaluateConsent(consentInput, { now: clock(), gate: ageGate, ip: meta.ip });
        try {
          user = await User.create({
            email: profile.email,
            emailNormalized,
            name: profile.name.slice(0, 80),
            passwordHash: await hashPassword(randomToken(24)),
            role: 'USER',
            emailVerifiedAt: clock(),
            ...declared,
          });
        } catch (error) {
          // Dos ingresos simultáneos (o un registro con contraseña justo en medio): gana el índice único. Si la cuenta
          // que ganó es una con correo sin comprobar, también se reclama (se rota su contraseña y se cierran sus
          // sesiones); si no, el segundo ingreso la reutiliza.
          if (!isDuplicateKeyError(error)) throw error;
          const winner = await User.findOne({ emailNormalized });
          if (!winner) throw error;
          user =
            winner.role === 'USER' && !winner.emailVerifiedAt
              ? await claimUnverifiedAccount(winner._id, declared)
              : winner;
        }
      }
      if (!user) throw new AppError('AUTH_INVALID', GOOGLE_INVALID);
      await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: clock() } });
      const session = await issueSession(user, meta, randomToken(16));
      return { status: 'ok', user: toAuthUser(user), session };
    },

    /**
     * Rota el refresh token: el presentado queda invalidado y se entrega uno nuevo de la misma familia.
     * Presentar un token ya rotado fuera de la ventana de gracia revoca toda la familia (posible robo).
     */
    async refresh(
      refreshToken: string | undefined,
      meta: RequestMeta,
    ): Promise<{ user: AuthUser; session: Session }> {
      if (!refreshToken) throw new AppError('UNAUTHENTICATED', SESSION_INVALID);
      const tokenHash = sha256Hex(refreshToken);
      const now = clock();
      const newId = new Types.ObjectId();

      const rotated = await RefreshToken.findOneAndUpdate(
        { tokenHash, revokedAt: null, replacedBy: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, replacedBy: newId } },
      );

      if (!rotated) {
        const existing = await RefreshToken.findOne({ tokenHash });
        if (existing && existing.expiresAt > now) {
          const rotatedJustNow =
            existing.replacedBy !== undefined &&
            existing.replacedBy !== null &&
            existing.revokedAt !== undefined &&
            existing.revokedAt !== null &&
            now.getTime() - existing.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
          if (!rotatedJustNow) await revokeFamily(existing.familyId);
        }
        throw new AppError('UNAUTHENTICATED', SESSION_INVALID);
      }

      const user = await User.findById(rotated.userId);
      if (!user || user.status !== 'active') {
        await revokeFamily(rotated.familyId);
        throw new AppError('UNAUTHENTICATED', SESSION_INVALID);
      }
      const session = await issueSession(user, meta, rotated.familyId, newId);
      return { user: toAuthUser(user), session };
    },

    /** Cierra la sesión: revoca toda la familia del refresh token. Idempotente. */
    async logout(refreshToken: string | undefined): Promise<void> {
      if (!refreshToken) return;
      const existing = await RefreshToken.findOne({ tokenHash: sha256Hex(refreshToken) });
      if (existing) await revokeFamily(existing.familyId);
    },

    /** Cierra todas las sesiones de un usuario (cambio de contraseña, desactivación…). */
    async revokeAllSessions(userId: string | Types.ObjectId): Promise<void> {
      await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
      await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: clock() } });
    },

    /**
     * Valida un access token y comprueba contra la BD que el usuario siga activo y que la versión
     * de tokens coincida; el rol se toma de la BD, así un cambio de rol aplica de inmediato.
     */
    async authenticate(accessToken: string): Promise<AuthContext | null> {
      const claims = await tokens.verifyAccess(accessToken);
      if (!claims || !Types.ObjectId.isValid(claims.userId)) return null;
      const user = await User.findById(claims.userId).select('role status tokenVersion');
      if (!user || user.status !== 'active' || user.tokenVersion !== claims.tokenVersion) {
        return null;
      }
      return { userId: user.id, role: user.role };
    },

    /** Abre una sesión nueva (familia nueva de refresh) para un usuario ya verificado. */
    async startSession(user: UserDoc, meta: RequestMeta): Promise<Session> {
      return issueSession(user, meta, randomToken(16));
    },

    async getUserById(userId: string): Promise<AuthUser | null> {
      if (!Types.ObjectId.isValid(userId)) return null;
      const user = await User.findById(userId);
      return user ? toAuthUser(user) : null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
