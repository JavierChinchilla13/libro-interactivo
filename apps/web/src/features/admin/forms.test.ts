import {
  bookInputSchema,
  wikiEntryInputSchema,
  type BookResponse,
  type WikiEntryResponse,
} from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../shared/api/client';
import { emptyBookForm, formFromBook, payloadFromForm as bookPayload } from './books/bookForm';
import { errorMessage, fieldErrors, slugify } from './errors';
import { emptyWikiForm, formFromEntry, payloadFromForm as wikiPayload } from './wiki/wikiForm';

const cover = {
  provider: 'cloudinary' as const,
  publicId: 'a',
  url: 'https://res.cloudinary.com/x/a',
  width: 1,
  height: 1,
  alt: 'Portada',
};

describe('slugify', () => {
  it('quita acentos, símbolos y espacios', () => {
    expect(slugify('  ¡Álvaro y la Sala 3!  ')).toBe('alvaro-y-la-sala-3');
    expect(slugify('Ñandú')).toBe('nandu');
    expect(slugify('---')).toBe('');
    expect(slugify('a'.repeat(200))).toHaveLength(80);
  });
});

describe('errorMessage y fieldErrors', () => {
  it('traduce los errores del cliente y conserva los mensajes de validación del servidor', () => {
    expect(errorMessage(new ApiClientError('NETWORK', 'x'))).toMatch(/conexión/i);
    expect(
      errorMessage(new ApiClientError('CONFLICT', 'Ya existe un libro con ese slug', 409)),
    ).toBe('Ya existe un libro con ese slug');
    expect(
      errorMessage(
        new ApiClientError('UNAVAILABLE', 'La subida de imágenes no está configurada todavía'),
      ),
    ).toMatch(/imágenes/);
    expect(errorMessage(new ApiClientError('FORBIDDEN', 'x'))).toMatch(/permiso/i);
    expect(errorMessage(new Error('boom'))).toBe('Ocurrió un error inesperado.');
  });

  it('agrupa por ruta de campo y se queda con el primer mensaje', () => {
    expect(
      fieldErrors([
        { path: ['purchaseLinks', 0, 'url'], message: 'URL inválida' },
        { path: ['purchaseLinks', 0, 'url'], message: 'otro' },
        { path: ['cover'], message: 'Falta portada' },
      ]),
    ).toEqual({ 'purchaseLinks.0.url': 'URL inválida', cover: 'Falta portada' });
  });
});

describe('formulario de libro', () => {
  it('un libro nuevo trae las 4 pestañas de la wiki sin reglas y un borrador válido con título y slug', () => {
    const form = { ...emptyBookForm(2), title: 'Libro 2', slug: 'libro-2' };
    expect(form.order).toBe('2');
    expect(form.wikiSections.map((section) => section.kind)).toEqual([
      'character',
      'power_field',
      'place',
      'term',
    ]);
    expect(form.wikiSections.every((section) => section.unlockAfter === undefined)).toBe(true);
    expect(bookInputSchema.safeParse(bookPayload(form)).success).toBe(true);
  });

  it('omite lo vacío, separa los géneros y convierte números', () => {
    const payload = bookPayload({
      ...emptyBookForm(),
      title: ' T ',
      slug: 'libro-1',
      tagline: '  ',
      genres: 'ciencia ficción, , distopía ',
      minAge: '16',
      isbn: '',
    });
    expect(payload).toMatchObject({
      title: 'T',
      genres: ['ciencia ficción', 'distopía'],
      minAge: 16,
      order: 1,
    });
    expect(payload).not.toHaveProperty('tagline');
    expect(payload).not.toHaveProperty('isbn');
    expect(payload).not.toHaveProperty('theme');
    expect(payload).not.toHaveProperty('releaseDate');
  });

  it('el tema solo se manda si hay color o fondo, y el fondo de imagen exige la imagen', () => {
    const base = { ...emptyBookForm(), title: 'T', slug: 't' };
    expect(bookPayload({ ...base, primaryColor: '#444444' }).theme).toEqual({
      primaryColor: '#444444',
      background: { type: 'color', color: '#f4f4f4' },
    });
    expect(
      bookPayload({ ...base, background: 'color', backgroundColor: '#112233' }).theme?.background,
    ).toEqual({ type: 'color', color: '#112233' });
    expect(bookPayload({ ...base, background: 'image' })).not.toHaveProperty('theme');
    expect(
      bookPayload({ ...base, background: 'image', backgroundImage: cover }).theme?.background,
    ).toMatchObject({ type: 'image' });
  });

  it('publicar sin portada no pasa la validación compartida y con portada sí', () => {
    const form = { ...emptyBookForm(), title: 'T', slug: 't', status: 'published' as const };
    expect(bookInputSchema.safeParse(bookPayload(form)).success).toBe(false);
    expect(bookInputSchema.safeParse(bookPayload({ ...form, cover })).success).toBe(true);
  });

  it('al editar, ida y vuelta conserva los datos y un libro viejo recupera las pestañas que le faltan (apagadas)', () => {
    const book: BookResponse = {
      id: '670000000000000000000010',
      slug: 'libro-1',
      title: 'Libro 1',
      synopsis: '<p>x</p>',
      genres: ['a'],
      order: 3,
      status: 'draft',
      purchaseLinks: [{ region: 'CR', kind: 'store', label: 'Compras presenciales' }],
      wikiSections: [{ kind: 'term', title: 'Glosario', order: 4, enabled: true }],
      createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    };
    const form = formFromBook(book);
    expect(form.slugTouched).toBe(true);
    expect(form.wikiSections.map((s) => [s.kind, s.enabled])).toEqual([
      ['character', false],
      ['power_field', false],
      ['place', false],
      ['term', true],
    ]);
    const payload = bookPayload(form);
    expect(payload).toMatchObject({ slug: 'libro-1', order: 3, genres: ['a'] });
    expect(payload.purchaseLinks).toHaveLength(1);
  });
});

describe('formulario de wiki', () => {
  const base = { ...emptyWikiForm('term'), name: 'Éter', slug: 'eter' };

  it('un término mínimo es válido y no manda datos de otros tipos', () => {
    const payload = wikiPayload({
      ...base,
      group: 'ignorado',
      parentId: 'x',
      links: ['y'],
      fields: [{ label: 'a', value: 'b' }],
    });
    expect(wikiEntryInputSchema.safeParse(payload).success).toBe(true);
    expect(payload).not.toHaveProperty('group');
    expect(payload).not.toHaveProperty('parentId');
    expect(payload).not.toHaveProperty('links');
    expect(payload).not.toHaveProperty('fields');
  });

  it('cada tipo manda lo suyo: poder → campo, lugar → grupo y enlaces, personaje → datos completos', () => {
    const id = '670000000000000000000001';
    expect(wikiPayload({ ...base, kind: 'power', parentId: id })).toMatchObject({ parentId: id });
    expect(wikiPayload({ ...base, kind: 'place', group: 'Sala', links: [id] })).toMatchObject({
      group: 'Sala',
      links: [id],
    });
    const character = wikiPayload({
      ...base,
      kind: 'character',
      fields: [
        { label: 'Edad', value: '17' },
        { label: '', value: 'x' },
      ],
    });
    expect(character).toMatchObject({ fields: [{ label: 'Edad', value: '17' }] });
  });

  it('el bloqueo por quiz solo se manda si se eligió uno, con su modo de mostrar', () => {
    const quiz = '670000000000000000000020';
    expect(wikiPayload(base)).not.toHaveProperty('unlockAfter');
    expect(wikiPayload({ ...base, unlockQuizId: quiz, lockedDisplay: 'hide' })).toMatchObject({
      unlockAfter: { kind: 'quiz', refId: quiz },
      lockedDisplay: 'hide',
    });
  });

  it('ida y vuelta de una entrada existente', () => {
    const entry: WikiEntryResponse = {
      id: '670000000000000000000060',
      kind: 'power',
      slug: 'poder-1',
      name: 'Poder 1',
      letter: 'P',
      fields: [],
      parentId: '670000000000000000000061',
      links: [],
      lockedDisplay: 'show',
      order: 2,
      status: 'published',
      createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    };
    const form = formFromEntry(entry);
    expect(form).toMatchObject({
      kind: 'power',
      parentId: '670000000000000000000061',
      status: 'published',
      order: '2',
    });
    expect(wikiPayload(form)).toMatchObject({
      kind: 'power',
      slug: 'poder-1',
      parentId: '670000000000000000000061',
      order: 2,
    });
  });
});
