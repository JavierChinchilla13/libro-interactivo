import { extraInputSchema } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { checkFile, emptyExtraForm, formFromExtra, payloadFromForm } from './extraForm';

const BOOK = '670000000000000000000010';
const file = {
  storageKey: `extras/${BOOK}/a.pdf`,
  mime: 'application/pdf',
  size: 1000,
  originalName: 'a.pdf',
};

describe('formulario de extras', () => {
  const base = { ...emptyExtraForm(BOOK), title: 'Capítulo extra', slug: 'capitulo-extra' };

  it('un texto manda el HTML y nunca archivo; sin texto no pasa la validación', () => {
    const payload = payloadFromForm({ ...base, bodyHtml: '<p>Hola</p>', file });
    expect(payload).toMatchObject({ kind: 'text', bodyHtml: '<p>Hola</p>' });
    expect(payload).not.toHaveProperty('file');
    expect(extraInputSchema.safeParse(payload).success).toBe(true);
    expect(extraInputSchema.safeParse(payloadFromForm(base)).success).toBe(false);
  });

  it('un PDF o una imagen mandan el archivo y nunca texto; sin archivo no pasa la validación', () => {
    const pdf = payloadFromForm({ ...base, kind: 'pdf', file, bodyHtml: '<p>ignorado</p>' });
    expect(pdf).toMatchObject({ kind: 'pdf', file });
    expect(pdf).not.toHaveProperty('bodyHtml');
    expect(extraInputSchema.safeParse(pdf).success).toBe(true);
    expect(extraInputSchema.safeParse(payloadFromForm({ ...base, kind: 'image' })).success).toBe(
      false,
    );
  });

  it('la descripción vacía se omite y el orden se convierte a número', () => {
    const payload = payloadFromForm({ ...base, description: '  ', order: '3' });
    expect(payload).not.toHaveProperty('description');
    expect(payload.order).toBe(3);
  });

  it('ida y vuelta de un extra existente', () => {
    const form = formFromExtra({
      id: '670000000000000000000040',
      bookId: BOOK,
      slug: 'cap',
      title: 'Cap',
      kind: 'pdf',
      file,
      order: 2,
      status: 'published',
      createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    });
    expect(form).toMatchObject({ kind: 'pdf', status: 'published', order: '2', slugTouched: true });
    expect(payloadFromForm(form)).toMatchObject({ slug: 'cap', kind: 'pdf', file });
  });
});

describe('checkFile', () => {
  it('acepta PDF e imágenes permitidas y rechaza otros tipos y tamaños excesivos', () => {
    expect(checkFile('pdf', { type: 'application/pdf', size: 1000 })).toBeNull();
    expect(checkFile('pdf', { type: 'image/png', size: 1000 })).toMatch(/PDF/);
    expect(checkFile('pdf', { type: 'application/pdf', size: 26 * 1024 * 1024 })).toMatch(
      /pesa demasiado/,
    );
    expect(checkFile('image', { type: 'image/webp', size: 1000 })).toBeNull();
    expect(checkFile('image', { type: 'image/gif', size: 1000 })).toMatch(/PNG, JPG o WebP/);
    expect(checkFile('image', { type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(
      /pesa demasiado/,
    );
  });
});
