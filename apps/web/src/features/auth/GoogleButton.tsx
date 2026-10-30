import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        ux_mode?: 'popup';
      }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/** ID de cliente OAuth (público). Sin él, el ingreso con Google no se muestra. */
export const GOOGLE_CLIENT_ID = (import.meta.env as Record<string, string | undefined>)[
  'VITE_GOOGLE_CLIENT_ID'
]?.trim();

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Carga el script de Google Identity Services, y solo cuando la persona toca «Continuar con Google». */
function loadScript(): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error('No se pudo cargar Google'));
    };
    document.head.appendChild(script);
  });
}

/** El logotipo de Google (cuatro colores de su marca; se muestra tal cual la marca lo pide). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

/**
 * «Continuar con Google». El script de Google (y las cookies que pueda poner) **no se carga hasta que la persona toca
 * el botón**: así abrir el ingreso o el registro no contacta a Google. Al tocarlo se carga el script y Google dibuja su
 * propio botón en el mismo lugar; ese segundo toque abre el ingreso y entrega un `id_token` que el servidor verifica (el
 * cliente nunca decide quién es la persona). Sin ID de cliente no renderiza nada.
 */
export function GoogleButton({
  onCredential,
  disabled = false,
  clientId = GOOGLE_CLIENT_ID,
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
  clientId?: string | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const latest = useRef(onCredential);
  useEffect(() => {
    latest.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (status !== 'ready' || !clientId) return;
    const element = host.current;
    if (!element || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) latest.current(response.credential);
      },
    });
    element.replaceChildren();
    window.google.accounts.id.renderButton(element, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.min(320, Math.max(220, element.clientWidth || 320)),
    });
  }, [status, clientId]);

  function start() {
    setStatus('loading');
    loadScript().then(
      () => setStatus('ready'),
      () => setStatus('failed'),
    );
  }

  if (!clientId) return null;
  if (status === 'failed') {
    return (
      <p role="status" className="text-center text-sm text-muted">
        No pudimos abrir Google. Puedes seguir con tu correo y contraseña.
      </p>
    );
  }
  if (status === 'ready') {
    return (
      // `color-scheme: light` a propósito: el botón de Google vive en un iframe que declara esquema claro. Si la página
      // (oscura) declara otro, el navegador pinta el iframe con un fondo blanco opaco y asoman esquinas cuadradas
      // alrededor de la píldora. Con el mismo esquema el marco es transparente. No afecta al resto de la página.
      <div
        ref={host}
        aria-label="Continuar con Google"
        className={`flex min-h-11 w-full justify-center [color-scheme:light] ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        className="btn btn-secondary w-full gap-2"
        disabled={disabled || status === 'loading'}
        onClick={start}
      >
        <GoogleMark />
        {status === 'loading' ? 'Abriendo Google…' : 'Continuar con Google'}
      </button>
      <p className="text-center text-xs text-muted">
        Google carga su propio botón y puede usar sus cookies.{' '}
        <Link to="/cookies" className="underline hover:text-text">
          Política de cookies
        </Link>
      </p>
    </div>
  );
}
