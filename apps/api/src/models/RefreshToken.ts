import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Sesiones con refresh rotativo. Solo se guarda el hash del token opaco.
 * El TTL elimina el documento al llegar `expiresAt`.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    /** Agrupa la cadena de rotaciones de un mismo inicio de sesión. */
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    /** Token que sustituyó a este al rotar. */
    replacedBy: { type: Schema.Types.ObjectId, ref: 'RefreshToken' },
    revokedAt: { type: Date },
    userAgent: { type: String, maxlength: 200 },
    /** IP con HMAC (nunca en claro). */
    ipHash: { type: String, maxlength: 64 },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenAttrs = InferSchemaType<typeof refreshTokenSchema>;
export type RefreshTokenDoc = HydratedDocument<RefreshTokenAttrs>;
export const RefreshToken = model('RefreshToken', refreshTokenSchema, 'refreshTokens');
