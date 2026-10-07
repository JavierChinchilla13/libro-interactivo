import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AppProviders, createQueryClient } from '../app/providers';
import { createTestRouter } from '../app/router';

/** Ayudantes de las pruebas de pantallas: simulan el API por «MÉTODO /ruta» y pintan la app en una dirección. */

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
export const empty = (status = 204) => new Response(null, { status });
export const apiError = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

export const READER = {
  id: '670000000000000000000001',
  name: 'Lectora Prueba',
  email: 'lectora@ejemplo.com',
  role: 'USER',
};
export const BOOK_ID = '670000000000000000000010';
export const BOOK = {
  id: BOOK_ID,
  slug: 'libro-1',
  title: '[PLACEHOLDER] Libro 1',
  order: 1,
  status: 'published',
};

export type Handler = (request: {
  url: string;
  method: string;
  body: unknown;
}) => Response | Promise<Response>;

/**
 * `handlers` se busca por `"MÉTODO /ruta"` exacta (con la query). Por defecto hay sesión de lectora, un libro
 * publicado y sin mensaje de bienvenida; cada prueba pisa lo que necesite. Devuelve el `fetch` simulado.
 */
export function mockApi(
  handlers: Record<string, Handler | Response> = {},
  options: { session?: typeof READER | null } = {},
) {
  const session = options.session === undefined ? READER : options.session;
  const defaults: Record<string, Handler | Response> = {
    'GET /api/me': session
      ? () => json({ user: session })
      : () => apiError('UNAUTHENTICATED', 'Debes iniciar sesión', 401),
    'POST /api/auth/refresh': () => apiError('UNAUTHENTICATED', 'Debes iniciar sesión', 401),
    'GET /api/books': () => json({ books: [BOOK] }),
    'GET /api/me/welcome': () => json({ show: false }),
    'POST /api/me/welcome-seen': () => empty(),
  };
  const table = { ...defaults, ...handlers };
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url: input, method, body });
    const handler = table[`${method} ${input}`];
    if (!handler) return apiError('NOT_FOUND', 'No encontrado', 404);
    return typeof handler === 'function' ? handler({ url: input, method, body }) : handler.clone();
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    calls,
    called: (key: string) => calls.filter((call) => `${call.method} ${call.url}` === key),
  };
}

export function renderAt(path: string) {
  return render(
    <AppProviders client={createQueryClient()}>
      <RouterProvider router={createTestRouter([path])} />
    </AppProviders>,
  );
}
