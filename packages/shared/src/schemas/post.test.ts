import { describe, expect, it } from 'vitest';
import {
  POST_TEMPLATES,
  collectPostImages,
  parsePostData,
  postInputSchema,
  postTemplates,
} from './post.js';

const image = {
  provider: 'cloudinary',
  publicId: 'libro/x',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/x',
  width: 10,
  height: 10,
  alt: 'x',
};

describe('plantillas de actualizaciones', () => {
  it('cada plantilla tiene etiqueta, tipo propuesto y esquemas para publicar y para borrador', () => {
    for (const template of POST_TEMPLATES) {
      const def = postTemplates[template];
      expect(def.label.length).toBeGreaterThan(0);
      expect(['novedad', 'evento', 'invitacion']).toContain(def.defaultCategory);
      expect(def.htmlFields.length).toBeGreaterThan(0);
      // Un borrador vacío siempre es válido; publicar vacío nunca (todas tienen algún dato obligatorio).
      expect(parsePostData(template, {}, false).success, template).toBe(true);
      expect(parsePostData(template, {}, true).success, template).toBe(false);
    }
  });

  it('el borrador valida lo que sí se escribió', () => {
    expect(parsePostData('event', { mapUrl: 'javascript:1' }, false).success).toBe(false);
    expect(parsePostData('event', { venue: 'Aquí' }, false).success).toBe(true);
  });

  it('aplica los valores por defecto al publicar (texto vacío en el evento)', () => {
    const parsed = parsePostData(
      'event',
      { startsAt: '2027-01-01T10:00:00.000Z', venue: 'Aquí' },
      true,
    );
    expect(parsed.success && parsed.data).toMatchObject({ bodyHtml: '' });
  });

  it('el input valida los datos según la plantilla y el estado', () => {
    const base = { slug: 'a', title: 'T', template: 'text' as const, data: {} };
    expect(postInputSchema.safeParse({ ...base, status: 'draft' }).success).toBe(true);
    const published = postInputSchema.safeParse({ ...base, status: 'published' });
    expect(published.success).toBe(false);
    expect(!published.success && published.error.issues[0]?.path).toEqual(['data', 'bodyHtml']);
  });

  it('encuentra las imágenes en cualquier nivel de los datos', () => {
    const found = collectPostImages({
      image,
      images: [{ image, caption: 'x' }, { image }],
      otro: 'x',
    });
    expect(found).toHaveLength(3);
    expect(collectPostImages({ a: { b: [1, 'x', null] } })).toEqual([]);
  });
});
