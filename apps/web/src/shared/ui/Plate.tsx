import { useState } from 'react';
import { thumbUrl } from '../lib/cloudinary';

type Image = { url: string; alt: string; width: number; height: number };

/** Proporción más estrecha (2:3, de libro) y más apaisada (16:9) que muestra una placa sin recortar de más. */
const MIN_RATIO = 2 / 3;
const MAX_RATIO = 16 / 9;

/** Proporción de una imagen dentro de los límites de la placa: fuera de ellos se recorta (centrado). */
export function plateRatio(image: Pick<Image, 'width' | 'height'>): number {
  const ratio = image.width / image.height;
  if (!Number.isFinite(ratio) || ratio <= 0) return MIN_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/** Anchos de la miniatura que se ofrecen al navegador (Cloudinary: solo si la URL es de ahí). */
export const COVER_WIDTHS = [320, 480, 640, 720, 960] as const;

/**
 * La placa: el objeto-libro de la página.
 * - Con portada real (`cover`, de la BD): la caja reserva su proporción (la de la imagen, entre 2:3 y 16:9, con las
 *   medidas del dato) y la imagen la llena con `object-fit: cover`, posicionada en absoluto: sea cual sea su tamaño
 *   natural, nunca empuja ni desborda el diseño. Una portada apaisada conserva su forma (no se le recorta el 60 %);
 *   una portada de libro (2:3) llena la placa. `className` rige las portadas altas y `landscapeClassName` las apaisadas.
 *   `priority` marca la portada que es lo primero que se ve (carga sin demora y con prioridad alta).
 * - Sin portada es una portada tipográfica 2:3: el nombre del sitio en Cinzel (una línea pequeña espaciada y el
 *   título grande), un doble filete fino y nada más. Es decorativa (`aria-hidden`).
 */
export function Plate({
  cover,
  className = '',
  landscapeClassName,
  priority = false,
  sizes = '(min-width: 1024px) 440px, 320px',
  landscapeSizes,
  title,
}: {
  cover?: Image | undefined;
  className?: string;
  landscapeClassName?: string;
  priority?: boolean;
  /** Ancho con el que se muestra la portada (para elegir la miniatura); `landscapeSizes` rige las apaisadas. */
  sizes?: string;
  landscapeSizes?: string;
  /** Nombre del libro: se muestra si la portada no carga (en lugar del icono de imagen rota). */
  title?: string;
}) {
  // Qué portada falló: un fallo es de esa imagen, no de la placa (con otra portada se vuelve a intentar).
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (cover) {
    const ratio = plateRatio(cover);
    const landscape = ratio > 1;
    const srcSet = cover.url.includes('/upload/')
      ? COVER_WIDTHS.map((width) => `${thumbUrl(cover.url, width)} ${width}w`).join(', ')
      : undefined;
    return (
      <div
        data-plate="cover"
        data-landscape={landscape || undefined}
        data-failed={failedUrl === cover.url || undefined}
        style={{ aspectRatio: String(ratio) }}
        className={`img-frame relative overflow-hidden rounded-token-xs shadow-elev-2 ${
          landscape && landscapeClassName !== undefined ? landscapeClassName : className
        }`}
      >
        {failedUrl === cover.url ? (
          // Fondo sólido del tema con el título: ocupa el mismo hueco y no deja el icono de imagen rota.
          <div className="absolute inset-0 grid place-items-center bg-surface-alt p-4 text-center">
            {title ? (
              <p className="font-display text-lg leading-snug [overflow-wrap:anywhere]">{title}</p>
            ) : null}
          </div>
        ) : (
          <img
            src={thumbUrl(cover.url, 640)}
            srcSet={srcSet}
            sizes={srcSet ? (landscape && landscapeSizes ? landscapeSizes : sizes) : undefined}
            alt={cover.alt}
            width={cover.width}
            height={cover.height}
            decoding="async"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            onError={() => setFailedUrl(cover.url)}
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={`plate ${className}`}>
      <p className="plate-kicker">Universo</p>
      <p className="plate-name">Memorias</p>
      <span className="plate-rule" />
    </div>
  );
}

/** Primera letra del nombre (sin el marcador de borrador), para el retrato tipográfico. */
function initialOf(name: string): string {
  const clean = name.replace(/\[PLACEHOLDER\]/gi, '').trim();
  return (clean.match(/\p{L}/u)?.[0] ?? '').toUpperCase();
}

/**
 * Retrato en proporción 4:5. Con foto de la autora la muestra (recorte centrado); sin ella, la inicial de su nombre en
 * Cinzel dentro del mismo doble filete de la portada tipográfica.
 */
export function PortraitPlate({
  photo,
  name,
  className = '',
}: {
  photo?: Image | undefined;
  name: string;
  className?: string;
}) {
  if (photo) {
    return (
      <div
        data-plate="portrait"
        className={`img-frame relative aspect-[4/5] overflow-hidden rounded-token-xs shadow-elev-2 ${className}`}
      >
        <img
          src={thumbUrl(photo.url, 640)}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={`plate plate-portrait ${className}`}>
      <p className="plate-initial">{initialOf(name)}</p>
      <span className="plate-rule" />
    </div>
  );
}
