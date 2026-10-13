import type { ReactNode } from 'react';

type Tone = 'base' | 'sunken';
type Space = 'tight' | 'regular' | 'loose';

/** Espacio sobre la sección (y dentro de la banda, si la tiene). Tres pasos para que la página no sea monótona. */
const above: Record<Space, string> = {
  tight: 'mt-section-tight',
  regular: 'mt-section-regular',
  loose: 'mt-section-loose',
};
const inside: Record<Space, string> = {
  tight: 'py-section-tight',
  regular: 'py-section-regular',
  loose: 'py-section-loose',
};

/**
 * Sección de página con título (h2) y, si se quiere, una frase de introducción.
 * - `tone="sunken"`: banda más oscura que el fondo, a sangre de pantalla (ritmo sin tarjetas).
 * - `space`: cuánto aire lleva (tight / regular / loose).
 */
export function Section({
  id,
  title,
  intro,
  tone = 'base',
  space = 'regular',
  className = '',
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  tone?: Tone;
  space?: Space;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-24 ${above[space]} ${tone === 'sunken' ? `section-band ${inside[space]}` : ''} ${className}`}
    >
      <h2 id={`${id}-title`} className="section-title">
        {title}
      </h2>
      {intro ? <p className="mt-3 max-w-prose text-muted">{intro}</p> : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}
