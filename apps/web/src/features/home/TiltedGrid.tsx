import type { PublicSiteResponse } from '@libro/shared';
import { useState } from 'react';
import { thumbUrl } from '../../shared/lib/cloudinary';

type HeaderImage = NonNullable<PublicSiteResponse['universe']['headerImages']>[number];

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
 * celular y con movimiento reducido queda quieta. La animación se puede pausar (y se detiene al pasar el cursor).
 */
export function TiltedGrid({ images }: { images: readonly HeaderImage[] | undefined }) {
  const [paused, setPaused] = useState(false);
  if (!images || images.length < 5) return null;
  return (
    <section
      aria-label="Imágenes del universo"
      className="tilted-grid"
      data-paused={paused || undefined}
    >
      <div className="tilted-stage">
        <ul className="tilted-track">
          {images.map((image, index) => (
            <Tile key={`${image.publicId}-${index}`} image={image} />
          ))}
          {images.map((image, index) => (
            <Tile key={`${image.publicId}-${index}-copy`} image={image} hidden />
          ))}
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
