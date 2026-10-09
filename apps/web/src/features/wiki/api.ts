import {
  publicWikiEntriesResponseSchema,
  publicWikiEntryResponseSchema,
  publicWikiSectionsResponseSchema,
} from '@libro/shared';
import { apiRequest } from '../../shared/api/client';
import type { SectionKind } from './sections';

/** Llamadas de la wiki pública. Lo que se ve depende de la sesión: el servidor decide cada vez. */
export const wikiApi = {
  sections: (bookId: string) =>
    apiRequest(`/wiki/sections?bookId=${bookId}`, publicWikiSectionsResponseSchema),
  entries: (bookId: string, kind: SectionKind) =>
    apiRequest(`/wiki/entries?bookId=${bookId}&kind=${kind}`, publicWikiEntriesResponseSchema),
  entry: (entryId: string) => apiRequest(`/wiki/entries/${entryId}`, publicWikiEntryResponseSchema),
};

/**
 * Las claves incluyen quién mira (visitante o cuenta): al iniciar o cerrar sesión no se reutiliza lo que vio otra
 * persona, que podría estar bloqueado (o abierto) distinto.
 */
export const wikiKeys = {
  sections: (viewer: string, bookId: string) => ['wiki', viewer, 'sections', bookId] as const,
  entries: (viewer: string, bookId: string, kind: SectionKind) =>
    ['wiki', viewer, 'entries', bookId, kind] as const,
  entry: (viewer: string, entryId: string) => ['wiki', viewer, 'entry', entryId] as const,
};
