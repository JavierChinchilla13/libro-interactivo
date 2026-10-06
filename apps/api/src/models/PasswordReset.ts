import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Tokens de un solo uso para recuperar la contraseña.
 * Solo se guarda el hash; el TTL elimina el documento al caducar.
 */
const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    /** Marca de uso único: se fija de forma atómica al canjear. */
    usedAt: { type: Date },
  },
  { timestamps: true },
);

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetAttrs = InferSchemaType<typeof passwordResetSchema>;
export type PasswordResetDoc = HydratedDocument<PasswordResetAttrs>;
export const PasswordReset = model('PasswordReset', passwordResetSchema, 'passwordResets');
