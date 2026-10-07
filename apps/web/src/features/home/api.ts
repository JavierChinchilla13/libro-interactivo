import {
  messageResponseSchema,
  publicSiteResponseSchema,
  type ContactRequest,
} from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/** Llamadas públicas de la landing (sin sesión). */
export const publicApi = {
  site: () => apiRequest('/site', publicSiteResponseSchema),
  contact: (body: ContactRequest) =>
    apiRequest('/contact', messageResponseSchema, { method: 'POST', body }),
};

export const publicKeys = {
  site: ['public', 'site'] as const,
  book: (slug: string) => ['public', 'book', slug] as const,
};
