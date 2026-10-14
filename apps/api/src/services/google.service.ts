import { OAuth2Client } from 'google-auth-library';

/** Lo que se toma de un `id_token` de Google ya verificado. */
export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name: string;
}

/** Verifica un `id_token` de Google. Devuelve `null` si no es válido (firma, caducidad o audiencia). */
export interface GoogleVerifier {
  verify(credential: string): Promise<GoogleProfile | null>;
}

/** Verificador real: valida firma, emisor, caducidad y que el token sea para este cliente (`audience`). */
export function createGoogleVerifier(clientId: string): GoogleVerifier {
  const client = new OAuth2Client(clientId);
  return {
    async verify(credential) {
      try {
        const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
        const payload = ticket.getPayload();
        if (!payload?.email) return null;
        return {
          email: payload.email,
          emailVerified: payload.email_verified === true,
          name: payload.name?.trim() || payload.email.split('@')[0] || 'Lector',
        };
      } catch {
        return null;
      }
    },
  };
}
