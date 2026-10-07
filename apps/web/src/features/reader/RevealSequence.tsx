import { useEffect, useState } from 'react';
import { Button } from '../../shared/ui/controls';

/** ¿La persona pidió reducir el movimiento? (se muestra todo junto, sin animación ni avance automático). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

const STEP_MS = 1500;
const LAST_PAUSE_MS = 1200;

/**
 * Secuencia previa al resultado («Tus resultados se están decodificando…»): las líneas van
 * apareciendo una a una. Siempre hay «Saltar». El nombre del efecto lo define la autora y viaja como `data-effect`
 * (el diseño visual definitivo llega en la fase 12). Con «reducir movimiento» no avanza sola: muestra todo y espera.
 */
export function RevealSequence({
  lines,
  effect,
  onDone,
}: {
  lines: readonly string[];
  effect?: string | undefined;
  onDone: () => void;
}) {
  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState(reduced ? lines.length : Math.min(1, lines.length));

  useEffect(() => {
    if (reduced) return undefined;
    const finished = shown >= lines.length;
    const timer = setTimeout(
      finished ? onDone : () => setShown((count) => count + 1),
      finished ? LAST_PAUSE_MS : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [reduced, shown, lines.length, onDone]);

  return (
    <section
      aria-label="Tus resultados se están preparando"
      data-effect={effect}
      className="flex min-h-[50dvh] flex-col items-center justify-center gap-6 text-center"
    >
      <div aria-live="polite" className="flex flex-col gap-3">
        {lines.slice(0, shown).map((line, index) => (
          <p key={index} className="reveal-line font-display text-xl sm:text-2xl">
            {line}
          </p>
        ))}
      </div>
      <Button variant={reduced ? 'primary' : 'secondary'} onClick={onDone}>
        {reduced ? 'Ver mi resultado' : 'Saltar ›'}
      </Button>
    </section>
  );
}
