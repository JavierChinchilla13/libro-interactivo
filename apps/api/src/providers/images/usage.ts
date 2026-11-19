import type { CloudinaryUsage } from '@libro/shared';

/**
 * Convierte la respuesta de `GET /usage` de Cloudinary en el contrato del panel. Los planes por créditos y los antiguos
 * devuelven formas distintas, así que todo se lee de forma tolerante: un campo que falta o no es un número se omite, y
 * nunca se copia nada que no sea una cifra o el nombre del plan (ni claves, ni el nombre de la cuenta).
 *
 * Plan por créditos (comprobado en la cuenta real, plan «Free»):
 *   `credits: { usage, limit, used_percent }`, `storage: { usage (bytes), credits_usage }`,
 *   `bandwidth: { usage (bytes), credits_usage }`. No informa un tope de almacenamiento.
 * Plan antiguo: `storage: { usage, limit }` y `bandwidth: { usage, limit }` en bytes, sin `credits`.
 */
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const positive = (value: unknown): number | undefined => {
  const n = num(value);
  return n !== undefined && n > 0 ? n : undefined;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

function bytesOf(raw: unknown): CloudinaryUsage['storage'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const bytes = num(record['usage']);
  if (bytes === undefined) return undefined;
  return { bytes, limitBytes: positive(record['limit']) ?? null };
}

export function normalizeCloudinaryUsage(raw: unknown, now: Date): CloudinaryUsage {
  const body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: CloudinaryUsage = { available: true, checkedAt: now.toISOString() };

  if (typeof body['plan'] === 'string' && body['plan'].trim())
    out.plan = body['plan'].trim().slice(0, 60);

  const credits = body['credits'];
  if (typeof credits === 'object' && credits !== null) {
    const record = credits as Record<string, unknown>;
    const used = num(record['usage']);
    const limit = positive(record['limit']);
    if (used !== undefined && limit !== undefined) {
      const reported = num(record['used_percent']);
      out.credits = { used, limit, percent: round1(reported ?? (used / limit) * 100) };
    }
  }

  const storage = bytesOf(body['storage']);
  if (storage) out.storage = storage;
  const bandwidth = bytesOf(body['bandwidth']);
  if (bandwidth) out.bandwidth = bandwidth;

  if (typeof body['last_updated'] === 'string' && body['last_updated'].length <= 40) {
    out.lastUpdated = body['last_updated'];
  }

  // Sin ninguna cifra útil no hay nada que mostrar: se trata como «no disponible».
  if (!out.credits && !out.storage && !out.bandwidth) {
    return {
      available: false,
      reason: 'Cloudinary no informó el uso de esta cuenta.',
      checkedAt: out.checkedAt,
    };
  }
  return out;
}
