import { describe, expect, it } from 'vitest';
import {
  quizDraftSchema,
  createQuizRequestSchema,
  updateQuizMetaRequestSchema,
} from './adminQuiz.js';
import { bookInputSchema, slugSchema } from './book.js';
import { imageSignatureRequestSchema } from './upload.js';
import { wikiEntryInputSchema, wikiListQuerySchema } from './wiki.js';

const cover = {
  provider: 'cloudinary',
  publicId: 'libro/portada',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/portada',
  width: 10,
  height: 10,
  alt: 'Portada',
};

describe('slug', () => {
  it('acepta minúsculas, números y guiones; rechaza acentos, espacios y mayúsculas', () => {
    expect(slugSchema.safeParse('libro-1').success).toBe(true);
    for (const bad of ['Libro', 'libro 1', 'libró', '-libro', 'libro-', 'li--bro', '']) {
      expect(slugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('bookInputSchema', () => {
  const base = { slug: 'libro-1', title: 'T', order: 1, status: 'draft' as const };

  it('completa los valores por defecto', () => {
    expect(bookInputSchema.parse(base)).toMatchObject({
      synopsis: '',
      genres: [],
      purchaseLinks: [],
      wikiSections: [],
    });
  });

  it('un libro publicado o «próximamente» necesita portada; un borrador no', () => {
    expect(bookInputSchema.safeParse({ ...base, status: 'published' }).success).toBe(false);
    expect(bookInputSchema.safeParse({ ...base, status: 'upcoming' }).success).toBe(false);
    expect(bookInputSchema.safeParse({ ...base, status: 'published', cover }).success).toBe(true);
    expect(bookInputSchema.safeParse(base).success).toBe(true);
  });

  it('el fondo es de color o de imagen (nunca video) y el enlace de compra puede no llevar URL', () => {
    const video = { background: { type: 'video', url: 'https://x.com/v.mp4' } };
    expect(bookInputSchema.safeParse({ ...base, theme: video }).success).toBe(false);
    const link = { region: 'CR', kind: 'store', label: 'Compras presenciales' };
    expect(bookInputSchema.safeParse({ ...base, purchaseLinks: [link] }).success).toBe(true);
    expect(
      bookInputSchema.safeParse({ ...base, purchaseLinks: [{ ...link, url: 'no-es-url' }] })
        .success,
    ).toBe(false);
  });

  it('la fecha de lanzamiento es AAAA-MM-DD', () => {
    expect(bookInputSchema.safeParse({ ...base, releaseDate: '2026-12-01' }).success).toBe(true);
    expect(bookInputSchema.safeParse({ ...base, releaseDate: '01/12/2026' }).success).toBe(false);
  });
});

describe('wikiEntryInputSchema', () => {
  it('completa orden, estado, bloqueo y listas por defecto', () => {
    const entry = wikiEntryInputSchema.parse({ kind: 'term', slug: 'a', name: 'A' });
    expect(entry).toMatchObject({
      lockedDisplay: 'show',
      order: 1,
      status: 'draft',
      fields: [],
      links: [],
    });
  });

  it('rechaza tipos desconocidos y la inicial inválida en el filtro', () => {
    expect(wikiEntryInputSchema.safeParse({ kind: 'monstruo', slug: 'a', name: 'A' }).success).toBe(
      false,
    );
    expect(wikiListQuerySchema.safeParse({ letter: 'a' }).success).toBe(false);
    expect(wikiListQuerySchema.safeParse({ letter: '#' }).success).toBe(true);
  });
});

describe('quizDraftSchema (borrador)', () => {
  it('admite contenido incompleto: textos vacíos, preguntas sin respuestas y sin resultados', () => {
    const draft = {
      title: 'A medias',
      settings: {},
      stages: [
        {
          id: 'etapa-1',
          order: 1,
          producesFinal: true,
          questions: [{ id: 'p1', text: '', answers: [] }],
        },
      ],
      results: [],
    };
    const parsed = quizDraftSchema.parse(draft);
    expect(parsed.instructionsHtml).toBe('');
    expect(parsed.settings).toEqual({ allowRetake: true, showBreakdown: false });
    expect(parsed.stages[0]?.shuffleQuestions).toBe(true);
  });

  it('sigue exigiendo título e ids bien formados', () => {
    expect(
      quizDraftSchema.safeParse({ title: '', settings: {}, stages: [], results: [] }).success,
    ).toBe(false);
    const badId = {
      title: 'T',
      settings: {},
      results: [],
      stages: [{ id: 'etapa 1', order: 1, producesFinal: true, questions: [] }],
    };
    expect(quizDraftSchema.safeParse(badId).success).toBe(false);
  });
});

describe('crear quiz y cambiar slug/posición', () => {
  const id = '670000000000000000000001';
  it('«¿se puede repetir?» vale sí por defecto al crear', () => {
    const request = createQuizRequestSchema.parse({
      bookId: id,
      slug: 'quiz-1',
      order: 1,
      title: 'Q',
    });
    expect(request.settings).toEqual({ allowRetake: true, showBreakdown: false });
  });

  it('el cambio exige al menos un dato', () => {
    expect(updateQuizMetaRequestSchema.safeParse({}).success).toBe(false);
    expect(updateQuizMetaRequestSchema.safeParse({ order: 2 }).success).toBe(true);
  });
});

describe('imageSignatureRequestSchema', () => {
  it('el recurso es imagen por defecto y el propósito debe ser conocido', () => {
    expect(imageSignatureRequestSchema.parse({ purpose: 'cover' }).resource).toBe('image');
    expect(imageSignatureRequestSchema.safeParse({ purpose: 'otro' }).success).toBe(false);
  });
});
