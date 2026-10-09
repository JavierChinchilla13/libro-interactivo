import { fanArtListResponseSchema, reviewListResponseSchema } from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/** Llamadas públicas de fan arts y reseñas (sin sesión). */
export const communityApi = {
  fanArts: (bookId?: string) =>
    apiRequest(`/fan-arts${bookId ? `?bookId=${bookId}` : ''}`, fanArtListResponseSchema),
  reviews: (limit = 6) => apiRequest(`/reviews?limit=${limit}`, reviewListResponseSchema),
};

export const communityKeys = {
  fanArts: (bookId: string | undefined) => ['community', 'fan-arts', bookId ?? 'todos'] as const,
  reviews: ['community', 'reviews'] as const,
};
