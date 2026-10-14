import type { ReactNode } from 'react';

/** Frase de la landing que invita a entrar con el libro (no se inventa texto nuevo para las pantallas de cuenta). */
export const QR_TAGLINE = 'Tu ejemplar trae un código QR: escanéalo y empieza por el primer quiz.';

/**
 * Marco de las pantallas de cuenta: una columna con el título, una frase opcional y el formulario sin tarjeta.
 * El hilo no aparece aquí: es solo para el estado real (la lista de experiencias y el panel).
 */
export function AuthShell({
  title,
  tagline,
  children,
}: {
  title: string;
  tagline?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[30rem] lg:py-8">
      <h1 className="page-title">{title}</h1>
      {tagline ? <p className="mt-3 text-muted">{tagline}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}
