import type { ReactNode } from 'react';

/** Frase de la landing que invita a entrar con el libro (no se inventa texto nuevo para las pantallas de cuenta). */
export const QR_TAGLINE = 'Tu ejemplar trae un código QR: escanéalo y empieza por el primer quiz.';

/**
 * Marco de las pantallas de cuenta: una tarjeta centrada con el título, una frase opcional y el formulario. Todo va
 * centrado; el ingreso con Google, si lo hay, llega como parte del contenido.
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
    <div className="relative isolate mx-auto flex w-full max-w-md flex-col items-center py-4 sm:py-10">
      <div aria-hidden="true" className="auth-smoke" />
      <div className="auth-card w-full px-5 py-8 text-center sm:px-8">
        <h1 className="page-title">{title}</h1>
        {tagline ? <p className="mx-auto mt-3 max-w-xs text-muted">{tagline}</p> : null}
        <div className="mt-7 text-left">{children}</div>
      </div>
    </div>
  );
}

/** Separador «o» entre el ingreso con Google y el formulario. */
export function OrDivider() {
  return (
    <div
      className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted"
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-line" />
      o
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
