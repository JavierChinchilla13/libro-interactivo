import type {
  AdminMessage,
  AdminMessageListQuery,
  AdminMessageListResponse,
  AdminStats,
} from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { Book } from '../models/Book.js';
import { ContactMessage } from '../models/ContactMessage.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';

type MessageLean = NonNullable<Awaited<ReturnType<typeof loadMessage>>>;

async function loadMessage(id: string) {
  return ContactMessage.findById(id).lean();
}

const toMessage = (message: MessageLean): AdminMessage => ({
  id: message._id.toString(),
  name: message.name,
  email: message.email,
  message: message.message,
  createdAt: message.createdAt.toISOString(),
  handled: message.handled,
  ...(message.handledAt ? { handledAt: message.handledAt.toISOString() } : {}),
});

const DAY = 86_400_000;

/** Bandeja de mensajes de contacto y estadísticas básicas (solo administradoras). Las pruebas (`isTest`) nunca cuentan. */
export function createAdminMetricsService(deps: { clock: Clock }) {
  async function listMessages(query: AdminMessageListQuery): Promise<AdminMessageListResponse> {
    const filter =
      query.status === 'unhandled'
        ? { handled: false }
        : query.status === 'handled'
          ? { handled: true }
          : {};
    const [messages, total, unhandled] = await Promise.all([
      ContactMessage.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      ContactMessage.countDocuments(filter),
      ContactMessage.countDocuments({ handled: false }),
    ]);
    return {
      messages: messages.map(toMessage),
      total,
      unhandled,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async function setHandled(actorId: string, id: string, handled: boolean): Promise<AdminMessage> {
    const update = handled
      ? { $set: { handled: true, handledAt: deps.clock(), handledBy: actorId } }
      : { $set: { handled: false }, $unset: { handledAt: 1, handledBy: 1 } };
    const result = await ContactMessage.updateOne({ _id: id }, update);
    if (result.matchedCount === 0) throw new AppError('NOT_FOUND', 'No encontramos ese mensaje');
    const message = await loadMessage(id);
    if (!message) throw new AppError('NOT_FOUND', 'No encontramos ese mensaje');
    return toMessage(message);
  }

  async function removeMessage(id: string): Promise<void> {
    const result = await ContactMessage.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new AppError('NOT_FOUND', 'No encontramos ese mensaje');
  }

  async function stats(): Promise<AdminStats> {
    const now = deps.clock().getTime();
    const since = (days: number) => new Date(now - days * DAY);
    const [
      readers,
      last7,
      last30,
      disabled,
      staff,
      completed,
      inProgress,
      booksCompleted,
      unhandled,
    ] = await Promise.all([
      User.countDocuments({ role: 'USER' }),
      User.countDocuments({ role: 'USER', createdAt: { $gte: since(7) } }),
      User.countDocuments({ role: 'USER', createdAt: { $gte: since(30) } }),
      User.countDocuments({ role: 'USER', status: 'disabled' }),
      User.countDocuments({ role: { $ne: 'USER' } }),
      QuizAttempt.countDocuments({ status: 'completed', isTest: false }),
      QuizAttempt.countDocuments({ status: 'in_progress', isTest: false }),
      UserProgress.countDocuments({ bookCompletedAt: { $exists: true } }),
      ContactMessage.countDocuments({ handled: false }),
    ]);

    const quizzes = await Quiz.find({ status: 'published' }).sort({ bookId: 1, order: 1 }).lean();
    const books = new Map(
      (
        await Book.find({ _id: { $in: quizzes.map((q) => q.bookId) } })
          .select('title')
          .lean()
      ).map((b) => [b._id.toString(), b.title]),
    );
    const grouped = await QuizAttempt.aggregate<{
      _id: { quizId: unknown; key: string | null };
      count: number;
    }>([
      { $match: { status: 'completed', isTest: false } },
      { $group: { _id: { quizId: '$quizId', key: '$finalResultKey' }, count: { $sum: 1 } } },
    ]);
    const distinctUsers = await QuizAttempt.aggregate<{ _id: unknown; users: number }>([
      { $match: { status: 'completed', isTest: false } },
      { $group: { _id: { quizId: '$quizId', userId: '$userId' } } },
      { $group: { _id: '$_id.quizId', users: { $sum: 1 } } },
    ]);

    const rows: AdminStats['quizzes'] = [];
    for (const quiz of quizzes) {
      const version = await QuizVersion.findOne({ quizId: quiz._id, version: quiz.currentVersion })
        .select('results')
        .lean();
      const titles = new Map(
        ((version?.results ?? []) as { key: string; title: string }[]).map((r) => [r.key, r.title]),
      );
      const own = grouped.filter((g) => String(g._id.quizId) === String(quiz._id));
      rows.push({
        quizId: quiz._id.toString(),
        title: quiz.title,
        bookTitle: books.get(quiz.bookId.toString()) ?? '',
        order: quiz.order,
        completedUsers: distinctUsers.find((d) => String(d._id) === String(quiz._id))?.users ?? 0,
        attempts: own.reduce((sum, g) => sum + g.count, 0),
        results: own
          .filter((g) => g._id.key)
          .map((g) => ({
            key: g._id.key as string,
            title: titles.get(g._id.key as string) ?? (g._id.key as string),
            count: g.count,
          }))
          .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
      });
    }

    return {
      readers: { total: readers, last7Days: last7, last30Days: last30, disabled },
      staff,
      attempts: { completed, inProgress },
      booksCompleted,
      unhandledMessages: unhandled,
      quizzes: rows,
    };
  }

  return { listMessages, setHandled, removeMessage, stats };
}

export type AdminMetricsService = ReturnType<typeof createAdminMetricsService>;
