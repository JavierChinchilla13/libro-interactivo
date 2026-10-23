import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describeRemaining, remainingParts } from '../../shared/lib/countdown';

// El lienzo de partículas se descarga solo cuando el cronómetro entra en pantalla y el movimiento está permitido.
const VaporCell = lazy(() => import('./VaporCell'));

const pad = (value: number) => String(value).padStart(2, '0');

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function Cell({ label, value, vapor }: { label: string; value: string; vapor: boolean }) {
  const digits = useRef<HTMLSpanElement>(null);
  // El número real se oculta solo mientras el lienzo anima el cambio; en reposo se ve el texto nítido.
  const [animating, setAnimating] = useState(false);
  const onActive = useCallback((active: boolean) => setAnimating(active), []);
  return (
    <div className="countdown-cell" data-vapor={(vapor && animating) || undefined}>
      <span className="countdown-box">
        <span ref={digits} className="countdown-digits">
          {value}
        </span>
        {vapor ? (
          <Suspense fallback={null}>
            <VaporCell value={value} reference={digits} onActive={onActive} />
          </Suspense>
        ) : null}
      </span>
      <span className="label">{label}</span>
    </div>
  );
}

/**
 * Cuenta atrás hacia la salida del libro. El número real siempre está en el DOM (accesible y sin saltos); si el
 * movimiento está permitido, un lienzo de partículas lo cubre. Todo se detiene fuera de pantalla y con la pestaña
 * oculta. Al llegar la fecha desaparece. Los lectores de pantalla reciben una frase que cambia cada minuto, no cada
 * segundo.
 */
export function Countdown({
  target,
  dateLabel,
  animated = true,
  compact = false,
}: {
  target: Date;
  dateLabel: string;
  /** `false`: sin lienzo de partículas (la regla de animaciones solo lo permite en la ficha del libro). */
  animated?: boolean;
  /** Cifras más pequeñas, para una tarjeta. */
  compact?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [inView, setInView] = useState(false);
  const vapor = animated && inView && !reducedMotion();

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting) setNow(Date.now());
      setInView(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [inView]);

  const parts = remainingParts(now, target);
  const spoken = useMemo(
    () => describeRemaining(remainingParts(Math.floor(now / 60_000) * 60_000, target)),
    [now, target],
  );
  if (parts.done) return null;
  return (
    <section
      ref={root}
      aria-label="Cuenta atrás para la salida del libro"
      className={`countdown ${compact ? 'countdown-compact' : ''}`}
    >
      <p className="label">Sale el {dateLabel}</p>
      <div role="timer" aria-live="off">
        <p className="sr-only">{spoken}</p>
        <div aria-hidden="true" className="countdown-row">
          <Cell label="días" value={pad(parts.days)} vapor={vapor} />
          <Cell label="horas" value={pad(parts.hours)} vapor={vapor} />
          <Cell label="min" value={pad(parts.minutes)} vapor={vapor} />
          <Cell label="seg" value={pad(parts.seconds)} vapor={vapor} />
        </div>
      </div>
    </section>
  );
}
