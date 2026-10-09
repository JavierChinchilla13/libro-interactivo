import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../shared/api/client';
import { createQueryClient } from './providers';

type Retry = (failureCount: number, error: unknown) => boolean;
const retry = () => createQueryClient().getDefaultOptions().queries?.retry as Retry;

describe('reintentos de consultas', () => {
  it('no reintenta un 4xx: un 403 o un 404 no cambia al repetirlo', () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(retry()(0, new ApiClientError('FORBIDDEN', 'x', status))).toBe(false);
    }
  });

  it('reintenta poco un 5xx o un corte de red y luego se rinde', () => {
    expect(retry()(0, new ApiClientError('INTERNAL', 'x', 500))).toBe(true);
    expect(retry()(1, new ApiClientError('NETWORK', 'sin conexión'))).toBe(true);
    expect(retry()(2, new ApiClientError('INTERNAL', 'x', 503))).toBe(false);
  });

  it('un error desconocido también se reintenta poco', () => {
    expect(retry()(0, new Error('boom'))).toBe(true);
    expect(retry()(2, new Error('boom'))).toBe(false);
  });
});
