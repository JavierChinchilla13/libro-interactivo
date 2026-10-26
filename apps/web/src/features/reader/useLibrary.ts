import { useQuery } from '@tanstack/react-query';
import { readerApi, readerKeys } from './api';

/**
 * «Tus libros» de la persona con sesión. Se pide sin esperar a `/me` (las dos llamadas salen a la vez): al entrar y al
 * salir de la cuenta se descarta la caché de todo lo que no es la sesión, así que nada de otra cuenta se reutiliza.
 */
export function useLibrary(enabled = true) {
  return useQuery({
    enabled,
    queryKey: readerKeys.library,
    queryFn: readerApi.library,
    // Al volver de un quiz o de canjear un QR el avance debe estar al día.
    staleTime: 0,
  });
}
