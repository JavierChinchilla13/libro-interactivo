import type { TestProgressResetResponse } from '@libro/shared';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { GameSession } from '../models/GameSession.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { isStaff, type Actor } from './progress.service.js';

/**
 * «Reiniciar mi progreso de prueba» (solo equipo). Borra ÚNICAMENTE los intentos de quiz y las partidas de juego de
 * PRUEBA (`isTest: true`) de la cuenta de la sesión, para repetir el recorrido desde cero.
 *
 * Qué NO toca, a propósito: `UserProgress` (los intentos de prueba nunca escriben ahí; lo que haya es real o heredado de
 * cuando la cuenta jugaba como lectora), `ExtraAccess`, `User` (p. ej. el mensaje de bienvenida visto), los intentos y
 * partidas reales de la cuenta (`isTest: false`) ni nada de ninguna otra persona. No recibe ningún identificador: el
 * `userId` sale siempre de la sesión.
 */
export function createTestProgressService(deps: { logger?: Logger }) {
  async function reset(actor: Actor): Promise<TestProgressResetResponse> {
    // Segunda barrera (la ruta ya exige EDITOR o ADMIN): un lector nunca llega a borrar nada.
    if (!isStaff(actor.role)) throw new AppError('FORBIDDEN', 'No tienes permiso para esto');
    const [attempts, sessions] = await Promise.all([
      QuizAttempt.deleteMany({ userId: actor.userId, isTest: true }),
      GameSession.deleteMany({ userId: actor.userId, isTest: true }),
    ]);
    const counts = { quizAttempts: attempts.deletedCount, gameSessions: sessions.deletedCount };
    // Solo quién y cuántos: sin contenido, sin correos ni tokens.
    deps.logger?.info({ actorId: actor.userId, ...counts }, 'Progreso de prueba reiniciado');
    return counts;
  }

  return { reset };
}

export type TestProgressService = ReturnType<typeof createTestProgressService>;
