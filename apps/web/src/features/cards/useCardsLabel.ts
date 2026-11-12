import { CARDS_LABEL_DEFAULT, CARDS_LABEL_MAX } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { publicApi, publicKeys } from '../home/api';

const STORAGE_KEY = 'libro_cards_label';

/** El último nombre que se vio: así el menú no parpadea con «Hallazgos» en cada visita mientras llega el de la autora. */
function cachedLabel(): string | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? value.slice(0, CARDS_LABEL_MAX) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Cómo se llama la sección de cartas (la autora lo elige en la administración; por defecto «Hallazgos»). Lo usan el menú
 * del panel de la lectora, los títulos de sus pantallas y el panel de administración. Los identificadores internos
 * (`cards`, `card`, las rutas) no cambian. Siempre devuelve un texto: nunca deja el menú vacío.
 */
export function useCardsLabel(enabled = true): string {
  const site = useQuery({
    queryKey: publicKeys.site,
    queryFn: publicApi.site,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const live = site.data?.cardsLabel;
  useEffect(() => {
    if (!live) return;
    try {
      localStorage.setItem(STORAGE_KEY, live);
    } catch {
      /* sin almacenamiento: el nombre sigue llegando del servidor */
    }
  }, [live]);
  return live ?? cachedLabel() ?? CARDS_LABEL_DEFAULT;
}
