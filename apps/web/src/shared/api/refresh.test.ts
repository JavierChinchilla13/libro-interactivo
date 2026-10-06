import { messageResponseSchema } from '@libro/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const unauthenticated = () =>
  json({ error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión' } }, 401);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renovación silenciosa de la sesión', () => {
  it('ante un 401 renueva con /auth/refresh y reintenta la petición una vez', async () => {
    const calls: string[] = [];
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url === '/api/auth/refresh') return json({ user: {} });
        if (first) {
          first = false;
          return unauthenticated();
        }
        return json({ message: 'ok' });
      }),
    );
    await expect(apiRequest('/admin/books', messageResponseSchema)).resolves.toEqual({
      message: 'ok',
    });
    expect(calls).toEqual(['/api/admin/books', '/api/auth/refresh', '/api/admin/books']);
  });

  it('si la renovación falla propaga el 401 sin reintentar en bucle', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/auth/refresh' ? unauthenticated() : unauthenticated(),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/me', messageResponseSchema)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // petición + un intento de renovar
  });

  it('un segundo 401 tras renovar se propaga (no hay más reintentos)', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/auth/refresh' ? json({}) : unauthenticated(),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/me', messageResponseSchema)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // petición, renovar, petición reintentada
  });

  it('las rutas de /auth no intentan renovar (un login incorrecto es un 401 normal)', async () => {
    const fetchMock = vi.fn(async () =>
      json({ error: { code: 'AUTH_INVALID', message: 'Credenciales inválidas' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      apiRequest('/auth/login', messageResponseSchema, { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('varias peticiones con 401 a la vez comparten UNA sola renovación', async () => {
    let refreshes = 0;
    const seen = new Set<string>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/refresh') {
          refreshes += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return json({});
        }
        if (!seen.has(url)) {
          seen.add(url);
          return unauthenticated();
        }
        return json({ message: 'ok' });
      }),
    );
    const results = await Promise.all([
      apiRequest('/a', messageResponseSchema),
      apiRequest('/b', messageResponseSchema),
      apiRequest('/c', messageResponseSchema),
    ]);
    expect(results).toHaveLength(3);
    expect(refreshes).toBe(1);
  });

  it('un error distinto de 401 no renueva', async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: 'FORBIDDEN', message: 'No' } }, 403));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/admin/books', messageResponseSchema)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
