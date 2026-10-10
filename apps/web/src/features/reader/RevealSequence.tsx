import { useEffect, useRef, useState } from 'react';
import { Button } from '../../shared/ui/controls';

/** ¿La persona pidió reducir el movimiento? (se muestra todo junto, sin animación). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Tiempo que cada línea tiene la pantalla para ella sola (también la última antes de ofrecer el resultado). */
export const STEP_MS = 1800;

/**
 * Secuencia previa al resultado («Tus resultados se están decodificando…»): las líneas van apareciendo una a una sobre
 * un resplandor que crece desde el centro y, al final, **la persona abre el resultado** con «Ver mi resultado». Nada
 * avanza solo hacia el resultado: así no se pierde el momento ni se adelanta a un lector de pantalla. «Saltar» es un
 * enlace tenue mientras aparecen las líneas. Con «reducir movimiento» se muestra todo junto. El nombre del efecto lo
 * define la autora y viaja como `data-effect`.
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
  const [ready, setReady] = useState(reduced || lines.length === 0);

  // Cuando el resultado está listo (y no antes) el foco pasa al botón. Con «reducir movimiento» todo aparece junto y el
  // foco se queda en el titular, para que se lean las líneas antes de llegar al botón.
  const open = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ready && !reduced) open.current?.focus();
  }, [ready, reduced]);

  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(() => {
      if (shown < lines.length) setShown((count) => count + 1);
      else setReady(true);
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [ready, shown, lines.length]);

  return (
    <section
      aria-label="Tus resultados se están preparando"
      data-effect={effect}
      className="relative flex min-h-[60dvh] flex-col items-center justify-center gap-8 overflow-hidden text-center"
    >
      <div aria-hidden="true" className="reveal-glow" />
      <div aria-live="polite" className="relative flex flex-col gap-4">
        {lines.slice(0, shown).map((line, index) => (
          <p key={index} className="reveal-line font-display text-xl sm:text-2xl">
            {line}
          </p>
        ))}
      </div>
      <div className="relative flex min-h-12 items-center">
        {ready ? (
          <Button ref={open} className="!min-h-12 !px-7 !text-base" onClick={onDone}>
            Ver mi resultado
          </Button>
        ) : lines.length > 1 ? (
          <Button variant="ghost" onClick={onDone}>
            Saltar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
