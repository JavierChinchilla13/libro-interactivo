import { useCallback, useEffect, useState } from 'react';
import { claimAnimation, releaseAnimation, type AnimationRunner } from './animationSlot';

/** ¿La persona pidió menos movimiento o ahorrar datos? Entonces el video no se descarga: solo se ve el póster. */
function motionAllowed(): boolean {
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !reduced && connection?.saveData !== true;
}

/** Lo que necesitan los botones y el video para mostrarse. */
export interface PlaybackState {
  /** Falso con «reducir movimiento» o ahorro de datos: no se monta el video, solo el póster. */
  canAnimate: boolean;
  /** La persona (o la página) quiere que corra: define el botón. Pausa fuera de pantalla no lo cambia. */
  playing: boolean;
  /** Pausa o reanuda por decisión de la persona (y en una lista, es lo que lo carga por primera vez). */
  toggle: () => void;
}

export interface BackgroundPlayback {
  /** Referencia (de función, porque el video puede montarse después) para el elemento `<video>`. */
  attachVideo: (element: HTMLVideoElement | null) => void;
  /** Referencia para el contenedor cuya visibilidad decide si corre. */
  attachRoot: (element: HTMLElement | null) => void;
  state: PlaybackState;
}

/**
 * Reglas de un video decorativo en bucle: arranca solo cuando se ve (y, en una lista, nunca solo: `autoplay: false` y
 * se carga al pulsar), se pausa fuera de pantalla y con la pestaña oculta, no corre a la vez que otro elemento animado
 * de la página, y con «reducir movimiento» o ahorro de datos no corre ni se descarga. Cada pausa por decisión de la
 * persona o porque otro elemento tomó el lugar se respeta hasta que ella lo reanude.
 */
export function useBackgroundPlayback({
  autoplay = true,
  enabled = true,
}: { autoplay?: boolean; enabled?: boolean } = {}): BackgroundPlayback {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [canAnimate, setCanAnimate] = useState(motionAllowed);
  // El archivo de video no cargó: se queda el póster y desaparece el botón (no hay nada que pausar).
  const [failed, setFailed] = useState(false);
  const [wanted, setWanted] = useState(autoplay);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);

  // Si la preferencia cambia con la página abierta, se respeta al instante.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setCanAnimate(motionAllowed());
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setVisible(entry.isIntersecting);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  const shouldRun = enabled && canAnimate && wanted && visible && tabVisible;
  useEffect(() => {
    if (!video) return;
    const onError = () => setFailed(true);
    video.addEventListener('error', onError);
    // Otro elemento animado tomó el lugar: este se detiene y queda pausado hasta que la persona lo reanude.
    const runner: AnimationRunner = {
      pause() {
        video.pause();
        setWanted(false);
      },
    };
    if (shouldRun) {
      claimAnimation(runner);
      // `play()` puede rechazarse (política de autoplay o archivo roto): el póster ya está de fondo.
      void Promise.resolve(video.play()).catch((error: unknown) => {
        // El navegador no deja arrancarlo solo (ahorro de energía, autoplay): queda el póster y el botón dice «Reproducir».
        if (error instanceof DOMException && error.name === 'NotAllowedError') setWanted(false);
      });
    } else {
      video.pause();
    }
    return () => {
      video.removeEventListener('error', onError);
      releaseAnimation(runner);
    };
  }, [shouldRun, video]);

  const toggle = useCallback(() => {
    setWanted((current) => !current);
  }, []);

  return {
    attachVideo: setVideo,
    attachRoot: setRoot,
    state: {
      canAnimate: enabled && canAnimate && !failed,
      playing: enabled && canAnimate && wanted,
      toggle,
    },
  };
}
