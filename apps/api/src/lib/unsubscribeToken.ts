import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token del enlace de baja de los correos de novedades: `base64url(id de la cuenta) + '.' + HMAC-SHA256`. No se guarda
 * en la base (no es de un solo uso: darse de baja dos veces no hace nada) y no caduca, para que el enlace de un correo
 * viejo siga sirviendo. La etiqueta `baja:` separa esta firma de cualquier otro uso del mismo secreto.
 */
const LABEL = 'baja:';
const OBJECT_ID = /^[0-9a-f]{24}$/;

function sign(userId: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${LABEL}${userId}`).digest();
}

export function createUnsubscribeToken(userId: string, secret: string): string {
  const id = Buffer.from(userId, 'utf8').toString('base64url');
  return `${id}.${sign(userId, secret).toString('base64url')}`;
}

/** El id de la cuenta si el token es auténtico; si no, `null` (sin decir por qué). Comparación en tiempo constante. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const [idPart, macPart, extra] = token.split('.');
  if (!idPart || !macPart || extra !== undefined) return null;
  let userId: string;
  let mac: Buffer;
  try {
    userId = Buffer.from(idPart, 'base64url').toString('utf8');
    mac = Buffer.from(macPart, 'base64url');
  } catch {
    return null;
  }
  if (!OBJECT_ID.test(userId)) return null;
  const expected = sign(userId, secret);
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return userId;
}
