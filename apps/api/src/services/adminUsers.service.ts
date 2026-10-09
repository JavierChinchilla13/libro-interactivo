import type {
  AdminUser,
  AdminUserDetail,
  AdminUserListQuery,
  AdminUserListResponse,
  CreateStaffUserRequest,
  Role,
  UpdateUserRequest,
} from '@libro/shared';
import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { normalizeEmail } from '../lib/email.js';
import { AppError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { escapeRegex, normalizeName } from '../lib/text.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';
import type { AuthService } from './auth.service.js';
import { hashPassword } from './password.service.js';
import type { PasswordResetService } from './passwordReset.service.js';
import { eraseUserData } from './userErasure.service.js';

type UserLean = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(id: string) {
  return User.findById(id).lean();
}

const toAdminUser = (user: UserLean, completedQuizzes: number): AdminUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt.toISOString(),
  ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
  completedQuizzes,
});

/**
 * Administración de usuarios (solo administradoras). Reglas: nadie cambia su propio rol ni se desactiva, **siempre
 * queda al menos una administradora activa**, solo se elimina a lectores (las cuentas de administración se
 * desactivan) y desactivar o cambiar el rol cierra las sesiones abiertas.
 */
export function createAdminUsersService(deps: {
  auth: AuthService;
  passwordReset: PasswordResetService;
}) {
  async function completedByUser(ids: Types.ObjectId[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const docs = await UserProgress.find({ userId: { $in: ids } })
      .select('userId completed')
      .lean();
    const counts = new Map<string, number>();
    for (const doc of docs) {
      const quizzes = (doc.completed ?? []).filter((item) => item.kind === 'quiz').length;
      counts.set(String(doc.userId), (counts.get(String(doc.userId)) ?? 0) + quizzes);
    }
    return counts;
  }

  async function list(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const filter: Record<string, unknown> = {};
    if (query.role) filter['role'] = query.role;
    if (query.status) filter['status'] = query.status;
    if (query.q) {
      const needle = escapeRegex(normalizeName(query.q));
      filter['$or'] = [
        { emailNormalized: { $regex: needle } },
        { name: { $regex: escapeRegex(query.q), $options: 'i' } },
      ];
    }
    const [users, total, totalQuizzes] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      User.countDocuments(filter),
      Quiz.countDocuments({ status: 'published' }),
    ]);
    const completed = await completedByUser(users.map((user) => user._id));
    return {
      users: users.map((user) => toAdminUser(user, completed.get(user._id.toString()) ?? 0)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalQuizzes,
    };
  }

  async function get(id: string): Promise<AdminUserDetail> {
    const user = await loadUser(id);
    if (!user) throw new AppError('NOT_FOUND', 'No encontramos a esa persona');
    const [books, progressDocs] = await Promise.all([
      Book.find({ status: 'published' }).select('title order').sort({ order: 1 }).lean(),
      UserProgress.find({ userId: user._id }).lean(),
    ]);
    const detail: AdminUserDetail['books'] = [];
    let completedQuizzes = 0;
    for (const book of books) {
      const progress = progressDocs.find((doc) => String(doc.bookId) === String(book._id));
      const quizzes = await Quiz.find({ bookId: book._id, status: 'published' })
        .select('title order')
        .sort({ order: 1 })
        .lean();
      const rows: AdminUserDetail['books'][number]['quizzes'] = [];
      for (const quiz of quizzes) {
        const done = (progress?.completed ?? []).find(
          (item) => item.kind === 'quiz' && String(item.refId) === String(quiz._id),
        );
        const unlocked = (progress?.unlocked ?? []).some(
          (item) => item.kind === 'quiz' && String(item.refId) === String(quiz._id),
        );
        const attempts = await QuizAttempt.countDocuments({
          userId: user._id,
          quizId: quiz._id,
          status: 'completed',
          isTest: false,
        });
        let resultTitle: string | undefined;
        if (done) {
          completedQuizzes += 1;
          const attempt = await QuizAttempt.findById(done.currentAttemptId)
            .select('quizVersionId finalResultKey')
            .lean();
          const version = attempt
            ? await QuizVersion.findById(attempt.quizVersionId).select('results').lean()
            : null;
          const results = (version?.results ?? []) as { key: string; title: string }[];
          resultTitle = results.find((result) => result.key === attempt?.finalResultKey)?.title;
        }
        rows.push({
          quizId: quiz._id.toString(),
          title: quiz.title,
          order: quiz.order,
          status: done ? 'completed' : unlocked ? 'unlocked' : 'none',
          ...(done ? { completedAt: done.firstCompletedAt.toISOString() } : {}),
          ...(resultTitle ? { resultTitle } : {}),
          attempts,
        });
      }
      detail.push({
        bookId: book._id.toString(),
        title: book.title,
        ...(progress?.bookCompletedAt
          ? { bookCompletedAt: progress.bookCompletedAt.toISOString() }
          : {}),
        quizzes: rows,
      });
    }
    return { user: toAdminUser(user, completedQuizzes), books: detail };
  }

  /** Cuántas administradoras activas hay, sin contar a `exceptId`. */
  async function otherActiveAdmins(exceptId: string): Promise<number> {
    return User.countDocuments({ role: 'ADMIN', status: 'active', _id: { $ne: exceptId } });
  }

  /** Crea una cuenta de editora o administradora; la persona elige su contraseña con el enlace que recibe. */
  async function createStaff(actorId: string, input: CreateStaffUserRequest): Promise<AdminUser> {
    try {
      const user = await User.create({
        email: input.email,
        emailNormalized: normalizeEmail(input.email),
        name: input.name,
        // Contraseña aleatoria que nadie conoce: la persona fija la suya con el correo de «restablecer».
        passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
        role: input.role,
        createdBy: actorId,
      });
      await deps.passwordReset.requestReset(user.email);
      return toAdminUser(user.toObject() as UserLean, 0);
    } catch (error) {
      if (isDuplicateKey(error))
        throw new AppError('CONFLICT', 'Ya existe una cuenta con ese correo');
      throw error;
    }
  }

  async function update(actorId: string, id: string, input: UpdateUserRequest): Promise<AdminUser> {
    const user = await loadUser(id);
    if (!user) throw new AppError('NOT_FOUND', 'No encontramos a esa persona');
    const role = input.role ?? user.role;
    const status = input.status ?? user.status;
    if (role === user.role && status === user.status) {
      return toAdminUser(user, (await completedByUser([user._id])).get(id) ?? 0);
    }
    if (id === actorId) {
      throw new AppError(
        'FORBIDDEN',
        'No puedes cambiar tu propio rol ni desactivar tu propia cuenta',
      );
    }
    const losesAdmin =
      user.role === 'ADMIN' &&
      user.status === 'active' &&
      (role !== 'ADMIN' || status !== 'active');
    if (losesAdmin && (await otherActiveAdmins(id)) === 0) {
      throw new AppError('VALIDATION', 'Debe quedar al menos una administradora activa');
    }
    await User.updateOne({ _id: id }, { $set: { role: role as Role, status } });
    // Cierra las sesiones abiertas: el cambio aplica de inmediato.
    await deps.auth.revokeAllSessions(id);
    const fresh = await loadUser(id);
    if (!fresh) throw new AppError('NOT_FOUND', 'No encontramos a esa persona');
    const completed = await completedByUser([fresh._id]);
    return toAdminUser(fresh, completed.get(id) ?? 0);
  }

  /** Elimina la cuenta de una lectora (solo lectores: las cuentas de administración se desactivan). */
  async function remove(actorId: string, id: string): Promise<void> {
    const user = await loadUser(id);
    if (!user) throw new AppError('NOT_FOUND', 'No encontramos a esa persona');
    if (id === actorId)
      throw new AppError('FORBIDDEN', 'No puedes eliminar tu propia cuenta desde aquí');
    if (user.role !== 'USER') {
      throw new AppError('VALIDATION', 'Una cuenta de administración no se elimina: desactívala');
    }
    await eraseUserData(id);
  }

  return { list, get, createStaff, update, remove };
}

export type AdminUsersService = ReturnType<typeof createAdminUsersService>;
