/** Nombre de la cookie-pista que pone el servidor al iniciar sesión (ver `HINT_COOKIE` en el API). */
export const SESSION_HINT = 'libro_s';

/**
 * ¿Hay una sesión que valga la pena preguntar? Sin la pista (visita anónima) no se pide `/me` ni se intenta renovar la
 * sesión: así no quedan errores 401 en la consola. No es seguridad: el servidor decide con sus propias cookies.
 */
export function hasSessionHint(): boolean {
  try {
    return document.cookie.split('; ').some((part) => part === `${SESSION_HINT}=1`);
  } catch {
    return false;
  }
}
