import { z } from 'zod';
import { healthResponseSchema } from '@libro/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('valida la respuesta con el esquema compartido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'raro' }), { status: 200 })),
    );
    await expect(apiRequest('/health', healthResponseSchema)).rejects.toThrow();
  });

  it('convierte el error estándar del API en ApiClientError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'No permitido' } }), {
            status: 403,
          }),
      ),
    );
    await expect(apiRequest('/x', healthResponseSchema)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('informa NETWORK si no hay conexión', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fallo de red');
      }),
    );
    const error = await apiRequest('/x', healthResponseSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('NETWORK');
  });

  describe('respuestas tempranas de index.html', () => {
    const ok = { status: 'ok', db: 'up', uptimeSeconds: 12 };
    afterEach(() => {
      delete (window as unknown as { __early?: unknown }).__early;
    });

    it('usa la respuesta que ya se pidió, una sola vez, sin repetir la petición', async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(ok), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      (window as unknown as { __early: unknown }).__early = {
        '/health': Promise.resolve(new Response(JSON.stringify(ok), { status: 200 })),
      };
      await expect(apiRequest('/health', healthResponseSchema)).resolves.toMatchObject({
        status: 'ok',
      });
      expect(fetchMock).not.toHaveBeenCalled();
      // La segunda vez ya no hay respuesta temprana: pide como siempre.
      await apiRequest('/health', healthResponseSchema);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('al iniciar o cerrar sesión se descarta la respuesta temprana de /me/library (era de otra sesión)', async () => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const early = {
        '/me/library': Promise.resolve(new Response('{"books":["de la sesión anterior"]}')),
      };
      (window as unknown as { __early: unknown }).__early = early;
      await apiRequest('/auth/logout', z.unknown(), { method: 'POST' });
      expect(early).not.toHaveProperty('/me/library');
    });

    it('si la petición temprana falló, pide por su cuenta', async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(ok), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      (window as unknown as { __early: unknown }).__early = { '/health': Promise.resolve(null) };
      await apiRequest('/health', healthResponseSchema);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('un error del API en la respuesta temprana se trata igual que en una petición normal', async () => {
      (window as unknown as { __early: unknown }).__early = {
        '/health': Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'No' } }), {
            status: 403,
          }),
        ),
      };
      await expect(apiRequest('/health', healthResponseSchema)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
