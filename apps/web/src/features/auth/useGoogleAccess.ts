import type { AuthUser, Consent } from '@libro/shared';
import { useState } from 'react';
import { useGoogleLogin } from './session';

interface PendingProfile {
  /** La credencial que entregó Google: vive solo en memoria y se reenvía junto con el perfil (no se guarda). */
  credential: string;
  name: string;
  email: string;
}

/**
 * El flujo de «Continuar con Google» para ingreso y registro. Una cuenta que ya existe entra directo. Una persona
 * nueva pasa por un segundo paso (edad y consentimientos) antes de que el servidor cree nada.
 */
export function useGoogleAccess(onSignedIn: (user: AuthUser) => void) {
  const google = useGoogleLogin();
  const [pending, setPending] = useState<PendingProfile | null>(null);

  return {
    /** Si hay datos aquí, se debe mostrar el segundo paso. */
    pending,
    isPending: google.isPending,
    error: google.error,
    start(credential: string) {
      google.mutate(
        { credential },
        {
          onSuccess: (data) => {
            if (data.status === 'ok') onSignedIn(data.user);
            else setPending({ credential, name: data.name, email: data.email });
          },
        },
      );
    },
    submitProfile(profile: Consent) {
      if (!pending) return;
      google.mutate(
        { credential: pending.credential, profile },
        {
          onSuccess: (data) => {
            if (data.status === 'ok') onSignedIn(data.user);
          },
        },
      );
    },
    cancel() {
      setPending(null);
      google.reset();
    },
  };
}
