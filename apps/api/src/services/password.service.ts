import { hash, verify } from '@node-rs/argon2';
import { randomToken } from '../lib/crypto.js';

// Argon2id (algoritmo por defecto de la librería) con los parámetros mínimos recomendados por OWASP.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Devuelve false (nunca lanza) si el hash es inválido o no coincide. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | undefined;

/**
 * Hash de relleno: al iniciar sesión con un correo inexistente se verifica contra este hash
 * para que el tiempo de respuesta no delate si la cuenta existe.
 */
export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomToken());
  return dummyHashPromise;
}
