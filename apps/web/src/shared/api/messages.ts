import { ApiClientError } from './client';

/** Texto para mostrar de un error del API. Los mensajes de validación y de conflicto ya vienen en español. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'NETWORK':
        return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
      case 'UNAUTHENTICATED':
        return 'Tu sesión caducó. Vuelve a ingresar.';
      case 'FORBIDDEN':
        return 'No tienes permiso para hacer esto.';
      case 'RATE_LIMITED':
        return 'Demasiados intentos. Espera un momento.';
      case 'UNAVAILABLE':
        return error.message;
      case 'INTERNAL':
        return 'Algo salió mal en el servidor. Inténtalo de nuevo.';
      default:
        return error.message;
    }
  }
  return 'Ocurrió un error inesperado.';
}

/** Errores por campo a partir de una validación Zod: `{ 'cover': 'mensaje', 'purchaseLinks.0.url': 'mensaje' }`. */
export function fieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
