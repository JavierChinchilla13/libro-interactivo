import type { PublicFanArt } from '@libro/shared';
import { useState, type CSSProperties } from 'react';
import { thumbUrl } from '../../shared/lib/cloudinary';

/** Cómo se acomodan los fan arts según cuántos hay: nunca depende de que haya cinco. */
export type GalleryShape = 'empty' | 'single' | 'rows' | 'mosaic';

/** Una sola pieza se destaca; de 2 a 7 van en hileras centradas; desde 8 hay suficientes para un mosaico. */
export const MOSAIC_FROM = 8;

export function galleryShape(count: number): GalleryShape {
  if (count <= 0) return 'empty';
  if (count === 1) return 'single';
  return count < MOSAIC_FROM ? 'rows' : 'mosaic';
}

/** Proporción ancho/alto de la imagen declarada (1 si falta o es inválida: nunca se estira). */
export function ratioOf(art: PublicFanArt): number {
  const { width, height } = art.image;
  return width > 0 && height > 0 ? Math.min(Math.max(width / height, 0.4), 2.5) : 1;
}

const label = (art: PublicFanArt) => `Ampliar el fan art ${art.title ?? `de ${art.artistName}`}`;

/** Título (si hay) y artista, recortados a dos líneas con el texto completo en `title`. */
function Caption({ art }: { art: PublicFanArt }) {
  return (
    <div className="mt-2 min-w-0 text-sm">
      {art.title ? (
        <p className="line-clamp-2 font-semibold [overflow-wrap:anywhere]" title={art.title}>
          {art.title}
        </p>
      ) : null}
      <p className="line-clamp-2 text-muted [overflow-wrap:anywhere]" title={art.artistName}>
        Por {art.artistName}
      </p>
    </div>
  );
}

/** La obra dentro de su marco, con su proporción real; si la imagen no carga queda un marco liso con aviso. */
function Piece({
  art,
  width,
  eager,
  onOpen,
}: {
  art: PublicFanArt;
  width: number;
  eager?: boolean;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label(art)}
      className="img-frame block w-full overflow-hidden rounded-token-md bg-surface-alt"
      style={{ aspectRatio: ratioOf(art) }}
    >
      {failed ? (
        <span className="grid size-full place-items-center p-3 text-center text-xs text-muted">
          Imagen no disponible
        </span>
      ) : (
        <img
          src={thumbUrl(art.image.url, width)}
          alt={art.image.alt}
          width={art.image.width}
          height={art.image.height}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </button>
  );
}

/**
 * Fan arts en galería: forma según la cantidad (`galleryShape`).
 * - Una pieza: destacada y centrada, a su proporción y sin pasar de 70 % del alto de la pantalla.
 * - De 2 a 7: hileras centradas; todas con la misma altura y el ancho que da su proporción (nada se estira ni se
 *   recorta), con el título y el artista debajo.
 * - Desde 8: mosaico por columnas con proporciones reales y sin huecos.
 */
export function FanArtGallery({
  arts,
  onOpen,
}: {
  arts: readonly PublicFanArt[];
  onOpen: (index: number) => void;
}) {
  const shape = galleryShape(arts.length);
  const first = arts[0];

  if (shape === 'single' && first) {
    return (
      <ul aria-label="Fan arts" className="flex justify-center" data-shape="single">
        <li className="fan-single min-w-0" style={{ '--ratio': ratioOf(first) } as CSSProperties}>
          <Piece art={first} width={960} eager onOpen={() => onOpen(0)} />
          <Caption art={first} />
        </li>
      </ul>
    );
  }

  if (shape === 'rows') {
    return (
      <ul
        aria-label="Fan arts"
        data-shape="rows"
        className="fan-rows flex flex-wrap justify-center gap-x-4 gap-y-6"
      >
        {arts.map((art, index) => (
          <li
            key={art.id}
            className="min-w-0 max-w-full"
            style={{ width: `calc(var(--row-h) * ${ratioOf(art)})` } as CSSProperties}
          >
            <Piece art={art} width={640} onOpen={() => onOpen(index)} />
            <Caption art={art} />
          </li>
        ))}
      </ul>
    );
  }

  if (shape === 'mosaic') {
    return (
      <ul
        aria-label="Fan arts"
        data-shape="mosaic"
        className="columns-2 gap-3 sm:columns-3 lg:columns-4"
      >
        {arts.map((art, index) => (
          <li key={art.id} className="mb-4 break-inside-avoid">
            <Piece art={art} width={480} onOpen={() => onOpen(index)} />
            <Caption art={art} />
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
