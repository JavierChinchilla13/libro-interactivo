import type { ReactNode } from 'react';

/**
 * Un grupo de campos con su título y una línea de ayuda: así un formulario largo se lee por partes
 * («Estado y fecha», «Cómo comprar») en vez de una pared de campos.
 */
export function FormSection({
  title,
  help,
  children,
  className = '',
}: {
  title: string;
  /** Una línea en lenguaje simple: para qué sirve este grupo. */
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`admin-card flex flex-col gap-4 ${className}`}>
      <header>
        <h2 className="text-base font-semibold">{title}</h2>
        {help ? <p className="mt-0.5 text-sm text-muted">{help}</p> : null}
      </header>
      {children}
    </section>
  );
}
