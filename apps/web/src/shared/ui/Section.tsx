import type { ReactNode } from 'react';

type Tone = 'base' | 'sunken' | 'raised';
type Space = 'tight' | 'regular' | 'loose';

/** Aire dentro de la sección, arriba y abajo. Tres pasos para que la página no sea monótona. */
const inside: Record<Space, string> = {
  tight: 'py-section-tight',
  regular: 'py-section-regular',
  loose: 'py-section-loose',
};
const bands: Record<Tone, string> = {
  base: '',
  sunken: 'section-band',
  raised: 'section-band-raised',
};

/** El titular con una palabra de acento (color de acción), si `accent` aparece en él. */
function Accented({ text, accent }: { text: string; accent?: string | undefined }) {
  const at = accent ? text.lastIndexOf(accent) : -1;
  if (!accent || at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-primary">{accent}</span>
      {text.slice(at + accent.length)}
    </>
  );
}

/**
 * Sección de página con título (h2) y, si se quiere, una frase de introducción.
 * - `tone`: `sunken` (banda más oscura) o `raised` (banda más clara), a sangre de pantalla; `base` va sobre el fondo.
 * - `space`: cuánto aire lleva (tight / regular / loose).
 * - `tall`: una idea por pantalla: la sección ocupa buena parte del alto y centra su contenido.
 * - `accent`: una palabra del título en el color de acción.
 */
export function Section({
  id,
  title,
  intro,
  tone = 'base',
  space = 'regular',
  tall = false,
  accent,
  className = '',
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  tone?: Tone;
  space?: Space;
  tall?: boolean;
  accent?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-24 ${inside[space]} ${bands[tone]} ${
        tall ? 'flex min-h-[min(70dvh,40rem)] flex-col justify-center' : ''
      } ${className}`}
    >
      <h2 id={`${id}-title`} className="section-title">
        <Accented text={title} accent={accent} />
      </h2>
      {intro ? <p className="mt-3 max-w-prose text-muted">{intro}</p> : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}
