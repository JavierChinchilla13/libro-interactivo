import { fieldVisualKeySchema, type FieldVisualKey } from '@libro/shared';
import type { Types } from 'mongoose';
import { WikiEntry } from '../models/WikiEntry.js';

export interface PublishedField {
  slug: string;
  name: string;
  visualKey: FieldVisualKey | undefined;
}

/**
 * Campos de poder PUBLICADOS por `slug` para un libro: los del propio libro y los de toda la saga (sin `bookId`).
 * Si un mismo `slug` existe en ambos sitios manda el del libro. Un campo en borrador, archivado o de otro libro no
 * se resuelve nunca. Lo usan el aviso al publicar un quiz y el fondo animado del resultado.
 */
export async function findPublishedFields(
  bookId: Types.ObjectId | string | undefined,
  slugs: readonly string[],
): Promise<Map<string, PublishedField>> {
  const found = new Map<string, PublishedField>();
  if (slugs.length === 0) return found;
  const entries = await WikiEntry.find({
    kind: 'power_field',
    slug: { $in: [...slugs] },
    status: 'published',
    $or: [...(bookId ? [{ bookId }] : []), { bookId: { $exists: false } }],
  })
    .select('slug name visualKey bookId')
    .lean();
  // Primero los de toda la saga y luego los del libro: al insertar en este orden, el del libro pisa al global.
  const ordered = [...entries].sort(
    (a, b) => Number(Boolean(a.bookId)) - Number(Boolean(b.bookId)),
  );
  for (const entry of ordered) {
    const key = fieldVisualKeySchema.safeParse(entry.visualKey);
    found.set(entry.slug, {
      slug: entry.slug,
      name: entry.name,
      visualKey: key.success ? key.data : undefined,
    });
  }
  return found;
}
