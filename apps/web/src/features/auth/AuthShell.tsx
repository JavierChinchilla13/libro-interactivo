import type { ReactNode } from 'react';
import { Thread } from '../../shared/ui/Thread';

/** Frase de la landing que invita a entrar con el libro (no se inventa texto nuevo para las pantallas de cuenta). */
export const QR_TAGLINE = 'Tu ejemplar trae un código QR: escanéalo y empieza por el primer quiz.';

/**
 * Marco de las pantallas de cuenta. En escritorio, a la izquierda el comienzo del hilo (un punto) y, si se da, una
 * frase; a la derecha el formulario sin tarjeta. En el celular el formulario va primero y el hilo es una franja
 * pequeña. `lit` es cuántos puntos del hilo están encendidos (al canjear un código, el primero se enciende).
 */
export function AuthShell({
  title,
  lit = 1,
  tagline,
  children,
}: {
  title: string;
  lit?: number;
  tagline?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-24 lg:py-8">
      <div className="hidden lg:block">
        <Thread nodes={4} litCount={lit} animated className="w-full max-w-[15rem]" />
        {tagline ? <p className="mt-12 max-w-xs text-muted">{tagline}</p> : null}
      </div>
      <div>
        <Thread
          orientation="horizontal"
          nodes={4}
          litCount={lit}
          animated
          className="mb-6 w-44 lg:hidden"
        />
        <h1 className="page-title mb-6">{title}</h1>
        {children}
      </div>
    </div>
  );
}
