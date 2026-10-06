import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Registro de «visto» por lector y extra. Solo lo escribe el servidor al entregar el extra. */
const extraAccessSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    extraId: { type: Schema.Types.ObjectId, ref: 'Extra', required: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    viewCount: { type: Number, required: true, default: 1, min: 1 },
  },
  { timestamps: true },
);

extraAccessSchema.index({ userId: 1, extraId: 1 }, { unique: true });
extraAccessSchema.index({ userId: 1, bookId: 1 });
extraAccessSchema.index({ extraId: 1 });

export type ExtraAccessAttrs = InferSchemaType<typeof extraAccessSchema>;
export type ExtraAccessDoc = HydratedDocument<ExtraAccessAttrs>;
export const ExtraAccess = model('ExtraAccess', extraAccessSchema, 'extraAccess');
