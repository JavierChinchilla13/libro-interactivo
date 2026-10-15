import { gameSessionResponseSchema } from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/** Llamadas del juego. El servidor decide el acceso y cada transición; el cliente solo manda el id de la decisión. */
export const gameApi = {
  start: (bookId: string) =>
    apiRequest(`/game/${bookId}/sessions`, gameSessionResponseSchema, { method: 'POST' }),
  get: (sessionId: string) => apiRequest(`/game/sessions/${sessionId}`, gameSessionResponseSchema),
  choose: (sessionId: string, choiceId: string) =>
    apiRequest(`/game/sessions/${sessionId}/choices`, gameSessionResponseSchema, {
      method: 'POST',
      body: { choiceId },
    }),
};
