import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiDownload } from './client';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const file = (headers: Record<string, string> = {}) =>
  new Response('contenido', { status: 200, headers });

beforeEach(() => {
  document.cookie = 'libro_s=1; path=/';
});
afterEach(() => {
  document.cookie = 'libro_s=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  vi.unstubAllGlobals();
});

describe('apiDownload', () => {
  it('manda el cuerpo en JSON por POST y toma el nombre de Content-Disposition', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      file({ 'Content-Disposition': 'attachment; filename="r-2026.tar.cifrado"' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiDownload('/admin/backups', { a: 1 }, 'por-defecto.bin');
    expect(result.fileName).toBe('r-2026.tar.cifrado');
    expect(await result.blob.text()).toBe('contenido');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/backups');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"a":1}' });
  });

  it('sin nombre del servidor usa el de respaldo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => file()),
    );
    expect((await apiDownload('/x', {}, 'por-defecto.bin')).fileName).toBe('por-defecto.bin');
  });

  it('ante un 401 renueva la sesión y reintenta una vez', async () => {
    const calls: string[] = [];
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url === '/api/auth/refresh') return json({ user: {} });
        if (first) {
          first = false;
          return json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, 401);
        }
        return file();
      }),
    );
    await apiDownload('/admin/backups', {}, 'r.bin');
    expect(calls).toEqual(['/api/admin/backups', '/api/auth/refresh', '/api/admin/backups']);
  });

  it('los errores del API y de red llegan como ApiClientError con su código y mensaje', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { code: 'UNAVAILABLE', message: 'Pasa de 200 MB' } }, 503)),
    );
    await expect(apiDownload('/x', {}, 'r.bin')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Pasa de 200 MB',
      status: 503,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('sin red');
      }),
    );
    const error = await apiDownload('/x', {}, 'r.bin').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: 'NETWORK' });
  });
});
