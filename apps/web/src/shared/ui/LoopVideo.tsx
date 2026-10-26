import { videoPosterUrl } from '@libro/shared';
import type { PlaybackState } from '../lib/useBackgroundPlayback';
import { posterUrl, videoUrl } from '../lib/cloudinary';
import { useState } from 'react';
import { PauseIcon, PlayIcon } from './icons';

export interface LoopVideoSource {
  url: string;
  /** Sin póster guardado se deduce el primer fotograma (solo funciona con Cloudinary; si falla, no se muestra). */
  posterUrl?: string | undefined;
  alt: string;
}

/**
 * Video corto, mudo y en bucle con su póster como imagen aparte. El póster va debajo y es lo único que se ve si el video
 * no se descarga (movimiento reducido, ahorro de datos, lista sin pulsar) o si falla; si tampoco carga, queda el color
 * liso del contenedor. El video aparece con un fundido en cuanto empieza a correr. No lleva sonido ni controles propios.
 */
export function LoopVideo({
  source,
  attachVideo,
  canAnimate,
  width = 720,
  className = '',
  onVisible,
  posterAlt = '',
}: {
  source: LoopVideoSource;
  attachVideo: (element: HTMLVideoElement | null) => void;
  canAnimate: boolean;
  width?: number;
  className?: string;
  /** Avisa cuando ya hay algo que ver: el póster cargó o el video empezó. */
  onVisible?: () => void;
  /** Texto alternativo del póster; vacío = decorativo (el fondo de un quiz lleva el suyo en su contenedor). */
  posterAlt?: string;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  // Una vez que corrió, se queda a la vista aunque se pause (el fotograma congelado, no el póster).
  const [started, setStarted] = useState(false);
  return (
    <>
      {posterFailed ? null : (
        <img
          src={posterUrl(source.posterUrl ?? videoPosterUrl(source.url), width)}
          alt={posterAlt}
          aria-hidden={posterAlt ? undefined : true}
          decoding="async"
          onLoad={onVisible}
          onError={() => setPosterFailed(true)}
          className={className}
        />
      )}
      {canAnimate ? (
        <video
          ref={attachVideo}
          src={videoUrl(source.url, width)}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden="true"
          data-started={started ? '' : undefined}
          onPlaying={() => {
            setStarted(true);
            onVisible?.();
          }}
          className={`loop-video ${className}`}
        />
      ) : null}
    </>
  );
}

/**
 * Botón de pausa del video: de 44 px, siempre visible mientras el video pueda moverse, con el estado en su nombre.
 * Con movimiento reducido (donde no hay video) no se muestra.
 */
export function PlaybackToggle({
  state,
  label = 'fondo animado',
  className = '',
}: {
  state: PlaybackState;
  label?: string;
  className?: string;
}) {
  if (!state.canAnimate) return null;
  const text = state.playing ? `Pausar ${label}` : `Reproducir ${label}`;
  return (
    <button type="button" onClick={state.toggle} className={`playback-toggle ${className}`}>
      {state.playing ? <PauseIcon /> : <PlayIcon />}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="playback-toggle-text">
        {state.playing ? 'Pausar' : 'Reproducir'}
      </span>
    </button>
  );
}
