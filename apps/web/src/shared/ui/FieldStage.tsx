import type { FieldVisualKey } from '@libro/shared';
import { useEffect, useRef, type ReactNode } from 'react';

interface Running {
  pause(): void;
}

/** Solo un fondo animado corre a la vez en toda la página: al arrancar uno, el anterior se detiene. */
let active: Running | null = null;

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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

    const sync = () => {
      if (!mounted) return;
      if (visible && !document.hidden) {
        active?.pause();
        active = mounted;
        mounted.resume();
      } else {
        mounted.pause();
        if (active === mounted) active = null;
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      visible = entry.isIntersecting;
      if (visible && !mounted) {
        void import('../field/fieldEffects').then(({ mountEffect }) => {
          if (cancelled) return;
          mounted = mountEffect(element, visualKey, { reduced: reducedMotion() });
          stage.dataset['ready'] = '';
          sync();
        });
      } else {
        sync();
      }
    });
    observer.observe(stage);
    document.addEventListener('visibilitychange', sync);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      mounted?.destroy();
      if (active === mounted) active = null;
    };
  }, [visualKey]);

  return (
    <div ref={root} className={`field-stage ${className}`} data-key={visualKey}>
      <canvas ref={canvas} aria-hidden="true" className="field-canvas" />
      <div className="field-stage-content">{children}</div>
    </div>
  );
}
