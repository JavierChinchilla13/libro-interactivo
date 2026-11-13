import { readerCardDetailSchema, readerCardsResponseSchema } from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/**
 * Llamadas del lector a sus cartas. El servidor decide cada vez qué se abre: sin haber escaneado el QR no llega ni
 * el título ni la imagen. Las URL de imagen solo existen en estas respuestas (no se guardan en ningún otro lugar).
 */
export const cardsApi = {
  list: () => apiRequest('/cards', readerCardsResponseSchema),
  get: (id: string) => apiRequest(`/cards/${id}`, readerCardDetailSchema),
};

export const cardKeys = {
  all: ['cards'] as const,
  list: ['cards', 'list'] as const,
  one: (id: string) => ['cards', 'one', id] as const,
};
