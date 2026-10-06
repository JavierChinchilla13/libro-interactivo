import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_PROBLEM_MESSAGES,
  checkPassword,
} from '../passwordPolicy.js';
import { emailSchema, nameSchema } from './auth.js';

/** Respuesta genérica de acciones sin datos: `{ message }`. */
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/** Contraseña nueva: política sin contexto (el API vuelve a comprobarla con nombre y correo de la cuenta). */
const newPasswordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, PASSWORD_PROBLEM_MESSAGES.TOO_LONG)
  .superRefine((password, ctx) => {
    for (const problem of checkPassword(password)) {
      ctx.addIssue({ code: 'custom', message: PASSWORD_PROBLEM_MESSAGES[problem] });
    }
  });

/** La contraseña nueva se escribe dos veces. */
function requireMatchingConfirmation<T extends { newPassword: string; newPasswordConfirm: string }>(
  value: T,
  ctx: z.RefinementCtx,
): void {
  if (value.newPassword !== value.newPasswordConfirm) {
    ctx.addIssue({
      code: 'custom',
      path: ['newPasswordConfirm'],
      message: 'Las contraseñas no coinciden',
    });
  }
}

/** Editar perfil: en la v1 solo el nombre (el correo no se puede cambiar). */
export const updateProfileRequestSchema = z.object({ name: nameSchema });
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Escribe tu contraseña actual').max(PASSWORD_MAX_LENGTH),
    newPassword: newPasswordSchema,
    newPasswordConfirm: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .superRefine(requireMatchingConfirmation);
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().min(20, 'Enlace no válido').max(200, 'Enlace no válido'),
    newPassword: newPasswordSchema,
    newPasswordConfirm: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .superRefine(requireMatchingConfirmation);
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
