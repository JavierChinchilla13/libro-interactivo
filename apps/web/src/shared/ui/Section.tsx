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

/** El titular con una palabra de énfasis: sube de peso dentro de Cinzel (no cambia de color), si aparece en él. */
function Emphasized({ text, word }: { text: string; word?: string | undefined }) {
  const at = word ? text.lastIndexOf(word) : -1;
  if (!word || at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="emph">{word}</span>
      {text.slice(at + word.length)}
    </>
  );
}

/**
 * Sección de página con título (h2) y, si se quiere, una frase de introducción.
 * - `tone`: `sunken` (banda más oscura) o `raised` (banda más clara), a sangre de pantalla; `base` va sobre el fondo.
 * - `space`: cuánto aire lleva (tight / regular / loose).
 * - `tall`: una idea por pantalla: la sección ocupa buena parte del alto y centra su contenido.
 * - `emphasis`: una palabra del título que sube de peso.
 * - `split`: composición editorial (escritorio): un filete fino arriba, el título pegajoso a la izquierda y el
 *   contenido a la derecha. En el celular todo va en una columna bajo el mismo filete.
 * - `aside`: composición de objeto (escritorio): una pieza (portada, retrato) pegajosa a la izquierda y, a su
 *   derecha, el título y el contenido. En el celular el orden es título, pieza y contenido.
 * - `align="center"`: el título y la introducción van centrados sobre el contenido.
 * La sección aparece al entrar en pantalla (solo con CSS, ver `.reveal`).
 */
export function Section({
  id,
  title,
  intro,
  tone = 'base',
  space = 'regular',
  tall = false,
  emphasis,
  split = false,
  aside,
  align = 'start',
  className = '',
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  tone?: Tone;
  space?: Space;
  tall?: boolean;
  emphasis?: string;
  split?: boolean;
  aside?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
  children: ReactNode;
}) {
  const centered = align === 'center';
  const head = (
    <div className={centered ? 'text-center' : ''}>
      <h2 id={`${id}-title`} className="section-title reveal">
        <Emphasized text={title} word={emphasis} />
      </h2>
      {intro ? (
        <p
          className={`mt-3 max-w-[var(--token-measure)] font-read text-xl text-muted ${centered ? 'mx-auto' : ''}`}
        >
          {intro}
        </p>
      ) : null}
    </div>
  );
  const body = (
    <div className="reveal" style={{ ['--i' as string]: 1 }}>
      {children}
    </div>
  );
  let layout: ReactNode;
  if (aside) {
    // En el celular el título va antes que la pieza: se reordena con `order`.
    layout = (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-16 lg:gap-y-8">
        <div className="max-lg:order-2 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-28 lg:self-start">
          {aside}
        </div>
        <div className="max-lg:order-1 lg:col-start-2 lg:row-start-1 lg:self-end">{head}</div>
        <div className="max-lg:order-3 lg:col-start-2 lg:row-start-2">{body}</div>
      </div>
    );
  } else if (split) {
    layout = (
      <div className="border-t border-line pt-8 lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16 lg:pt-10">
        <div className="lg:sticky lg:top-28 lg:self-start">{head}</div>
        <div className="mt-7 lg:mt-0">{body}</div>
      </div>
    );
  } else {
    layout = (
      <>
        {head}
        <div className="mt-7 lg:mt-10">{body}</div>
      </>
    );
  }
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`relative scroll-mt-24 ${inside[space]} ${bands[tone]} ${
        tall ? 'flex min-h-[min(70dvh,40rem)] flex-col justify-center' : ''
      } ${className}`}
    >
      {layout}
    </section>
  );
}
