import { createHash, createHmac, randomBytes } from 'node:crypto';

/** Token opaco aleatorio (por defecto 256 bits) en base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hash para guardar tokens de un solo uso o de refresco: nunca se guarda el token en claro. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** IP con HMAC para anti-abuso sin almacenar la dirección. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}
