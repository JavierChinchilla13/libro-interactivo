import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { publicApi, publicKeys } from '../../features/home/api';
import { thumbUrl } from '../lib/cloudinary';

const WIDTHS = [828, 1080, 1920] as const;

/**
 * Pintura de fondo del sitio: una capa fija detrás de todo (nunca `background-attachment: fixed`, que falla en iOS).
 * No es el LCP: carga con prioridad baja y entra con un fundido de `opacity`; mientras tanto (o sin imagen) se ve el
 * color liso `--token-bg`. Un velo oscuro encima mantiene el contraste AA del texto.
 */
export function PageBackground() {
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const image = site.data?.universe.background;
  const [loaded, setLoaded] = useState(false);

  // Las bandas solo se aclaran cuando la pintura ya se ve: si la imagen no carga, el sitio queda como siempre.
  useEffect(() => {
    if (!image || !loaded) return;
    document.documentElement.dataset['pageBg'] = '';
    return () => {
      delete document.documentElement.dataset['pageBg'];
    };
  }, [image, loaded]);

  if (!image) return null;
  const srcSet = WIDTHS.map((width) => `${thumbUrl(image.url, width)} ${width}w`).join(', ');
  return (
    <div aria-hidden="true" className="page-bg" data-loaded={loaded || undefined}>
      <img
        src={thumbUrl(image.url, 1080)}
        srcSet={srcSet}
        sizes="100vw"
        alt=""
        width={image.width}
        height={image.height}
        decoding="async"
        fetchPriority="low"
        draggable={false}
        onLoad={() => setLoaded(true)}
        ref={(node) => {
          if (node?.complete) setLoaded(true);
        }}
      />
    </div>
  );
}
