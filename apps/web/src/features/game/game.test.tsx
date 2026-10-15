import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, BOOK_ID, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const SESSION_ID = '670000000000000000000050';

const scene = (over: Record<string, unknown> = {}) => ({
  id: 's01',
  title: '[PLACEHOLDER] Pasillos',
  background: { type: 'color', color: '#1a1a2e' },
  layers: [
    {
      id: 'l1',
      kind: 'shape',
      x: 50,
      y: 50,
      width: 20,
      shape: 'circle',
      color: '#a89bff',
      animation: { type: 'float' },
    },
  ],
  text: '[PLACEHOLDER] Despiertas en un pasillo.',
  choices: [
    { id: 'derecha', label: 'Ir a la derecha', hotspot: { x: 60, y: 20, w: 20, h: 40 } },
    { id: 'izquierda', label: 'Ir a la izquierda' },
  ],
  ...over,
});

const session = (over: Record<string, unknown> = {}) => ({
  sessionId: SESSION_ID,
  bookId: BOOK_ID,
  title: '[PLACEHOLDER] Juego',
  status: 'in_progress',
  attemptNumber: 1,
  isTest: false,
  scene: scene(),
  ...over,
});

describe('juego', () => {
  it('muestra la escena con botones de respaldo y avanza al elegir', async () => {
    const api = mockApi({
      [`POST /api/game/${BOOK_ID}/sessions`]: () => json(session()),
      [`POST /api/game/sessions/${SESSION_ID}/choices`]: () =>
        json(
          session({
            status: 'failed',
            scene: scene({
              id: 'fin',
              choices: [],
              ending: {
                key: 'derrumbe',
                kind: 'failed',
                title: '[PLACEHOLDER] Derrumbe',
                text: '[PLACEHOLDER] No lo lograste.',
              },
            }),
          }),
        ),
    });
    renderAt(`/panel/juego/${BOOK_ID}`);
    const fallback = await screen.findByRole('button', { name: 'Ir a la izquierda' });
    expect(screen.getByRole('button', { name: 'Ir a la derecha' })).toBeInTheDocument();
    await userEvent.click(fallback);
    expect(await screen.findByRole('heading', { name: '[PLACEHOLDER] Derrumbe' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Intentarlo de nuevo' })).toBeInTheDocument();
    expect(api.called(`POST /api/game/sessions/${SESSION_ID}/choices`)[0]?.body).toEqual({
      choiceId: 'izquierda',
    });
  });

  it('avisa con calma cuando el juego aún está bloqueado', async () => {
    mockApi({
      [`POST /api/game/${BOOK_ID}/sessions`]: () =>
        apiError('NOT_UNLOCKED', 'Aún no está disponible', 403),
    });
    renderAt(`/panel/juego/${BOOK_ID}`);
    expect(await screen.findByText(/todavía no está disponible/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al panel' })).toBeInTheDocument();
  });
});
