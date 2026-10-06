import { createHmac, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './crypto.js';

/**
 * Token de un QR: `<id>.<base64url(HMAC-SHA256(secreto, id))>`.
 * En la BD solo se guarda el hash del token; como la firma se puede recalcular a partir del id, el servidor
 * regenera el MISMO QR cuantas veces haga falta sin guardarlo, y una filtración de la BD no revela tokens válidos.
 */
const ID_PATTERN = /^[0-9a-f]{24}$/;

function signature(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

export function buildAccessToken(id: string, secret: string): string {
  return `${id}.${signature(id, secret)}`;
}

/** Devuelve el id si el token es auténtico (HMAC correcto, comparado en tiempo constante); si no, `null`. */
export function parseAccessToken(token: string, secret: string): string | null {
  if (token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [id, given] = parts as [string, string];
  if (!ID_PATTERN.test(id)) return null;
  const expected = Buffer.from(signature(id, secret));
  const received = Buffer.from(given);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return id;
}

/** Hash que se guarda en la BD (único). */
export function hashAccessToken(token: string): string {
  return `sha256:${sha256Hex(token)}`;
}
