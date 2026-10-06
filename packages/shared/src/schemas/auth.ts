import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_PROBLEM_MESSAGES,
  checkPassword,
} from '../passwordPolicy.js';
import { objectIdSchema, roleSchema } from './common.js';

/** Correo: se recorta y se pasa a minúsculas; el API además lo normaliza (NFC) para el índice único. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo')
  .pipe(z.email('Escribe un correo válido'));

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(80, 'El nombre no puede superar los 80 caracteres');

export const registerRequestSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: z.string().max(PASSWORD_MAX_LENGTH, PASSWORD_PROBLEM_MESSAGES.TOO_LONG),
  })
  .superRefine((value, ctx) => {
    for (const problem of checkPassword(value.password, {
      name: value.name,
      email: value.email,
    })) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: PASSWORD_PROBLEM_MESSAGES[problem],
      });
    }
  });
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** En el login no se valida la política (solo que haya algo): las cuentas viejas deben poder entrar. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña').max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Datos públicos del usuario (nunca incluye hash ni contadores internos). */
export const authUserSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({ user: authUserSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;
