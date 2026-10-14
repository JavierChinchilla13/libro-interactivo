import { useEffect, useRef, useState } from 'react';

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
let scriptPromise: Promise<void> | undefined;

/** Carga el script de Google Identity Services una sola vez (solo en las pantallas que lo piden). */
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error('No se pudo cargar Google'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * «Continuar con Google». Google dibuja el botón y entrega un `id_token`; el servidor lo verifica (el cliente nunca
 * decide quién es la persona). Sin `VITE_GOOGLE_CLIENT_ID` no renderiza nada.
 */
export function GoogleButton({
  onCredential,
  disabled = false,
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(onCredential);
  useEffect(() => {
    latest.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        const element = host.current;
        if (cancelled || !element || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
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
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID || failed) return null;
  return (
    <div
      ref={host}
      aria-label="Continuar con Google"
      className={`flex min-h-11 w-full justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    />
  );
}
