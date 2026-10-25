import type { FieldVisualKey } from '@libro/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { claimAnimation, releaseAnimation } from '../lib/animationSlot';

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Ejecuta `task` cuando la página ya terminó de cargar y el navegador está libre (o en cuanto puede, si no hay
 * `requestIdleCallback`). El fondo es decorativo: no debe competir con lo que la persona vino a ver.
 */
function whenIdle(task: () => void): () => void {
  let cancel = () => {};
  const start = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(task, { timeout: 1500 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(task, 0);
      cancel = () => window.clearTimeout(id);
    }
  };
  if (document.readyState === 'complete') {
    start();
    return () => cancel();
  }
  window.addEventListener('load', start, { once: true });
  return () => {
    window.removeEventListener('load', start);
    cancel();
  };
}

/**
 * Escenario de un campo de poder: un fondo animado (lienzo propio, descargado bajo demanda) con el texto encima. El
 * degradado de CSS ya da la atmósfera antes de que cargue el lienzo y es lo que ve quien no lo necesita; con
 * «reducir movimiento» se pinta un solo cuadro estático. Se pausa fuera de pantalla y con la pestaña oculta. El texto
 * va sobre un velo para mantener el contraste.
 */
export function FieldStage({
  visualKey,
  children,
  className = '',
}: {
  visualKey: FieldVisualKey;
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const stage = root.current;
    if (!element || !stage || typeof IntersectionObserver === 'undefined') return;
    let cancelled = false;
    let mounted: { pause(): void; resume(): void; destroy(): void } | null = null;
    let visible = false;
    let starting = false;
    let idle: (() => void) | undefined;

    const sync = () => {
      if (!mounted) return;
      if (visible && !document.hidden) {
        // Solo un elemento animado corre a la vez en toda la página: al arrancar este, el anterior se detiene.
        claimAnimation(mounted);
        mounted.resume();
      } else {
        mounted.pause();
        releaseAnimation(mounted);
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      visible = entry.isIntersecting;
      if (visible && !mounted && !starting) {
        // El texto ya se ve: el lienzo se descarga y arranca cuando el navegador está libre (no compite con el
        // primer pintado ni infla el tiempo de bloqueo).
        starting = true;
        idle = whenIdle(() => {
          void import('../field/fieldEffects')
            .then(({ mountEffect }) =>
              mountEffect(element, visualKey, { reduced: reducedMotion() }),
            )
            .then((effect) => {
              if (cancelled) {
                effect.destroy();
                return;
              }
              mounted = effect;
              stage.dataset['ready'] = '';
              sync();
            })
            .catch(() => {
              // Sin red o sin el archivo del efecto: se queda el degradado de CSS y se reintenta la próxima vez que
              // el escenario entre en pantalla.
              starting = false;
            });
        });
      } else {
        sync();
      }
    });
    observer.observe(stage);
    document.addEventListener('visibilitychange', sync);
    return () => {
      cancelled = true;
      idle?.();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      mounted?.destroy();
      if (mounted) releaseAnimation(mounted);
    };
  }, [visualKey]);

  return (
    <div ref={root} className={`field-stage ${className}`} data-key={visualKey}>
      <canvas ref={canvas} aria-hidden="true" className="field-canvas" />
      <div className="field-stage-content">{children}</div>
    </div>
  );
}
