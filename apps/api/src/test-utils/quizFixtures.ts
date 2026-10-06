import type { QuizContent } from '@libro/shared';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { canonicalJson } from '../lib/canonicalJson.js';
import { sha256Hex } from '../lib/crypto.js';
import type { Types } from 'mongoose';

export {
  DEFAULT_SETTINGS,
  resultsFor,
  simpleContent,
  simpleStage,
  twoStageContent,
} from '../seed/quizBuilders.js';

export async function createBook(overrides: { slug?: string; status?: 'draft' | 'published' } = {}) {
  return Book.create({
    slug: overrides.slug ?? 'libro-1',
    title: '[PLACEHOLDER] Libro 1',
    order: 1,
    status: overrides.status ?? 'published',
  });
}

/** Crea el quiz con su borrador y, si `publishedBy` viene, una versión 1 publicada. */
export async function createQuiz(input: {
  bookId: Types.ObjectId | string;
  order: number;
  content: QuizContent;
  slug?: string;
  publishedBy?: Types.ObjectId | string;
}) {
  const { content } = input;
  const quiz = await Quiz.create({
    bookId: input.bookId,
    slug: input.slug ?? `quiz-${input.order}`,
    order: input.order,
    title: content.title,
    instructionsHtml: content.instructionsHtml,
    settings: content.settings,
    draft: { stages: content.stages, results: content.results },
    status: 'draft',
  });
  if (input.publishedBy) await publishDirect(quiz._id, input.publishedBy, content);
  return Quiz.findById(quiz._id).orFail();
}

/** Publica sin pasar por el endpoint (atajo para pruebas del lector): crea la siguiente versión. */
export async function publishDirect(
  quizId: Types.ObjectId | string,
  publishedBy: Types.ObjectId | string,
  content: QuizContent,
) {
  const quiz = await Quiz.findById(quizId).orFail();
  const version = quiz.currentVersion + 1;
  const created = await QuizVersion.create({
    quizId: quiz._id,
    bookId: quiz.bookId,
    version,
    title: content.title,
    instructionsHtml: content.instructionsHtml,
    settings: content.settings,
    stages: content.stages,
    results: content.results,
    publishedAt: new Date(),
    publishedBy,
    contentHash: `sha256:${sha256Hex(canonicalJson(content))}`,
  });
  await Quiz.updateOne(
    { _id: quiz._id },
    { $set: { status: 'published', currentVersion: version, lastPublishedAt: new Date() } },
  );
  return created;
}
