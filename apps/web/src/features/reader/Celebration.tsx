import type { FieldVisualKey } from '@libro/shared';
import { useCallback, useState, type CSSProperties } from 'react';
import './celebration.css';

/** Chispas del momento: posición fija por índice (nada aleatorio, nada que dependa del resultado). */
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 === 0 ? 0.12 : -0.12);
  const dist = i % 3 === 0 ? 84 : i % 3 === 1 ? 64 : 100;
  return {
    i,
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist)}px`,
  };
});

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Celebración al abrir el resultado de un quiz: un solo momento (~1 s), sin bucles y sin sonido. Un sello «Quiz
 * completado» entra con una escala corta, un anillo se expande una vez y 14 chispas salen del emblema. Solo se monta
 * cuando el servidor ya entregó el resultado y la lectora lo abrió; es la misma para todos los resultados (no usa la
 * clave del resultado), salvo el degradado del campo, que ella ya recibe. Con «reducir movimiento» no hay chispas ni
 * anillo: el sello y el emblema se ven completos y quietos. Las chispas se quitan del DOM al terminar.
 */
export function Celebration({
  fieldKey,
  className = '',
}: {
  fieldKey?: FieldVisualKey | undefined;
  className?: string;
}) {
  const [playing, setPlaying] = useState(() => !reducedMotion());
  // La última chispa avisa que terminó (oyente nativo: `onAnimationEnd` de React no existe en jsdom).
  const lastSpark = useCallback((node: HTMLSpanElement | null) => {
    node?.addEventListener('animationend', () => setPlaying(false), { once: true });
  }, []);
  return (
    <div className={`celebration ${className}`} data-playing={playing || undefined}>
      <span className="celebration-orb" data-key={fieldKey} aria-hidden="true" />
      <p className="celebration-seal" role="status">
        Quiz completado
      </p>
      {playing ? (
        <>
          <span className="celebration-ring" aria-hidden="true" />
          {SPARKS.map((spark) => (
            <span
              key={spark.i}
              aria-hidden="true"
              className="celebration-spark"
              data-spark=""
              style={{ '--i': spark.i, '--dx': spark.dx, '--dy': spark.dy } as CSSProperties}
              ref={spark.i === SPARKS.length - 1 ? lastSpark : undefined}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
