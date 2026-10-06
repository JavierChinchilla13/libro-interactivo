import { roleSchema, type Role } from '@libro/shared';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { addSeconds, type Clock } from '../lib/clock.js';

const ISSUER = 'libro-interactivo';
const AUDIENCE = 'libro-interactivo-web';

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: roleSchema,
  tv: z.number().int().nonnegative(),
});

export interface AccessClaims {
  userId: string;
  role: Role;
  /** Versión de tokens del usuario al emitir (permite invalidar todos de golpe). */
  tokenVersion: number;
}

export interface TokenServiceOptions {
  secret: string;
  ttlSeconds: number;
  clock: Clock;
}

export function createTokenService({ secret, ttlSeconds, clock }: TokenServiceOptions) {
  const key = new TextEncoder().encode(secret);

  return {
    /** Firma un access token de vida corta (HS256). */
    async signAccess(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
      const now = clock();
      const expiresAt = addSeconds(now, ttlSeconds);
      const token = await new SignJWT({ role: claims.role, tv: claims.tokenVersion })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(Math.floor(now.getTime() / 1000))
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(key);
      return { token, expiresAt };
    },

    /** Devuelve las claims o null si el token es inválido, está manipulado o caducó. */
    async verifyAccess(token: string): Promise<AccessClaims | null> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
          currentDate: clock(),
        });
        const claims = claimsSchema.parse(payload);
        return { userId: claims.sub, role: claims.role, tokenVersion: claims.tv };
      } catch {
        return null;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
