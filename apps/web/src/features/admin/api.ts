import {
  accessTokenListResponseSchema,
  accessTokenResponseSchema,
  attemptResponseSchema,
  bookListResponseSchema,
  bookResponseSchema,
  extraListResponseSchema,
  extraPreviewResponseSchema,
  extraResponseSchema,
  extraUploadUrlResponseSchema,
  imageSignatureResponseSchema,
  publishQuizResponseSchema,
  quizDetailResponseSchema,
  quizListResponseSchema,
  quizValidationResponseSchema,
  quizVersionsResponseSchema,
  wikiEntryResponseSchema,
  wikiListResponseSchema,
  type BookInputPayload,
  type CreateAccessTokenRequest,
  type CreateQuizRequest,
  type ExtraInputPayload,
  type ExtraUploadUrlRequest,
  type QuizDraftPayload,
  type UPLOAD_PURPOSES,
  type WikiEntryInputPayload,
  type WikiKind,
} from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/** Cliente tipado del panel: cada llamada valida la respuesta con el esquema compartido. */

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const booksApi = {
  list: () => apiRequest('/admin/books', bookListResponseSchema),
  get: (id: string) => apiRequest(`/admin/books/${id}`, bookResponseSchema),
  create: (body: BookInputPayload) =>
    apiRequest('/admin/books', bookResponseSchema, { method: 'POST', body }),
  replace: (id: string, body: BookInputPayload) =>
    apiRequest(`/admin/books/${id}`, bookResponseSchema, { method: 'PUT', body }),
};

export const quizzesApi = {
  list: (bookId: string, status?: string) =>
    apiRequest(`/admin/quizzes${query({ bookId, status })}`, quizListResponseSchema),
  get: (id: string) => apiRequest(`/admin/quizzes/${id}`, quizDetailResponseSchema),
  create: (body: CreateQuizRequest) =>
    apiRequest('/admin/quizzes', quizDetailResponseSchema, { method: 'POST', body }),
  saveDraft: (id: string, body: QuizDraftPayload) =>
    apiRequest(`/admin/quizzes/${id}/draft`, quizDetailResponseSchema, { method: 'PUT', body }),
  updateMeta: (id: string, body: { slug?: string; order?: number }) =>
    apiRequest(`/admin/quizzes/${id}`, quizDetailResponseSchema, { method: 'PATCH', body }),
  archive: (id: string) =>
    apiRequest(`/admin/quizzes/${id}/archive`, quizDetailResponseSchema, { method: 'POST' }),
  validate: (id: string) =>
    apiRequest(`/admin/quizzes/${id}/validate`, quizValidationResponseSchema, { method: 'POST' }),
  publish: (id: string) =>
    apiRequest(`/admin/quizzes/${id}/publish`, publishQuizResponseSchema, { method: 'POST' }),
  preview: (id: string) =>
    apiRequest(`/admin/quizzes/${id}/preview`, attemptResponseSchema, { method: 'POST' }),
  versions: (id: string) => apiRequest(`/admin/quizzes/${id}/versions`, quizVersionsResponseSchema),
};

export interface WikiFilter {
  kind?: WikiKind | undefined;
  bookId?: string | undefined;
  status?: string | undefined;
  q?: string | undefined;
  letter?: string | undefined;
  parentId?: string | undefined;
}

export const wikiApi = {
  list: (filter: WikiFilter) =>
    apiRequest(`/admin/wiki${query({ ...filter })}`, wikiListResponseSchema),
  get: (id: string) => apiRequest(`/admin/wiki/${id}`, wikiEntryResponseSchema),
  create: (body: WikiEntryInputPayload) =>
    apiRequest('/admin/wiki', wikiEntryResponseSchema, { method: 'POST', body }),
  replace: (id: string, body: WikiEntryInputPayload) =>
    apiRequest(`/admin/wiki/${id}`, wikiEntryResponseSchema, { method: 'PUT', body }),
  reorder: (body: { kind: WikiKind; bookId?: string | undefined; ids: string[] }) =>
    apiRequest('/admin/wiki/reorder', wikiListResponseSchema, { method: 'PATCH', body }),
};

export const uploadsApi = {
  sign: (purpose: (typeof UPLOAD_PURPOSES)[number], resource: 'image' | 'video') =>
    apiRequest('/admin/uploads/image-signature', imageSignatureResponseSchema, {
      method: 'POST',
      body: { purpose, resource },
    }),
};

export const accessApi = {
  list: (bookId?: string) =>
    apiRequest(`/admin/access-tokens${query({ bookId })}`, accessTokenListResponseSchema),
  create: (body: CreateAccessTokenRequest) =>
    apiRequest('/admin/access-tokens', accessTokenResponseSchema, { method: 'POST', body }),
  revoke: (id: string, reason?: string) =>
    apiRequest(`/admin/access-tokens/${id}/revoke`, accessTokenResponseSchema, {
      method: 'POST',
      body: reason ? { reason } : {},
    }),
  rotate: (id: string) =>
    apiRequest(`/admin/access-tokens/${id}/rotate`, accessTokenResponseSchema, { method: 'POST' }),
  /** Enlaces de descarga (el navegador envía la cookie de sesión; el archivo contiene el token y no se guarda en caché). */
  svgUrl: (id: string) => `/api/admin/access-tokens/${id}/qr.svg`,
  pdfUrl: (id: string) => `/api/admin/access-tokens/${id}/qr.pdf`,
};

export const extrasApi = {
  list: (bookId: string) =>
    apiRequest(`/admin/extras${query({ bookId })}`, extraListResponseSchema),
  get: (id: string) => apiRequest(`/admin/extras/${id}`, extraResponseSchema),
  create: (body: ExtraInputPayload) =>
    apiRequest('/admin/extras', extraResponseSchema, { method: 'POST', body }),
  replace: (id: string, body: ExtraInputPayload) =>
    apiRequest(`/admin/extras/${id}`, extraResponseSchema, { method: 'PUT', body }),
  uploadUrl: (body: ExtraUploadUrlRequest) =>
    apiRequest('/admin/extras/upload-url', extraUploadUrlResponseSchema, { method: 'POST', body }),
  preview: (id: string) => apiRequest(`/admin/extras/${id}/preview`, extraPreviewResponseSchema),
};

/** Claves de TanStack Query del panel (para invalidar tras guardar). */
export const keys = {
  books: ['admin', 'books'] as const,
  book: (id: string) => ['admin', 'books', id] as const,
  quizzes: (bookId: string) => ['admin', 'quizzes', 'list', bookId] as const,
  quiz: (id: string) => ['admin', 'quizzes', id] as const,
  versions: (id: string) => ['admin', 'quizzes', id, 'versions'] as const,
  access: (bookId: string) => ['admin', 'access', bookId] as const,
  extras: (bookId: string) => ['admin', 'extras', bookId] as const,
  extra: (id: string) => ['admin', 'extras', 'one', id] as const,
  wiki: ['admin', 'wiki'] as const,
  wikiEntry: (id: string) => ['admin', 'wiki', 'entry', id] as const,
};
