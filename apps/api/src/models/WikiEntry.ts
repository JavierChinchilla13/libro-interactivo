import { WIKI_KINDS, WIKI_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Wiki unificada: personajes, campos y poderes, lugares y glosario en una sola
 * colección. El bloqueo por progreso lo decide siempre el servidor al servir (fase 9).
 */
const wikiEntrySchema = new Schema(
  {
    /** Vacío = toda la saga. */
    bookId: { type: Schema.Types.ObjectId, ref: 'Book' },
    kind: { type: String, enum: [...WIKI_KINDS], required: true },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Sin acentos y en minúsculas: búsqueda y orden. */
    nameNormalized: { type: String, required: true },
    /** `A`–`Z` o `#`, derivada del nombre. */
    letter: { type: String, required: true, maxlength: 1 },
    summary: { type: String, maxlength: 300 },
    bodyHtml: { type: String },
    image: { type: Schema.Types.Mixed },
    group: { type: String, maxlength: 80 },
    fields: {
      type: [new Schema({ label: String, value: String }, { _id: false })],
      default: [],
    },
    parentId: { type: Schema.Types.ObjectId, ref: 'WikiEntry' },
    links: { type: [Schema.Types.ObjectId], default: [] },
    unlockAfter: { type: Schema.Types.Mixed },
    lockedDisplay: { type: String, enum: ['show', 'hide'], required: true, default: 'show' },
    order: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: [...WIKI_STATUSES], required: true, default: 'draft' },
  },
  { timestamps: true, minimize: false },
);

wikiEntrySchema.index({ kind: 1, bookId: 1, slug: 1 }, { unique: true });
wikiEntrySchema.index({ bookId: 1, kind: 1, status: 1, order: 1 });
wikiEntrySchema.index({ kind: 1, letter: 1, status: 1 });
wikiEntrySchema.index({ parentId: 1, order: 1 });
wikiEntrySchema.index({ nameNormalized: 1 });

export type WikiEntryAttrs = InferSchemaType<typeof wikiEntrySchema>;
export type WikiEntryDoc = HydratedDocument<WikiEntryAttrs>;
export const WikiEntry = model('WikiEntry', wikiEntrySchema, 'wikiEntries');
