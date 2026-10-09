import { ROLES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Usuarios (lectores, editoras, administradoras). */
const userSchema = new Schema(
  {
    /** Correo como lo escribió la persona (para mostrar). */
    email: { type: String, required: true, trim: true, maxlength: 254 },
    /** Correo normalizado (NFC + minúsculas). El índice único impide cuentas duplicadas. */
    emailNormalized: { type: String, required: true, unique: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    /** Argon2id. Nunca se devuelve en respuestas. */
    passwordHash: { type: String, required: true },
    role: { type: String, enum: [...ROLES], required: true, default: 'USER' },
    status: { type: String, enum: ['active', 'disabled'], required: true, default: 'active' },
    /** Se incrementa para invalidar todos los access tokens vigentes. */
    tokenVersion: { type: Number, required: true, default: 0 },
    failedLoginCount: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    /** Última vez que vio el mensaje de bienvenida (ver `siteSettings.welcome`). */
    welcomeSeenAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1 });

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema, 'users');
