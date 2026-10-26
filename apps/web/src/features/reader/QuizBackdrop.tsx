import type { QuizBackground, ReaderAppearance, ReaderQuestionAppearance } from '@libro/shared';
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { accentCss, readableAccent } from '../../shared/lib/accent';
import { posterUrl, thumbUrl } from '../../shared/lib/cloudinary';
import {
  accentBackdrop,
  backdropSampleUrl,
  effectiveAppearance,
  resolveOverlay,
} from '../../shared/lib/quizAppearance';
import { useBackgroundPlayback } from '../../shared/lib/useBackgroundPlayback';
import { useMeasuredBackdrop } from '../../shared/lib/useMeasuredBackdrop';
import { LoopVideo, PlaybackToggle } from '../../shared/ui/LoopVideo';

/** Anchos de la imagen de fondo: bajo un velo oscuro más resolución no se nota y cuesta bytes. */
const IMAGE_WIDTHS = [640, 1080, 1280] as const;

/** En el celular un video de 540 px basta bajo el velo; en pantallas grandes, 960. */
const videoWidth = (): number =>
  typeof window !== 'undefined' && window.innerWidth <= 768 ? 540 : 960;

/** Tiempo del fundido entre dos fondos (el mismo de `--token-dur-slow`). */
const FADE_MS = 480;
/** Si un fondo nuevo no avisa que está listo, se muestra igual pasado este tiempo (nunca se queda esperando). */
const READY_FALLBACK_MS = 900;

/** Una capa de fondo: qué medio es y con cuánto velo se ve. */
interface Layer {
  key: string;
  background: QuizBackground;
  strength: number;
}

const noop = () => undefined;

const keyOf = (background: QuizBackground): string =>
  background.kind === 'image' ? `i:${background.image.url}` : `v:${background.video.url}`;
const altOf = (background: QuizBackground): string =>
  background.kind === 'image' ? background.image.alt : background.video.alt;

/** Pide por adelantado la imagen o el póster (NUNCA el archivo de video) de la pregunta que sigue. */
function prewarmUrl(background: QuizBackground | undefined): string | undefined {
  if (!background) return undefined;
  return background.kind === 'image'
    ? thumbUrl(background.image.url, 1080)
    : posterUrl(background.video.posterUrl, videoWidth());
}

function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * Fondo de un quiz (imagen o video corto) con su velo de contraste, general o propio de la pregunta que se está
 * viendo. El servidor solo lo entrega a quien ya pasó el desbloqueo. Devuelve dos piezas porque van en sitios
 * distintos: el fondo (capas fijas detrás de todo, fuera del contenido) y el botón de pausa (dentro del flujo).
 *
 * - Cada pregunta puede traer su propio fondo, velo y acento; lo que no trae es el general. El medio de una pregunta no
 *   se pide hasta llegar a ella; de la siguiente solo se precalienta la imagen o el póster (nunca el video).
 * - Al cambiar de fondo, el nuevo entra con un fundido de opacidad sobre el anterior (que se queda hasta que el nuevo
 *   está listo), sin parpadeo y siempre detrás del contenido. Solo corre un video: el de la capa actual.
 * - El velo del modo automático se mide sobre la zona más clara del fondo DE ESA pregunta; hasta medirla (o si el
 *   navegador no puede) vale el piso, seguro incluso sobre un píxel blanco. El acento se aclara lo mínimo para leerse
 *   sobre ese fondo ya velado. Si un fondo no carga, queda el color liso del sitio.
 */
export function useQuizBackdrop(
  appearance: ReaderAppearance | undefined,
  {
    staticOnly = false,
    question,
    nextQuestion,
  }: {
    staticOnly?: boolean;
    /** Ajustes propios de la pregunta que se está viendo. */
    question?: ReaderQuestionAppearance | undefined;
    /** Los de la pregunta que sigue (solo para precalentar su imagen o póster). */
    nextQuestion?: ReaderQuestionAppearance | undefined;
  } = {},
): {
  backdrop: ReactNode;
  toggle: ReactNode;
  /** Estilo del contenedor de la página: el acento de la apariencia como variable CSS. */
  accentStyle: CSSProperties | undefined;
} {
  const effective = effectiveAppearance(appearance, question);
  const background = effective.background;
  const key = background ? keyOf(background) : null;
  const { attachRoot, attachVideo, state } = useBackgroundPlayback({
    enabled: !staticOnly,
    sourceKey: key ?? '',
  });
  const measured = useMeasuredBackdrop(
    backdropSampleUrl(background),
    effective.overlay.mode === 'auto',
  );
  const strength = background ? resolveOverlay(effective.overlay, measured.hex) : 0;

  // El acento elegido se aclara lo mínimo (si hace falta) hasta leerse a 3:1 sobre el fondo ya velado de ESTA pantalla;
  // solo se escribe en CSS un #RRGGBB validado.
  const chosen = accentCss(effective.accent);
  const accentStyle = chosen
    ? ({
        '--quiz-accent': readableAccent(
          chosen,
          accentBackdrop(Boolean(background), measured.hex, strength),
        ).hex,
      } as CSSProperties)
    : undefined;

  // Capas: la actual y, mientras dura el fundido, la anterior (derivadas de lo que se renderiza, sin efectos).
  const current: Layer | null = background && key ? { key, background, strength } : null;
  const [shown, setShown] = useState<Layer | null>(null);
  const [leaving, setLeaving] = useState<Layer | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const markReady = useCallback((layerKey: string) => setReadyKey(layerKey), []);
  if ((current?.key ?? null) !== (shown?.key ?? null)) {
    setLeaving(shown);
    setShown(current);
  } else if (current && shown && current.strength !== shown.strength) {
    setShown(current);
  }
  const entering = leaving !== null && current !== null && readyKey !== current.key;

  // La capa anterior se retira cuando la nueva ya se ve (o enseguida, si no hay nueva y solo se desvanece).
  useEffect(() => {
    if (!leaving || entering) return;
    const timer = setTimeout(() => setLeaving(null), FADE_MS + 40);
    return () => clearTimeout(timer);
  }, [leaving, entering]);

  // Precalentar la imagen o el póster de la pregunta siguiente (nunca el video; nada con ahorro de datos).
  const warm = prewarmUrl(effectiveAppearance(appearance, nextQuestion).background);
  useEffect(() => {
    if (!warm || saveData()) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = warm;
  }, [warm]);

  const layers = [leaving, current].filter(
    (layer, position, all): layer is Layer =>
      layer !== null && all.findIndex((other) => other?.key === layer.key) === position,
  );
  const backdrop =
    layers.length > 0
      ? createPortal(
          <>
            {layers.map((layer) => {
              const isCurrent = layer.key === current?.key;
              return (
                <BackdropLayer
                  key={layer.key}
                  layer={layer}
                  isCurrent={isCurrent}
                  entering={isCurrent && entering}
                  fading={!isCurrent && current === null}
                  attachRoot={isCurrent ? attachRoot : undefined}
                  attachVideo={isCurrent ? attachVideo : undefined}
                  canAnimate={isCurrent && state.canAnimate}
                  onReady={markReady}
                />
              );
            })}
          </>,
          document.body,
        )
      : null;

  return {
    backdrop,
    toggle:
      background?.kind === 'video' ? <PlaybackToggle state={state} label="video de fondo" /> : null,
    accentStyle,
  };
}

/**
 * Una capa de fondo. La capa actual lleva el video (si es video) y el texto alternativo; la que se va queda quieta
 * (imagen o póster) y escondida para los lectores de pantalla. Una capa nueva entra en opacidad 0 y se muestra cuando su
 * medio ya cargó (o pasado un tiempo): así el fondo anterior no parpadea ni queda un hueco.
 */
function BackdropLayer({
  layer,
  isCurrent,
  entering,
  fading,
  attachRoot,
  attachVideo,
  canAnimate,
  onReady,
}: {
  layer: Layer;
  isCurrent: boolean;
  entering: boolean;
  fading: boolean;
  attachRoot: ((element: HTMLElement | null) => void) | undefined;
  attachVideo: ((element: HTMLVideoElement | null) => void) | undefined;
  canAnimate: boolean;
  onReady: (key: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const { background, strength } = layer;
  const visible = () => {
    setLoaded(true);
    onReady(layer.key);
  };
  // Un medio que no carga no debe dejar la capa escondida: se muestra con el color liso y el velo.
  useEffect(() => {
    const timer = setTimeout(() => onReady(layer.key), READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [onReady, layer.key]);

  return (
    <div
      ref={attachRoot}
      className="quiz-bg"
      {...(isCurrent ? { role: 'img', 'aria-label': altOf(background) } : { 'aria-hidden': true })}
      data-loaded={loaded || undefined}
      data-entering={entering || undefined}
      data-fading={fading || undefined}
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
          onLoad={visible}
          onError={() => onReady(layer.key)}
          className="quiz-bg-media"
        />
      ) : (
        <LoopVideo
          source={background.video}
          attachVideo={attachVideo ?? noop}
          canAnimate={canAnimate}
          width={videoWidth()}
          className="quiz-bg-media"
          onVisible={visible}
        />
      )}
      <div className="quiz-bg-veil" />
    </div>
  );
}
