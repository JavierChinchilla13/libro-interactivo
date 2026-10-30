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

/** Año y mes de nacimiento. La fecha posible y la edad las decide el servidor (`checkBirth`, `ageBand`). */
export const birthSchema = z.object({
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12),
});

/** Lo que la persona declara de su edad. Es una declaración: el sitio no verifica nada. */
export const ageDeclarationSchema = z.enum(['adult', 'minor_with_guardian']);
export type AgeDeclaration = z.infer<typeof ageDeclarationSchema>;

/**
 * Edad y consentimientos del alta. Los dos consentimientos van separados a propósito (términos de uso y tratamiento de
 * datos personales): el reglamento pide que el consentimiento sobre los datos se dé en un documento independiente.
 */
export const consentSchema = z.object({
  birth: birthSchema,
  ageDeclaration: ageDeclarationSchema,
  acceptTerms: z.literal(true, { error: 'Debes aceptar los términos de uso' }),
  acceptPrivacy: z.literal(true, { error: 'Debes autorizar el tratamiento de tus datos' }),
});
export type Consent = z.infer<typeof consentSchema>;

const accountShape = {
  name: nameSchema,
  email: emailSchema,
  password: z.string().max(PASSWORD_MAX_LENGTH, PASSWORD_PROBLEM_MESSAGES.TOO_LONG),
};

function checkAccountPassword(
  value: { name: string; email: string; password: string },
  ctx: z.RefinementCtx,
): void {
  for (const problem of checkPassword(value.password, { name: value.name, email: value.email })) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: PASSWORD_PROBLEM_MESSAGES[problem],
    });
  }
}

/** Solo nombre, correo y contraseña: lo que el formulario revisa mientras la edad aún no está resuelta. */
export const registerAccountSchema = z.object(accountShape).superRefine(checkAccountPassword);

export const registerRequestSchema = z
  .object({ ...accountShape, ...consentSchema.shape })
  .superRefine(checkAccountPassword);
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** En el login no se valida la política (solo que haya algo): las cuentas viejas deben poder entrar. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña').max(PASSWORD_MAX_LENGTH),
  /** Solo cuando el servidor pidió volver a declarar la edad y los consentimientos (`needs_profile`). */
  profile: consentSchema.optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Ingreso con Google: el `id_token` (credential) que entrega Google Identity Services; el servidor lo verifica. */
export const googleLoginRequestSchema = z.object({
  credential: z.string().min(20, 'Falta la credencial de Google').max(4096),
  /** Solo en el segundo paso de una persona nueva: la edad y los consentimientos. */
  profile: consentSchema.optional(),
});
export type GoogleLoginRequest = z.infer<typeof googleLoginRequestSchema>;

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

/**
 * Respuesta del ingreso con Google. Una persona nueva primero recibe `needs_profile` (con el nombre y el correo ya
 * verificados, para mostrarlos) y **no se crea nada** hasta que reenvía la credencial con su edad y consentimientos.
 */
export const googleLoginResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), user: authUserSchema }),
  z.object({ status: z.literal('needs_profile'), name: z.string(), email: z.string() }),
]);
export type GoogleLoginResponse = z.infer<typeof googleLoginResponseSchema>;

/**
 * Respuesta del ingreso con contraseña. Una cuenta a la que se le borraron la edad y los consentimientos declarados
 * (porque otra persona los había puesto antes de que su dueña probara controlar el correo) recibe `needs_profile`
 * y **no se abre sesión** hasta que reenvía el ingreso con su edad y sus consentimientos.
 */
export const loginResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), user: authUserSchema }),
  z.object({ status: z.literal('needs_profile'), name: z.string(), email: z.string() }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;
