import { apiErrorSchema, type ErrorCode } from '@libro/shared';
import type { ZodType } from 'zod';
import { hasSessionHint } from './sessionHint';

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
  /** Uso interno: ya se reintentó tras renovar la sesión. */
  retried?: boolean;
}

/**
 * Respuestas que `index.html` pidió antes de que cargara la app (`/site`, `/books`). Cada una se entrega una sola vez;
 * si no existe (o la red falló) la petición se hace como siempre.
 */
function takeEarly(path: string): Promise<Response | null> | undefined {
  const registry = (window as unknown as { __early?: Record<string, Promise<Response | null>> })
    .__early;
  const found = registry?.[path];
  if (registry && found) delete registry[path];
  return found;
}

/** Al entrar, salir o crear una cuenta, lo que se pidió antes de la app (con la sesión anterior) ya no vale. */
const SESSION_CHANGES = ['/auth/login', '/auth/logout', '/auth/register', '/auth/google'];
function dropEarlySession(): void {
  const registry = (window as unknown as { __early?: Record<string, unknown> }).__early;
  if (!registry) return;
  for (const key of ['/me', '/me/library']) delete registry[key];
}

/** Una sola renovación a la vez: varias peticiones que reciben 401 juntas comparten el mismo intento. */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
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
  let response: Response | null = null;
  if (SESSION_CHANGES.includes(path)) dropEarlySession();
  const early =
    (options.method ?? 'GET') === 'GET' && !options.retried ? takeEarly(path) : undefined;
  if (early) response = await early;
  try {
    response ??= await fetch(`/api${path}`, {
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

  // El access token dura poco: ante un 401 se renueva la sesión (cookie de refresco) y se reintenta una vez.
  if (
    response.status === 401 &&
    !options.retried &&
    !path.startsWith('/auth/') &&
    hasSessionHint()
  ) {
    if (await refreshSession()) return apiRequest(path, schema, { ...options, retried: true });
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiClientError('INTERNAL', 'Respuesta inesperada del servidor', response.status);
  }

  return schema.parse(payload);
}

export interface DownloadedFile {
  blob: Blob;
  /** Nombre que propone el servidor (`Content-Disposition`), o `fallbackName`. */
  fileName: string;
}

/**
 * `POST` que devuelve un archivo (por ejemplo, el respaldo cifrado). Los errores llegan como JSON con la forma
 * estándar y se lanzan como `ApiClientError`; ante un 401 se renueva la sesión y se reintenta una vez, como
 * `apiRequest`. El cuerpo viaja en JSON, nunca en la URL.
 */
export async function apiDownload(
  path: string,
  body: unknown,
  fallbackName: string,
  retried = false,
): Promise<DownloadedFile> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError('NETWORK', 'No se pudo conectar con el servidor');
  }
  if (response.status === 401 && !retried && hasSessionHint() && (await refreshSession())) {
    return apiDownload(path, body, fallbackName, true);
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiClientError('INTERNAL', 'Respuesta inesperada del servidor', response.status);
  }
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    // La conexión se cortó a mitad de la descarga.
    throw new ApiClientError('NETWORK', 'La descarga se cortó antes de terminar');
  }
  const named = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '');
  return { blob, fileName: named?.[1] ?? fallbackName };
}

/** Hace que el navegador guarde `file` con su nombre (sin abrir pestañas). */
export function saveDownloadedFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Se suelta después: algunos navegadores leen la dirección un instante más tarde.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
