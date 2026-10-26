import type { ReaderAppearance } from '@libro/shared';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { posterUrl, thumbUrl } from '../../shared/lib/cloudinary';
import { measureBackdrop } from '../../shared/lib/measureBackdrop';
import { accentVar, resolveOverlay } from '../../shared/lib/quizAppearance';
import { useBackgroundPlayback } from '../../shared/lib/useBackgroundPlayback';
import { LoopVideo, PlaybackToggle } from '../../shared/ui/LoopVideo';

/** Anchos de la imagen de fondo: bajo un velo oscuro más resolución no se nota y cuesta bytes. */
const IMAGE_WIDTHS = [640, 1080, 1280] as const;

/** En el celular un video de 540 px basta bajo el velo; en pantallas grandes, 960. */
const videoWidth = (): number =>
  typeof window !== 'undefined' && window.innerWidth <= 768 ? 540 : 960;

/**
 * Fondo de un quiz (imagen o video corto) con su velo de contraste. El servidor solo lo entrega a quien ya pasó el
 * desbloqueo. Devuelve dos piezas porque van en sitios distintos: el fondo (una capa fija detrás de todo, fuera del
 * contenido) y el botón de pausa (dentro del flujo de la página, al alcance del teclado y del pulgar).
 *
 * El velo del modo automático se mide sobre la zona más clara del fondo; hasta medirla (o si el navegador no puede),
 * vale el piso, que es seguro incluso sobre un píxel blanco. Si el fondo no carga, queda el color liso del sitio.
 */
export function useQuizBackdrop(
  appearance: ReaderAppearance | undefined,
  { staticOnly = false }: { staticOnly?: boolean } = {},
): {
  backdrop: ReactNode;
  toggle: ReactNode;
  /** Estilo del contenedor de la página: el acento de la apariencia como variable CSS. */
  accentStyle: CSSProperties | undefined;
} {
  const background = appearance?.background;
  const { attachRoot, attachVideo, state } = useBackgroundPlayback({ enabled: !staticOnly });
  const [loaded, setLoaded] = useState(false);
  const [measured, setMeasured] = useState<{ url: string; hex: string | undefined } | null>(null);

  // Imagen de referencia para medir: la propia imagen o el póster del video, en miniatura.
  const sampleUrl =
    background?.kind === 'image'
      ? thumbUrl(background.image.url, 64)
      : background?.kind === 'video'
        ? posterUrl(background.video.posterUrl, 64)
        : undefined;
  useEffect(() => {
    if (!sampleUrl || appearance?.overlay.mode !== 'auto') return;
    let cancelled = false;
    void measureBackdrop(sampleUrl).then((hex) => {
      if (!cancelled) setMeasured({ url: sampleUrl, hex });
    });
    return () => {
      cancelled = true;
    };
  }, [sampleUrl, appearance?.overlay.mode]);

  if (!appearance || !background) {
    return {
      backdrop: null,
      toggle: null,
      accentStyle: appearance?.accent
        ? ({ '--quiz-accent': accentVar(appearance.accent) } as CSSProperties)
        : undefined,
    };
  }

  const measuredHex = measured?.url === sampleUrl ? measured?.hex : undefined;
  const strength = resolveOverlay(appearance.overlay, measuredHex);
  const alt = background.kind === 'image' ? background.image.alt : background.video.alt;

  const layer = (
    <div
      ref={attachRoot}
      className="quiz-bg"
      role="img"
      aria-label={alt}
      data-loaded={loaded || undefined}
      style={{ '--quiz-veil': strength } as CSSProperties}
    >
      {background.kind === 'image' ? (
        <img
          src={thumbUrl(background.image.url, 1080)}
          srcSet={IMAGE_WIDTHS.map((w) => `${thumbUrl(background.image.url, w)} ${w}w`).join(', ')}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="quiz-bg-media"
        />
      ) : (
        <LoopVideo
          source={background.video}
          attachVideo={attachVideo}
          canAnimate={state.canAnimate}
          width={videoWidth()}
          className="quiz-bg-media"
          onVisible={() => setLoaded(true)}
        />
      )}
      <div className="quiz-bg-veil" />
    </div>
  );

  return {
    backdrop: createPortal(layer, document.body),
    toggle:
      background.kind === 'video' ? <PlaybackToggle state={state} label="video de fondo" /> : null,
    accentStyle: appearance.accent
      ? ({ '--quiz-accent': accentVar(appearance.accent) } as CSSProperties)
      : undefined,
  };
}
