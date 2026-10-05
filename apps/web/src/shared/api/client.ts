import { apiErrorSchema, type ErrorCode } from '@libro/shared';
import type { ZodType } from 'zod';

/** Error devuelto por el API (o de red). `code` es estable; el texto lo decide la pantalla. */
export class ApiClientError extends Error {
  constructor(
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Cliente tipado: valida la respuesta con el esquema Zod compartido, así web y api
 * no pueden desalinearse sin que una prueba o el typecheck lo detecte.
 * Las cookies de sesión (httpOnly) viajan con `credentials: 'include'`.
 */
export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? null,
    });
  } catch {
    throw new ApiClientError('NETWORK', 'No se pudo conectar con el servidor');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiClientError('INTERNAL', 'Respuesta inesperada del servidor', response.status);
  }

  return schema.parse(payload);
}
