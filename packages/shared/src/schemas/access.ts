import { z } from 'zod';
import { objectIdSchema } from './common.js';

/** Códigos QR de desbloqueo. Solo existen para quizzes y para el juego. */
export const ACCESS_TARGET_KINDS = ['quiz', 'game'] as const;
export const accessTargetKindSchema = z.enum(ACCESS_TARGET_KINDS);

export const createAccessTokenRequestSchema = z.object({
  kind: accessTargetKindSchema,
  refId: objectIdSchema,
});
export type CreateAccessTokenRequest = z.infer<typeof createAccessTokenRequestSchema>;

export const accessTokenResponseSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  target: z.object({ kind: accessTargetKindSchema, refId: objectIdSchema }),
  label: z.string(),
  status: z.enum(['active', 'revoked']),
  redeemCount: z.number().int().min(0),
  lastRedeemedAt: z.string().optional(),
  revokedAt: z.string().optional(),
  revokedReason: z.string().optional(),
  replacedBy: objectIdSchema.optional(),
  createdAt: z.string(),
});
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

export const accessTokenListQuerySchema = z.object({ bookId: objectIdSchema.optional() });
export const accessTokenListResponseSchema = z.object({
  tokens: z.array(accessTokenResponseSchema),
});
export const accessTokenParamsSchema = z.object({ tokenId: objectIdSchema });
export const revokeAccessTokenRequestSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

/** El token que viaja en la URL del QR (`/u/<token>`). */
/** Largo máximo laxo a propósito: un token de largo raro debe caer en el mensaje genérico, no en un error de validación distinto. */
export const accessTokenParamSchema = z.object({ token: z.string().min(1).max(2000) });

/** Metadatos mínimos para mostrar «vas a desbloquear X» antes de iniciar sesión. Sin contenido protegido. */
export const resolveAccessResponseSchema = z.object({
  valid: z.literal(true),
  bookTitle: z.string(),
  kind: accessTargetKindSchema,
  title: z.string(),
});
export type ResolveAccessResponse = z.infer<typeof resolveAccessResponseSchema>;

export const redeemAccessRequestSchema = z.object({ token: z.string().min(1).max(2000) });
export const redeemAccessResponseSchema = z.object({
  kind: accessTargetKindSchema,
  refId: objectIdSchema,
  bookId: objectIdSchema,
  title: z.string(),
  /** `true` si ya lo tenía desbloqueado (canjear de nuevo es inofensivo). */
  alreadyUnlocked: z.boolean(),
});
export type RedeemAccessResponse = z.infer<typeof redeemAccessResponseSchema>;
