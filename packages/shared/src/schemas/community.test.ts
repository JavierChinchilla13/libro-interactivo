import { describe, expect, it } from 'vitest';
import { fanArtInputSchema, reviewInputSchema } from './community.js';

const image = {
  provider: 'cloudinary',
  publicId: 'libro/x',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/x',
  width: 10,
  height: 10,
  alt: 'x',
};

describe('fan arts', () => {
  it('por defecto es un borrador sin permiso y en la posición 1', () => {
    const parsed = fanArtInputSchema.parse({ image, artistName: 'Ana' });
    expect(parsed).toMatchObject({ status: 'draft', permissionConfirmed: false, order: 1 });
  });

  it('publicar exige el permiso confirmado; borrador y archivado no', () => {
    const base = { image, artistName: 'Ana', permissionConfirmed: false };
    const published = fanArtInputSchema.safeParse({ ...base, status: 'published' });
    expect(published.success).toBe(false);
    expect(!published.success && published.error.issues[0]?.path).toEqual(['permissionConfirmed']);
    expect(fanArtInputSchema.safeParse({ ...base, status: 'draft' }).success).toBe(true);
    expect(fanArtInputSchema.safeParse({ ...base, status: 'archived' }).success).toBe(true);
    expect(
      fanArtInputSchema.safeParse({ ...base, permissionConfirmed: true, status: 'published' })
        .success,
    ).toBe(true);
  });

  it('el nombre del artista es obligatorio y el enlace solo http(s)', () => {
    expect(fanArtInputSchema.safeParse({ image, artistName: '  ' }).success).toBe(false);
    expect(fanArtInputSchema.safeParse({ image }).success).toBe(false);
    expect(
      fanArtInputSchema.safeParse({ image, artistName: 'Ana', artistLink: 'javascript:1' }).success,
    ).toBe(false);
  });
});

describe('reseñas', () => {
  it('por defecto está publicada; texto y nombre son obligatorios', () => {
    expect(reviewInputSchema.parse({ text: 'Genial', authorName: 'Ana' })).toMatchObject({
      status: 'published',
      order: 1,
    });
    expect(reviewInputSchema.safeParse({ text: ' ', authorName: 'Ana' }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ text: 'x', authorName: '' }).success).toBe(false);
  });

  it('la calificación es un entero de 1 a 5 y el texto tiene tope', () => {
    for (const rating of [0, 6, 2.5]) {
      expect(reviewInputSchema.safeParse({ text: 'x', authorName: 'A', rating }).success).toBe(
        false,
      );
    }
    expect(reviewInputSchema.safeParse({ text: 'x', authorName: 'A', rating: 5 }).success).toBe(
      true,
    );
    expect(reviewInputSchema.safeParse({ text: 'x'.repeat(1001), authorName: 'A' }).success).toBe(
      false,
    );
  });
});
