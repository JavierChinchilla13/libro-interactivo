import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { Card } from '../models/Card.js';

/** `public_id` con la misma forma que el que genera el servidor. */
export function cardPublicId(): string {
  return `libro/cartas/${randomBytes(18).toString('base64url')}`;
}

/** Crea una carta directo en la base (la imagen no se verifica aquí). Datos de prueba: nada del libro real. */
export async function createCard(input: {
  bookId: Types.ObjectId | string;
  createdBy: Types.ObjectId | string;
  title?: string;
  order?: number;
  status?: 'published' | 'archived';
  /** Cuántas imágenes lleva (por defecto 1). */
  images?: number;
}) {
  return Card.create({
    bookId: input.bookId,
    title: input.title ?? '[PLACEHOLDER] Carta',
    order: input.order ?? 1,
    status: input.status ?? 'published',
    images: Array.from({ length: input.images ?? 1 }, () => ({
      publicId: cardPublicId(),
      format: 'jpg',
      width: 1200,
      height: 1800,
      bytes: 1_200_000,
    })),
    createdBy: input.createdBy,
  });
}
