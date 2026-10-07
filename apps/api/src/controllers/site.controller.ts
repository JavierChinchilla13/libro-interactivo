import type { UpdateSiteSettingsRequest } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { PublicBookService } from '../services/publicBook.service.js';
import type { WelcomeService } from '../services/welcome.service.js';

export function createWelcomeController(welcome: WelcomeService) {
  const get: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await welcome.forUser(getAuth(res).userId));
  };
  const seen: RequestHandler = async (_req, res) => {
    await welcome.markSeen(getAuth(res).userId);
    res.status(204).end();
  };
  return { get, seen };
}

export function createAdminSiteController(welcome: WelcomeService) {
  const get: RequestHandler = async (_req, res) => {
    res.json(await welcome.getSettings());
  };
  const update: RequestHandler = async (_req, res) => {
    const { body } = getInput<UpdateSiteSettingsRequest>(res);
    res.json(await welcome.updateSettings(getAuth(res), body));
  };
  return { get, update };
}

export function createPublicBookController(books: PublicBookService) {
  const list: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60').json({ books: await books.list() });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, { slug: string }>(res);
    res.set('Cache-Control', 'public, max-age=60').json(await books.getBySlug(params.slug));
  };
  return { list, get };
}
