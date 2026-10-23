import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/session';
import { readerApi, readerKeys } from './api';

/** «Tus libros» de la persona con sesión. La clave lleva el usuario para no reutilizar lo de otra cuenta. */
export function useLibrary() {
  const session = useSession();
  const userId = session.data?.id ?? '';
  return useQuery({
    queryKey: readerKeys.library(userId),
    queryFn: readerApi.library,
    enabled: userId !== '',
    // Al volver de un quiz o de canjear un QR el avance debe estar al día.
    staleTime: 0,
  });
}
