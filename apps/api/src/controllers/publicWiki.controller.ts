import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type {
  publicWikiEntriesQuerySchema,
  publicWikiEntryParamsSchema,
  publicWikiSectionsQuerySchema,
} from '@libro/shared';
import { getOptionalAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { PublicWikiService, Viewer } from '../services/publicWiki.service.js';

const viewerOf = (res: Parameters<RequestHandler>[1]): Viewer => {
  const auth = getOptionalAuth(res);
  return auth ? { userId: auth.userId, role: auth.role } : {};
};

/**
 * La respuesta depende de quién pregunta (su progreso): nunca se guarda en caché compartida ni en el navegador.
 */
export function createPublicWikiController(wiki: PublicWikiService) {
  const sections: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, z.infer<typeof publicWikiSectionsQuerySchema>>(res);
    res.set('Cache-Control', 'no-store').json(await wiki.sections(query.bookId, viewerOf(res)));
  };
  const entries: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, z.infer<typeof publicWikiEntriesQuerySchema>>(res);
    res.set('Cache-Control', 'no-store').json(await wiki.entries(query, viewerOf(res)));
  };
  const entry: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, z.infer<typeof publicWikiEntryParamsSchema>>(res);
    res.set('Cache-Control', 'no-store').json(await wiki.entry(params.entryId, viewerOf(res)));
  };
  return { sections, entries, entry };
}
