import { z } from 'zod';

/** Códigos de error estables del API (el cliente decide el mensaje según el código). */
export const ERROR_CODES = [
  'VALIDATION',
  'AUTH_INVALID',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'NOT_UNLOCKED',
  'TOKEN_INVALID',
  'RATE_LIMITED',
  'CONFLICT',
  'UNAVAILABLE',
  'INTERNAL',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Forma única de toda respuesta de error: { error: { code, message } }. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
