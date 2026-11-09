import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación propia de la firma de los webhooks de Resend (firmados con Svix), sin dependencias:
 * - contenido firmado: `${svix-id}.${svix-timestamp}.${cuerpo crudo}`;
 * - clave: el secreto `whsec_…` sin el prefijo, decodificado de base64;
 * - firma: HMAC-SHA256 en base64; la cabecera `svix-signature` trae una o varias, separadas por espacios, como
 *   `v1,<firma>` (varias si el secreto se está rotando: basta que una coincida);
 * - la marca de tiempo (segundos) no puede alejarse más de `toleranceSeconds` de la hora actual (evita reenvíos viejos).
 */
export interface SvixHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export function signSvix(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export function verifySvix(
  secret: string,
  headers: SvixHeaders,
  body: string,
  now: Date,
  toleranceSeconds = SVIX_TOLERANCE_SECONDS,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const expected = Buffer.from(signSvix(secret, id, timestamp, body), 'base64');
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
