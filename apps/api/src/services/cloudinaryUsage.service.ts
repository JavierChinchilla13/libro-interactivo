import type { CloudinaryUsage } from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { ImageProvider } from '../providers/images/ImageProvider.js';

/** La API de administración de Cloudinary tiene un tope de llamadas por hora: se consulta como mucho cada 10 minutos. */
export const USAGE_CACHE_MS = 10 * 60_000;
/** Si falla, se reintenta pronto (un minuto) sin martillar a Cloudinary mientras tanto. */
export const USAGE_FAILURE_CACHE_MS = 60_000;

/**
 * Uso de la cuenta de Cloudinary para el panel (solo ADMIN). Guarda el resultado en memoria y junta las consultas que
 * llegan a la vez en una sola. **Nunca falla hacia el cliente**: si Cloudinary no responde o no está configurado, devuelve
 * `available: false` con una razón corta y el panel sigue funcionando. Lo que sale es solo lo que ya normalizó el
 * proveedor (cifras y el nombre del plan); en el registro solo va el mensaje del error, nunca una clave ni una respuesta.
 */
export function createCloudinaryUsageService(deps: {
  images: ImageProvider;
  clock: Clock;
  logger?: Logger;
  ttlMs?: number;
  failureTtlMs?: number;
}) {
  const ttl = deps.ttlMs ?? USAGE_CACHE_MS;
  const failureTtl = deps.failureTtlMs ?? USAGE_FAILURE_CACHE_MS;
  let cached: { until: number; value: CloudinaryUsage } | null = null;
  let inFlight: Promise<CloudinaryUsage> | null = null;

  async function fetchFresh(): Promise<CloudinaryUsage> {
    const now = deps.clock();
    try {
      const value = await deps.images.usage();
      cached = { until: now.getTime() + ttl, value };
      return value;
    } catch (error) {
      deps.logger?.warn(
        { reason: error instanceof AppError ? error.message : 'error inesperado' },
        'No se pudo consultar el uso de Cloudinary',
      );
      const value: CloudinaryUsage = {
        available: false,
        reason:
          error instanceof AppError ? error.message : 'No pudimos consultar el uso de Cloudinary',
        checkedAt: now.toISOString(),
      };
      cached = { until: now.getTime() + failureTtl, value };
      return value;
    }
  }

  return {
    async get(): Promise<CloudinaryUsage> {
      if (cached && cached.until > deps.clock().getTime()) return cached.value;
      inFlight ??= fetchFresh().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

export type CloudinaryUsageService = ReturnType<typeof createCloudinaryUsageService>;
