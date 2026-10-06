import { ACCESS_TARGET_KINDS } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Códigos QR de desbloqueo. Solo se guarda el HASH del token: el token se recalcula a partir
 * del id (HMAC) para regenerar el mismo QR. Nunca se guarda el token en claro ni se registra en logs.
 */
const accessTokenSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    target: {
      kind: { type: String, enum: [...ACCESS_TARGET_KINDS], required: true },
      refId: { type: Schema.Types.ObjectId, required: true },
    },
    tokenHash: { type: String, required: true },
    label: { type: String, required: true, maxlength: 300 },
    status: { type: String, enum: ['active', 'revoked'], required: true, default: 'active' },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revokedReason: { type: String, maxlength: 200 },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'AccessToken' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    redeemCount: { type: Number, required: true, default: 0, min: 0 },
    lastRedeemedAt: { type: Date },
  },
  { timestamps: true },
);

accessTokenSchema.index({ tokenHash: 1 }, { unique: true });
// Un solo QR activo por experiencia (revocar/rotar libera el lugar).
accessTokenSchema.index(
  { 'target.kind': 1, 'target.refId': 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
accessTokenSchema.index({ bookId: 1, status: 1 });

export type AccessTokenAttrs = InferSchemaType<typeof accessTokenSchema>;
export type AccessTokenDoc = HydratedDocument<AccessTokenAttrs>;
export const AccessToken = model('AccessToken', accessTokenSchema, 'accessTokens');
