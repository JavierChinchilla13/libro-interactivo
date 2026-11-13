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
    /**
     * Cuándo se comprobó que la persona controla el correo (entró con Google o restableció la contraseña desde un
     * enlace enviado a ese correo). Las cuentas creadas con contraseña no lo tienen hasta entonces.
     */
    emailVerifiedAt: { type: Date },
    /** Última vez que vio el mensaje de bienvenida (ver `siteSettings.welcome`). */
    welcomeSeenAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /**
     * Edad y consentimientos declarados al crear la cuenta (solo lectoras que se registran; las cuentas de equipo y las
     * anteriores no los tienen). Se guarda lo mínimo: año y mes de nacimiento (nunca el día ni la edad calculada).
     */
    birthYear: { type: Number, min: 1900, max: 2200 },
    birthMonth: { type: Number, min: 1, max: 12 },
    /** Madre, padre o tutor autorizó la cuenta (solo de 16 a 17 años). Es una declaración, no una verificación. */
    guardianAuthorized: { type: Boolean },
    termsAcceptedAt: { type: Date },
    /** Consentimiento al tratamiento de datos: casilla propia, separada de los términos. */
    privacyConsentAt: { type: Date },
    /** Versión de los textos legales que se aceptaron (`LEGAL_VERSION`). */
    termsVersion: { type: String, maxlength: 40 },
    /**
     * Se pone cuando se borran la edad y los consentimientos declarados por quien creó la cuenta sin probar que
     * controlaba el correo (la dueña restableció la contraseña desde el correo): el siguiente ingreso los vuelve a
     * pedir y esta marca se quita. Las cuentas anteriores y las de equipo nunca la tienen.
     */
    consentRequiredAt: { type: Date },
    /**
     * Correos de novedades de la autora (opcionales, solo mayores de 18). `status` falta = nunca se apuntó. Se guarda lo
     * mínimo para demostrar el consentimiento: la última alta (fecha, versión de los textos y desde dónde) y la última
     * baja (fecha y por qué vía). El enlace de confirmación (para quien no tiene el correo comprobado) se guarda solo
     * como huella, con caducidad.
     */
    newsletter: {
      type: new Schema(
        {
          status: { type: String, enum: ['pending', 'subscribed', 'unsubscribed'] },
          requestedAt: { type: Date },
          subscribedAt: { type: Date },
          version: { type: String, maxlength: 40 },
          source: { type: String, enum: ['register', 'google', 'login', 'account'] },
          confirmTokenHash: { type: String, maxlength: 64 },
          confirmTokenExpiresAt: { type: Date },
          unsubscribedAt: { type: Date },
          /** Cuándo respondió a la invitación única del panel (o se apuntó por otro camino): no se vuelve a mostrar. */
          invitationAnsweredAt: { type: Date },
          unsubscribedVia: {
            type: String,
            enum: ['account', 'link', 'header', 'bounce', 'complaint'],
          },
        },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index(
  { 'newsletter.status': 1 },
  { partialFilterExpression: { 'newsletter.status': 'subscribed' } },
);
userSchema.index(
  { 'newsletter.confirmTokenHash': 1 },
  { unique: true, partialFilterExpression: { 'newsletter.confirmTokenHash': { $type: 'string' } } },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema, 'users');
