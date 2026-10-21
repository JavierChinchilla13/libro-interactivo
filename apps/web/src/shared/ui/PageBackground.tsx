import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { publicApi, publicKeys } from '../../features/home/api';
import { booksApi, readerKeys } from '../../features/reader/api';
import { useSelectedBookId } from '../../features/reader/bookSelection';
import { pickBook, type BookFallback } from '../../features/reader/useBook';
import { isHex, isUsableBackground, isUsablePrimary } from '../lib/color';
import { thumbUrl } from '../lib/cloudinary';

/** Hasta 1280 px: bajo un velo oscuro más resolución no se nota y cuesta bytes y memoria de decodificación. */
const WIDTHS = [828, 1080, 1280] as const;

/**
 * Pintura de fondo del sitio y tema del libro. Una capa fija detrás de todo (nunca `background-attachment: fixed`, que
 * falla en iOS). No es el LCP: carga con prioridad baja y entra con un fundido de `opacity`; mientras tanto (o sin
 * imagen) se ve el color liso `--token-bg`. Un velo oscuro encima mantiene el contraste AA del texto.
 *
 * El libro activo (el elegido en este navegador y, si no, el de respaldo de la pantalla: el destacado en la portada y
 * el primero en el panel y la wiki) puede traer su propio tema, editable en el panel: su fondo de imagen reemplaza la
 * pintura del sitio, un fondo de color reemplaza `--token-bg` y su color primario reemplaza `--token-primary`. Cada
 * color solo se aplica si mantiene el contraste (ver `shared/lib/color.ts`); si no, se ignora y el sitio queda con la
 * paleta de siempre. La imagen no se pide hasta saber qué libro está activo, para no descargar dos.
 */
export function PageBackground({ fallback }: { fallback?: BookFallback }) {
  const { pathname } = useLocation();
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const chosen = useSelectedBookId();
  // En la portada manda el libro destacado; en la wiki y el panel, el primero (como `useSelectedBook`).
  const rule: BookFallback = fallback ?? (pathname.startsWith('/wiki') ? 'first' : 'featured');
  const theme = pickBook(books.data?.books ?? [], chosen, rule)?.theme;
  const themeBackground = theme?.background;
  const themeColor =
    themeBackground?.type === 'color' && isUsableBackground(themeBackground.color)
      ? themeBackground.color
      : undefined;
  const themeImage = themeBackground?.type === 'image' ? themeBackground.image : undefined;
  // Un fondo de color del libro, o su imagen, tiene prioridad sobre la pintura del sitio.
  const decided = books.isFetched || books.isError;
  const image = !decided
    ? undefined
    : (themeImage ?? (themeColor ? undefined : site.data?.universe.background));
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loaded = image !== undefined && loadedUrl === image.url;

  const primary =
    isHex(theme?.primaryColor) && isUsablePrimary(theme.primaryColor, themeColor)
      ? theme.primaryColor
      : undefined;

  // Colores del tema del libro (se quitan al salir, para no dejar rastro en otras pantallas).
  useEffect(() => {
    const root = document.documentElement;
    if (themeColor) root.style.setProperty('--token-bg', themeColor);
    if (primary) root.style.setProperty('--token-primary', primary);
    return () => {
      root.style.removeProperty('--token-bg');
      root.style.removeProperty('--token-primary');
    };
  }, [themeColor, primary]);

  // Las bandas solo se aclaran cuando la pintura ya se ve: si la imagen no carga, el sitio queda como siempre.
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset['pageBg'] = '';
    return () => {
      delete document.documentElement.dataset['pageBg'];
    };
  }, [loaded]);

  if (!image) return null;
  const srcSet = WIDTHS.map((width) => `${thumbUrl(image.url, width)} ${width}w`).join(', ');
  return (
    <div aria-hidden="true" className="page-bg" data-loaded={loaded || undefined}>
      <img
        key={image.url}
        src={thumbUrl(image.url, 1080)}
        srcSet={srcSet}
        sizes="100vw"
        alt=""
        width={image.width}
        height={image.height}
        decoding="async"
        fetchPriority="low"
        draggable={false}
        onLoad={() => setLoadedUrl(image.url)}
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0) setLoadedUrl(image.url);
        }}
      />
    </div>
  );
}
