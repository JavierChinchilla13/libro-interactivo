import { checkPassword, type ResetPasswordRequest } from '@libro/shared';
import type { BackgroundTasks } from '../lib/background.js';
import { addMinutes, type Clock } from '../lib/clock.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { normalizeEmail } from '../lib/email.js';
import { AppError } from '../lib/errors.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { User } from '../models/User.js';
import type { MailProvider } from '../providers/mail/MailProvider.js';
import { describePasswordProblems } from './account.service.js';
import type { AuthService } from './auth.service.js';
import { passwordChangedEmail, passwordResetEmail } from './email.templates.js';
import { hashPassword } from './password.service.js';

/** Para que nadie use el formulario para llenar de correos la bandeja de otra persona. */
export const MAX_RESET_EMAILS_PER_HOUR = 3;

const TOKEN_INVALID_MESSAGE = 'El enlace no es válido o ya caducó. Solicita uno nuevo.';

export interface PasswordResetServiceOptions {
  auth: AuthService;
  mail: MailProvider;
  tasks: BackgroundTasks;
  clock: Clock;
  /** URL pública del sitio (para armar el enlace del correo). */
  appUrl: string;
  ttlMinutes: number;
}

export function createPasswordResetService(options: PasswordResetServiceOptions) {
  const { auth, mail, tasks, clock, appUrl, ttlMinutes } = options;

  return {
    /**
     * Pide un enlace de recuperación. Nunca revela si el correo existe: siempre termina igual y el
     * correo se envía en segundo plano. Guarda solo el hash del token (256 bits, un solo uso, caduca).
     */
    async requestReset(email: string): Promise<void> {
      const user = await User.findOne({ emailNormalized: normalizeEmail(email) });
      if (!user || user.status !== 'active') return;

      const now = clock();
      const recent = await PasswordReset.countDocuments({
        userId: user._id,
        createdAt: { $gt: addMinutes(now, -60) },
      });
      if (recent >= MAX_RESET_EMAILS_PER_HOUR) return;

      // Los enlaces anteriores sin usar dejan de servir (solo vale el último correo).
      await PasswordReset.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: now } });
      const token = randomToken(32);
      await PasswordReset.create({
        userId: user._id,
        tokenHash: sha256Hex(token),
        expiresAt: addMinutes(now, ttlMinutes),
      });

      const link = `${appUrl}/restablecer/${token}`;
      tasks.run('password-reset-email', () =>
        mail.send({ to: user.email, ...passwordResetEmail({ name: user.name, link, ttlMinutes }) }),
      );
    },

    /**
     * Canjea el enlace y fija la contraseña nueva. El token es de un solo uso (se marca de forma
     * atómica); si la contraseña no cumple la política el enlace NO se gasta. Al terminar se cierran
     * todas las sesiones, se levanta cualquier bloqueo y se avisa por correo.
     */
    async resetPassword(input: ResetPasswordRequest): Promise<void> {
      const now = clock();
      const tokenHash = sha256Hex(input.token);

      const reset = await PasswordReset.findOne({
        tokenHash,
        usedAt: null,
        expiresAt: { $gt: now },
      });
      if (!reset) throw new AppError('TOKEN_INVALID', TOKEN_INVALID_MESSAGE);
      const user = await User.findById(reset.userId);
      if (!user || user.status !== 'active')
        throw new AppError('TOKEN_INVALID', TOKEN_INVALID_MESSAGE);

      const problems = checkPassword(input.newPassword, { name: user.name, email: user.email });
      if (problems.length > 0) throw new AppError('VALIDATION', describePasswordProblems(problems));

      const passwordHash = await hashPassword(input.newPassword);
      const consumed = await PasswordReset.findOneAndUpdate(
        { _id: reset._id, usedAt: null },
        { $set: { usedAt: now } },
      );
      if (!consumed) throw new AppError('TOKEN_INVALID', TOKEN_INVALID_MESSAGE); // otro canje ganó la carrera

      await User.updateOne(
        { _id: user._id },
        {
          $set: { passwordHash, passwordChangedAt: now, failedLoginCount: 0 },
          $unset: { lockedUntil: 1 },
        },
      );
      await PasswordReset.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: now } });
      await auth.revokeAllSessions(user._id);

      tasks.run('password-changed-email', () =>
        mail.send({ to: user.email, ...passwordChangedEmail({ name: user.name, changedAt: now }) }),
      );
    },
  };
}

export type PasswordResetService = ReturnType<typeof createPasswordResetService>;
