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
});
