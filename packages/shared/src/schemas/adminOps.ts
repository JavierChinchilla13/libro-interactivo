import { z } from 'zod';
import { emailSchema } from './auth.js';
import { objectIdSchema, roleSchema } from './common.js';

/**
 * Administración (fase 11): usuarios, mensajes de contacto, estadísticas y borrado de cuenta. Todo esto es **solo de
 * administradoras**; los intentos de prueba (`isTest`) nunca cuentan.
 */

// --- Usuarios ------------------------------------------------------------------------------------------------------

export const USER_STATUSES = ['active', 'disabled'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const adminUserListQuerySchema = z.object({
  /** Nombre o correo (texto literal, sin acentos ni mayúsculas). */
  q: z.string().trim().min(1).max(80).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminUserSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  status: userStatusSchema,
  createdAt: z.string(),
  lastLoginAt: z.string().optional(),
  /** Quizzes completados (sin contar las pruebas de las administradoras). */
  completedQuizzes: z.number().int(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserListResponseSchema = z.object({
  users: z.array(adminUserSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  /** Quizzes publicados en total, para mostrar «3 de 5». */
  totalQuizzes: z.number().int(),
});
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

export const adminUserParamsSchema = z.object({ userId: objectIdSchema });

export const adminUserDetailSchema = z.object({
  user: adminUserSchema,
  books: z.array(
    z.object({
      bookId: objectIdSchema,
      title: z.string(),
      bookCompletedAt: z.string().optional(),
      quizzes: z.array(
        z.object({
          quizId: objectIdSchema,
          title: z.string(),
          order: z.number().int(),
          /** `unlocked` = escaneó el código pero aún no lo completa. */
          status: z.enum(['completed', 'unlocked', 'none']),
          completedAt: z.string().optional(),
          resultTitle: z.string().optional(),
          /** Intentos completados (sin pruebas). */
          attempts: z.number().int(),
        }),
      ),
    }),
  ),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** Solo una administradora crea cuentas de administración. La persona elige su contraseña con el correo que recibe. */
export const createStaffUserRequestSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre').max(80),
  email: emailSchema,
  role: z.enum(['EDITOR', 'ADMIN']),
});
export type CreateStaffUserRequest = z.infer<typeof createStaffUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({ role: roleSchema.optional(), status: userStatusSchema.optional() })
  .refine((body) => body.role !== undefined || body.status !== undefined, {
    message: 'No hay nada que cambiar',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

/** Borrado de la propia cuenta: pide la contraseña. */
export const deleteAccountRequestSchema = z.object({ password: z.string().min(1).max(200) });
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

// --- Mensajes de contacto ------------------------------------------------------------------------------------------

export const adminMessageListQuerySchema = z.object({
  status: z.enum(['all', 'unhandled', 'handled']).default('all'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminMessageListQuery = z.infer<typeof adminMessageListQuerySchema>;

export const adminMessageSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  email: z.string(),
  message: z.string(),
  createdAt: z.string(),
  handled: z.boolean(),
  handledAt: z.string().optional(),
});
export type AdminMessage = z.infer<typeof adminMessageSchema>;

export const adminMessageListResponseSchema = z.object({
  messages: z.array(adminMessageSchema),
  total: z.number().int(),
  unhandled: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminMessageListResponse = z.infer<typeof adminMessageListResponseSchema>;

export const adminMessageParamsSchema = z.object({ messageId: objectIdSchema });
export const updateMessageRequestSchema = z.object({ handled: z.boolean() });

// --- Estadísticas --------------------------------------------------------------------------------------------------

export const adminStatsSchema = z.object({
  readers: z.object({
    total: z.number().int(),
    last7Days: z.number().int(),
    last30Days: z.number().int(),
    disabled: z.number().int(),
  }),
  staff: z.number().int(),
  /** Intentos reales: nunca cuentan los de prueba. */
  attempts: z.object({ completed: z.number().int(), inProgress: z.number().int() }),
  booksCompleted: z.number().int(),
  unhandledMessages: z.number().int(),
  quizzes: z.array(
    z.object({
      quizId: objectIdSchema,
      title: z.string(),
      bookTitle: z.string(),
      order: z.number().int(),
      /** Personas distintas que lo completaron. */
      completedUsers: z.number().int(),
      attempts: z.number().int(),
      results: z.array(z.object({ key: z.string(), title: z.string(), count: z.number().int() })),
    }),
  ),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;
