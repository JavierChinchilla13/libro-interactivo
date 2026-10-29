import { useEffect, useState } from 'react';
import { Link } from 'react-router';

/** Dónde se recuerda que la persona ya vio el aviso (solo una comodidad: no es dato de la cuenta). */
export const COOKIE_NOTICE_KEY = 'libro_cookie_notice';

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_NOTICE_KEY) === '1';
  } catch {
    return false; // sin almacenamiento (modo privado): se muestra una vez por visita
  }
}

/**
 * Aviso breve de cookies. No pide nada ni bloquea nada: el sitio solo usa cookies necesarias para la sesión, así que no
 * hay cookies opcionales que aceptar. Se muestra una vez y se recuerda en el navegador.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(() => !alreadySeen());
  // Mientras el aviso está a la vista, la página lo sabe (el pie deja espacio para que no lo tape).
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset['cookieNotice'] = 'visible';
    return () => {
      delete document.documentElement.dataset['cookieNotice'];
    };
  }, [visible]);
  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(COOKIE_NOTICE_KEY, '1');
    } catch {
      /* sin almacenamiento: se oculta solo mientras la página está abierta */
    }
    setVisible(false);
  }

  return (
    <section
      aria-label="Aviso de cookies"
      className="surface fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-2xl flex-col gap-3 rounded-token-lg p-4 text-sm sm:flex-row sm:items-center sm:gap-4"
    >
      <p className="flex-1">
        Usamos solo cookies necesarias para mantener tu sesión. No usamos analítica ni publicidad.{' '}
        <Link to="/cookies" className="underline hover:text-text">
          Política de cookies
        </Link>
      </p>
      <button
        type="button"
        className="btn btn-primary btn-compact self-end sm:self-auto"
        onClick={dismiss}
      >
        Entendido
      </button>
    </section>
  );
}
