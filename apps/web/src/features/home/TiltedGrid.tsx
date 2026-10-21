import type { PublicSiteResponse } from '@libro/shared';
import { useState } from 'react';
import { thumbUrl } from '../../shared/lib/cloudinary';

type HeaderImage = NonNullable<PublicSiteResponse['universe']['headerImages']>[number];

const PLACEHOLDERS = [0, 1, 2, 3, 4, 5];

/** Marcador de color (decorativo): nada que leer ni ninguna imagen que cargar. */
function Placeholder({ index }: { index: number }) {
  return (
    <li aria-hidden="true" className="tilted-tile tilted-tile-placeholder" data-tone={index % 3} />
  );
}

function Tile({ image, hidden }: { image: HeaderImage; hidden?: boolean }) {
  // Una imagen que no carga deja un hueco liso del mismo tamaño (sin icono roto ni texto alternativo desbordado).
  const [failed, setFailed] = useState(false);
  return (
    <li aria-hidden={hidden || failed || undefined} className="tilted-tile">
      <img
        src={thumbUrl(image.url, 480)}
        alt={hidden ? '' : image.alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className={`img-frame size-full object-cover ${failed ? 'invisible' : ''}`}
      />
    </li>
  );
}

/**
 * Rejilla inclinada bajo el titular: una hilera de imágenes que se curva hacia quien mira y se desvanece en los
 * bordes. Solo anima `transform` (marquesina lenta, solo en pantallas anchas y sin «reducir movimiento»); en el
 * celular y con movimiento reducido queda quieta. Con menos de 5 imágenes propias, en desarrollo
 * muestra marcadores de color (para ver la composición) y en producción no se pinta nada: unos cuadros de color no son
 * contenido para el lector. La animación se puede pausar (y se detiene al pasar el cursor).
 */
export function TiltedGrid({ images }: { images: readonly HeaderImage[] | undefined }) {
  const [paused, setPaused] = useState(false);
  const real = images && images.length >= 5 ? images : undefined;
  // Sin imágenes reales (la autora aún no las sube): marcadores solo al desarrollar; en producción, nada.
  if (!real && !import.meta.env.DEV) return null;
  return (
    <section
      aria-label="Imágenes del universo"
      className="tilted-grid"
      data-paused={paused || undefined}
    >
      <div className="tilted-stage">
        <ul className="tilted-track">
          {real
            ? real.map((image, index) => <Tile key={`${image.publicId}-${index}`} image={image} />)
            : PLACEHOLDERS.map((index) => <Placeholder key={index} index={index} />)}
          {real
            ? real.map((image, index) => (
                <Tile key={`${image.publicId}-${index}-copy`} image={image} hidden />
              ))
            : PLACEHOLDERS.map((index) => <Placeholder key={`${index}-copy`} index={index} />)}
        </ul>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-compact tilted-pause"
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? 'Reanudar animación' : 'Pausar animación'}
      </button>
    </section>
  );
}
