import { z } from 'zod';

/**
 * «Reiniciar mi progreso de prueba» (solo equipo): no recibe nada. Se validan vacíos y estrictos para que ningún dato del
 * cliente (un `userId`, por ejemplo) pueda llegar al servicio: el borrado siempre es de la cuenta de la sesión.
 */
export const testProgressResetQuerySchema = z.object({}).strict();
export const testProgressResetBodySchema = z.object({}).strict().optional();

/** Cuántas pruebas se borraron (solo conteos; nada de contenido). */
export const testProgressResetResponseSchema = z.object({
  quizAttempts: z.number().int().min(0),
  gameSessions: z.number().int().min(0),
});
export type TestProgressResetResponse = z.infer<typeof testProgressResetResponseSchema>;
