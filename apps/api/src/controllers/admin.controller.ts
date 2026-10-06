import type {
  BookInput,
  CreateQuizRequest,
  ImageSignatureRequest,
  QuizDraft,
  UpdateQuizMetaRequest,
  WikiEntryInput,
  WikiReorderRequest,
} from '@libro/shared';
import type { RequestHandler } from 'express';
import type { Clock } from '../lib/clock.js';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { ImageProvider } from '../providers/images/ImageProvider.js';
import type { BookService } from '../services/book.service.js';
import type { QuizAdminService } from '../services/quizAdmin.service.js';
import type { WikiListFilter, WikiService } from '../services/wiki.service.js';

interface BookParams {
  bookId: string;
}
interface QuizParams {
  quizId: string;
}
interface WikiParams {
  entryId: string;
}

export function createAdminBookController(books: BookService) {
  const list: RequestHandler = async (_req, res) => {
    res.json({ books: await books.list() });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, BookParams>(res);
    res.json(await books.get(params.bookId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<BookInput>(res);
    res.status(201).json(await books.create(body));
  };
  const replace: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<BookInput, unknown, BookParams>(res);
    res.json(await books.replace(params.bookId, body));
  };
  return { list, get, create, replace };
}

export function createAdminQuizEditorController(quizzes: QuizAdminService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { bookId: string; status?: 'draft' | 'published' | 'archived' }>(res);
    res.json({ quizzes: await quizzes.list(query.bookId, query.status) });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await quizzes.get(params.quizId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<CreateQuizRequest>(res);
    res.status(201).json(await quizzes.create(body, getAuth(res)));
  };
  const saveDraft: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<QuizDraft, unknown, QuizParams>(res);
    res.json(await quizzes.saveDraft(params.quizId, body, getAuth(res)));
  };
  const updateMeta: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<UpdateQuizMetaRequest, unknown, QuizParams>(res);
    res.json(await quizzes.updateMeta(params.quizId, body));
  };
  const archive: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await quizzes.archive(params.quizId));
  };
  const versions: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await quizzes.versions(params.quizId));
  };
  return { list, get, create, saveDraft, updateMeta, archive, versions };
}

export function createAdminWikiController(wiki: WikiService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, WikiListFilter>(res);
    res.json({ entries: await wiki.list(query) });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, WikiParams>(res);
    res.json(await wiki.get(params.entryId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<WikiEntryInput>(res);
    res.status(201).json(await wiki.create(body));
  };
  const replace: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<WikiEntryInput, unknown, WikiParams>(res);
    res.json(await wiki.replace(params.entryId, body));
  };
  const reorder: RequestHandler = async (_req, res) => {
    const { body } = getInput<WikiReorderRequest>(res);
    res.json({ entries: await wiki.reorder(body) });
  };
  return { list, get, create, replace, reorder };
}

export function createAdminUploadController(images: ImageProvider, clock: Clock) {
  const sign: RequestHandler = (_req, res) => {
    const { body } = getInput<Required<ImageSignatureRequest>>(res);
    res.json(
      images.signUpload({
        purpose: body.purpose,
        resource: body.resource,
        timestamp: Math.floor(clock().getTime() / 1000),
      }),
    );
  };
  return { sign };
}
