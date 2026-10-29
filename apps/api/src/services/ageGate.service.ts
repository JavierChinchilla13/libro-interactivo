import { ipKeyGenerator } from 'express-rate-limit';
import type { Clock } from '../lib/clock.js';

/** Rechazos por edad que se toleran por IP y por hora antes de cerrar la puerta a esa IP. */
export const AGE_REJECTION_LIMIT = 5;
const HOUR_MS = 60 * 60_000;
const MAX_TRACKED = 10_000;

/**
 * Freno a quien «prueba fechas» para ver cuál le sirve. Cuenta **solo los rechazos por edad** (no cualquier registro),
 * por IP, en memoria: no guarda la fecha, el correo ni nada de la persona; solo «esta red tuvo N rechazos». Con el tope
 * alcanzado responde igual que a una menor, también a una fecha válida, hasta que pasa la hora.
 *
 * Efecto a conocer: en una red compartida, la persona que llegue después de N menores no podrá registrarse esa hora.
 */
export function createAgeGate({
  clock,
  limit = AGE_REJECTION_LIMIT,
  windowMs = HOUR_MS,
  maxTracked = MAX_TRACKED,
}: {
  clock: Clock;
  limit?: number;
  windowMs?: number;
  maxTracked?: number;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  /** Misma agrupación que los demás límites: una red IPv6 /56 cuenta como una sola. */
  const keyOf = (ip: string | undefined) => ipKeyGenerator(ip ?? '');

  function live(key: string, now: number) {
    const entry = hits.get(key);
    if (!entry) return undefined;
    if (entry.resetAt <= now) {
      hits.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    /** ¿Esta red ya agotó sus rechazos? */
    isClosed(ip: string | undefined): boolean {
      const entry = live(keyOf(ip), clock().getTime());
      return entry !== undefined && entry.count >= limit;
    },
    /** Anota un rechazo por edad. Nunca guarda nada de la persona. */
    recordRejection(ip: string | undefined): void {
      const now = clock().getTime();
      const key = keyOf(ip);
      const entry = live(key, now);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (hits.size >= maxTracked) {
        for (const [other, value] of hits) if (value.resetAt <= now) hits.delete(other);
        // Sin hueco todavía: se suelta la entrada más antigua para que la memoria no crezca sin tope.
        const oldest = hits.keys().next();
        if (hits.size >= maxTracked && !oldest.done) hits.delete(oldest.value);
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
    },
  };
}

export type AgeGate = ReturnType<typeof createAgeGate>;
