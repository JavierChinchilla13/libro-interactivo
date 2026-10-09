import {
  PASSWORD_PROBLEM_MESSAGES,
  checkPassword,
  type AuthUser,
  type ChangePasswordRequest,
} from '@libro/shared';
import type { BackgroundTasks } from '../lib/background.js';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { User, type UserDoc } from '../models/User.js';
import type { MailProvider } from '../providers/mail/MailProvider.js';
import { passwordChangedEmail } from './email.templates.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { eraseUserData } from './userErasure.service.js';
import { toAuthUser, type AuthService, type RequestMeta, type Session } from './auth.service.js';

const NOT_LOGGED_IN = 'Tu sesión no es válida o caducó. Inicia sesión de nuevo.';

export interface AccountServiceOptions {
  auth: AuthService;
  mail: MailProvider;
  tasks: BackgroundTasks;
  clock: Clock;
}

/** Mensaje en español para los problemas de una contraseña nueva. */
export function describePasswordProblems(problems: ReturnType<typeof checkPassword>): string {
  return problems.map((problem) => PASSWORD_PROBLEM_MESSAGES[problem]).join(' ');
}

export function createAccountService({ auth, mail, tasks, clock }: AccountServiceOptions) {
  async function activeUser(userId: string): Promise<UserDoc> {
    const user = await User.findById(userId);
    if (!user || user.status !== 'active') throw new AppError('UNAUTHENTICATED', NOT_LOGGED_IN);
    return user;
  }

  return {
    /**
     * Elimina la propia cuenta (solo lectores): pide la contraseña y borra los datos personales; los intentos
     * completados quedan anonimizados. Una cuenta de administración la desactiva otra administradora.
     */
    async deleteAccount(userId: string, password: string): Promise<void> {
      const user = await activeUser(userId);
      if (user.role !== 'USER') {
        throw new AppError(
          'FORBIDDEN',
          'Una cuenta de administración no se elimina por aquí: pídele a otra administradora que la desactive.',
        );
      }
      if (!(await verifyPassword(user.passwordHash, password))) {
        throw new AppError('VALIDATION', 'La contraseña no es correcta.');
      }
      await eraseUserData(user._id);
    },

    async getProfile(userId: string): Promise<AuthUser> {
      return toAuthUser(await activeUser(userId));
    },

    /** En la v1 solo el nombre es editable (el correo es la base de la cuenta y de la recuperación). */
    async updateName(userId: string, name: string): Promise<AuthUser> {
      const user = await activeUser(userId);
      user.name = name;
      await user.save();
      return toAuthUser(user);
    },

    /**
     * Cambia la contraseña: exige la actual, aplica la política (con nombre y correo de la cuenta),
     * cierra las demás sesiones y avisa por correo. Devuelve una sesión nueva para este dispositivo.
     */
    async changePassword(
      userId: string,
      input: ChangePasswordRequest,
      meta: RequestMeta,
    ): Promise<{ user: AuthUser; session: Session }> {
      const user = await activeUser(userId);

      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new AppError('VALIDATION', 'La contraseña actual no es correcta.');
      }
      const problems = checkPassword(input.newPassword, { name: user.name, email: user.email });
      if (problems.length > 0) {
        throw new AppError('VALIDATION', describePasswordProblems(problems));
      }
      if (await verifyPassword(user.passwordHash, input.newPassword)) {
        throw new AppError('VALIDATION', 'La contraseña nueva debe ser distinta de la actual.');
      }

      const now = clock();
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordHash: await hashPassword(input.newPassword),
            passwordChangedAt: now,
            failedLoginCount: 0,
          },
          $unset: { lockedUntil: 1 },
        },
      );
      // Sube tokenVersion y revoca todos los refresh; luego se abre una sesión nueva solo para este dispositivo.
      await auth.revokeAllSessions(user._id);
      const refreshed = await activeUser(userId);
      const session = await auth.startSession(refreshed, meta);

      tasks.run('password-changed-email', () =>
        mail.send({
          to: refreshed.email,
          ...passwordChangedEmail({ name: refreshed.name, changedAt: now }),
        }),
      );
      return { user: toAuthUser(refreshed), session };
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
