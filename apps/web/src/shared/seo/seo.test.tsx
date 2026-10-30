import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK_ID, apiError, json, mockApi, renderAt } from '../../test/mockApi';
import {
  DEFAULT_DESCRIPTION,
  MAX_DESCRIPTION,
  absoluteUrl,
  describe as describeText,
} from './site';
import { usePageMeta, type PageMeta } from './usePageMeta';

afterEach(() => vi.unstubAllGlobals());

const metaContent = (selector: string) =>
  document.head.querySelector(selector)?.getAttribute('content') ?? null;

describe('describe (descripciones)', () => {
  it('quita etiquetas y espacios repetidos y usa la del sitio si no hay texto', () => {
    expect(describeText('<p>Hola   <b>mundo</b></p>')).toBe('Hola mundo');
    expect(describeText('   ')).toBe(DEFAULT_DESCRIPTION);
    expect(describeText(undefined)).toBe(DEFAULT_DESCRIPTION);
  });

  it('corta en una palabra y nunca pasa de 160 caracteres', () => {
    const long = 'palabra '.repeat(80);
    const cut = describeText(long);
    expect(cut.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(cut.endsWith('…')).toBe(true);
    expect(describeText('x'.repeat(400)).length).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });
});

describe('absoluteUrl (dirección canónica)', () => {
  it('sale de la dirección pública del sitio, sin consulta, sin ancla y sin barra final', () => {
    expect(absoluteUrl('/wiki')).toBe('https://universomemorias.com/wiki');
    expect(absoluteUrl('/wiki/?q=1#x')).toBe('https://universomemorias.com/wiki');
    expect(absoluteUrl('/')).toBe('https://universomemorias.com/');
  });
});

describe('usePageMeta', () => {
  function Page(props: PageMeta) {
    usePageMeta(props);
    return null;
  }
  const renderMeta = (props: PageMeta, path = '/wiki') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Page {...props} />
      </MemoryRouter>,
    );

  beforeEach(() => {
    document.title = 'Título original';
  });

  it('fija título, descripción, canónica, Open Graph y Twitter, y al salir deja todo como estaba', () => {
    const before = document.head.innerHTML;
    const { unmount } = renderMeta({
      title: 'Wiki',
      description: 'La wiki.',
      image: 'https://res.cloudinary.com/x/imagen.png',
    });
    expect(document.title).toBe('Wiki · Universo Memorias');
    expect(metaContent('meta[name="description"]')).toBe('La wiki.');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://universomemorias.com/wiki',
    );
    expect(metaContent('meta[property="og:title"]')).toBe('Wiki · Universo Memorias');
    expect(metaContent('meta[property="og:url"]')).toBe('https://universomemorias.com/wiki');
    expect(metaContent('meta[property="og:image"]')).toBe(
      'https://res.cloudinary.com/x/imagen.png',
    );
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(metaContent('meta[property="og:type"]')).toBe('website');
    unmount();
    expect(document.title).toBe('Título original');
    expect(document.head.innerHTML).toBe(before);
  });

  it('el título del propio sitio no lo repite, y sin imagen usa la del sitio', () => {
    renderMeta({ title: 'Universo Memorias' }, '/');
    expect(document.title).toBe('Universo Memorias');
    expect(metaContent('meta[property="og:image"]')).toBe(
      'https://universomemorias.com/og-default.png',
    );
  });

  it('noindex: pide no indexarse y no declara dirección canónica ni datos estructurados', () => {
    renderMeta({ title: 'Ingresar', noindex: true, jsonLd: { '@type': 'Thing' } }, '/ingresar');
    expect(metaContent('meta[name="robots"]')).toBe('noindex, nofollow');
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it('los datos estructurados no pueden cerrar la etiqueta aunque el texto lo intente', () => {
    const { unmount } = renderMeta({
      title: 'Libro',
      jsonLd: { '@type': 'Book', name: '</script><script>alert(1)</script>' },
    });
    const script = document.head.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).not.toContain('</script>');
    expect(JSON.parse(script?.textContent ?? '{}').name).toBe('</script><script>alert(1)</script>');
    unmount();
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});

describe('index.html trae la descripción del sitio', () => {
  it('es la misma que usa usePageMeta por omisión', () => {
    const file = ['index.html', 'apps/web/index.html']
      .map((path) => resolve(process.cwd(), path))
      .find((path) => {
        try {
          readFileSync(path);
          return true;
        } catch {
          return false;
        }
      });
    const html = readFileSync(file as string, 'utf8');
    const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1];
    expect(description).toBe(DEFAULT_DESCRIPTION);
  });
});

// ---- Auditoría de las rutas públicas ----
const NO_SESSION = { session: null } as const;
const cover = {
  provider: 'cloudinary',
  publicId: 'libro/c',
  deliveryType: 'upload',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/c.png',
  width: 600,
  height: 900,
  alt: 'Portada del libro',
};
const BOOK = {
  id: BOOK_ID,
  slug: 'libro-1',
  title: 'Libro de prueba',
  order: 1,
  status: 'published',
  cover,
};
const API = {
  'GET /api/site': () =>
    json({
      universe: { headline: 'Frase del universo', introHtml: '<p>Presentación</p>' },
      author: { name: 'Autora', bioHtml: '<p>Bio</p>', publicEmail: 'autora@ejemplo.com' },
      social: [],
      lockMessage: 'Sigue leyendo',
    }),
  'GET /api/books': () => json({ books: [BOOK] }),
  'GET /api/books/libro-1': () =>
    json({
      ...BOOK,
      tagline: 'Un lema',
      synopsis: '<p>La sinopsis del libro.</p>',
      genres: ['Aventura'],
      isbn: '978-0-00',
      purchaseLinks: [],
      wikiTabs: [],
      experiences: [],
    }),
  [`GET /api/wiki/sections?bookId=${BOOK_ID}`]: () =>
    json({
      bookId: BOOK_ID,
      sections: [{ kind: 'term', title: 'Glosario', locked: false }],
    }),
  [`GET /api/wiki/entries?bookId=${BOOK_ID}&kind=term`]: () => json({ entries: [] }),
  'GET /api/wiki/entries/000000000000000000000abc': () =>
    json({
      entry: {
        id: '000000000000000000000abc',
        kind: 'term',
        slug: 'memoria',
        name: 'Memoria',
        summary: 'Qué es una memoria.',
        fields: [],
      },
      related: [],
    }),
};

/** Rutas públicas que se indexan: cada una debe fijar un título único, descripción, canónica y un solo H1. */
const INDEXABLE = [
  { path: '/', title: 'Universo Memorias', h1: /./ },
  { path: '/wiki', title: 'Wiki: Glosario · Universo Memorias', h1: /Wiki del universo/ },
  { path: '/wiki/glosario', title: 'Wiki: Glosario · Universo Memorias', h1: /Wiki del universo/ },
  {
    path: '/wiki/entrada/000000000000000000000abc',
    title: 'Memoria · Universo Memorias',
    h1: /Memoria/,
  },
  { path: '/actualizaciones', title: 'Actualizaciones · Universo Memorias', h1: /Actualizaciones/ },
  { path: '/fan-arts', title: 'Fan arts · Universo Memorias', h1: /Fan arts/ },
  { path: '/contacto', title: 'Contacto · Universo Memorias', h1: /Contacto/ },
  { path: '/libros/libro-1', title: 'Libro de prueba · Universo Memorias', h1: /Libro de prueba/ },
  { path: '/privacidad', title: 'Política de privacidad · Universo Memorias', h1: /privacidad/ },
  { path: '/terminos', title: 'Términos de uso · Universo Memorias', h1: /Términos/ },
  { path: '/cookies', title: 'Política de cookies · Universo Memorias', h1: /cookies/ },
] as const;

const PRIVATE = ['/ingresar', '/registro', '/olvide-mi-contrasena', '/estado'] as const;

describe('rutas públicas: metadatos, un solo H1 y textos alternativos', () => {
  it.each(INDEXABLE)(
    '$path fija su título, descripción, canónica y un solo H1',
    async ({ path, title, h1 }) => {
      mockApi(API, NO_SESSION);
      renderAt(path);
      await waitFor(() => expect(document.title).toBe(title));
      await waitFor(() =>
        expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0),
      );
      const heading = screen.getAllByRole('heading', { level: 1 });
      expect(heading, `H1 de ${path}`).toHaveLength(1);
      expect(heading[0]?.textContent).toMatch(h1);

      const description = metaContent('meta[name="description"]') ?? '';
      expect(description.length).toBeGreaterThan(10);
      expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        `https://universomemorias.com${path === '/' ? '/' : path}`,
      );
      expect(metaContent('meta[property="og:title"]')).toBe(title);
      expect(metaContent('meta[name="robots"]')).not.toBe('noindex, nofollow');
      // Textos alternativos: toda imagen lleva `alt` (descriptivo, o vacío si es decorativa).
      for (const image of document.querySelectorAll('img')) {
        expect(
          image.hasAttribute('alt'),
          `<img src="${image.getAttribute('src')}"> sin alt en ${path}`,
        ).toBe(true);
      }
    },
  );

  it('los estados vacíos también tienen su único H1 (sin libros, la wiki sigue con su titular)', async () => {
    mockApi({ ...API, 'GET /api/books': () => json({ books: [] }) }, NO_SESSION);
    renderAt('/wiki');
    expect(await screen.findByText('Todavía no hay una wiki disponible.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('los títulos de las rutas distintas no se repiten', () => {
    const titles = INDEXABLE.filter((r) => r.path !== '/wiki/glosario').map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(PRIVATE)('%s pide no indexarse y no declara dirección canónica', async (path) => {
    mockApi(API, NO_SESSION);
    renderAt(path);
    await waitFor(() => expect(metaContent('meta[name="robots"]')).toBe('noindex, nofollow'));
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1));
  });

  it('una dirección que no existe: título «Página no encontrada» y noindex', async () => {
    mockApi(API, NO_SESSION);
    renderAt('/esto-no-existe');
    await waitFor(() => expect(document.title).toBe('Página no encontrada · Universo Memorias'));
    expect(metaContent('meta[name="robots"]')).toBe('noindex, nofollow');
  });

  it('un libro que no existe, una entrada bloqueada y una publicación inexistente no se indexan', async () => {
    mockApi(
      {
        ...API,
        'GET /api/books/no-existe': () => apiError('NOT_FOUND', 'No encontrado', 404),
        'GET /api/wiki/entries/000000000000000000000def': () =>
          apiError('NOT_UNLOCKED', 'Bloqueada', 403),
        'GET /api/posts/no-existe': () => apiError('NOT_FOUND', 'No encontrado', 404),
      },
      NO_SESSION,
    );
    for (const path of [
      '/libros/no-existe',
      '/wiki/entrada/000000000000000000000def',
      '/actualizaciones/no-existe',
    ]) {
      const { unmount } = renderAt(path);
      await waitFor(() => expect(metaContent('meta[name="robots"]')).toBe('noindex, nofollow'));
      expect(document.head.querySelector('link[rel="canonical"]'), path).toBeNull();
      unmount();
    }
  });

  it('el inicio declara la organización y el sitio, y el libro declara su ficha, sin inventar datos', async () => {
    mockApi(API, NO_SESSION);
    const home = renderAt('/');
    await waitFor(() =>
      expect(document.head.querySelector('script[type="application/ld+json"]')).not.toBeNull(),
    );
    const graph = JSON.parse(
      document.head.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    );
    expect(graph['@graph'].map((n: { '@type': string }) => n['@type']).sort()).toEqual([
      'Organization',
      'WebSite',
    ]);
    expect(JSON.stringify(graph)).not.toMatch(/aggregateRating|review/i);
    home.unmount();

    renderAt('/libros/libro-1');
    await waitFor(() => expect(document.title).toBe('Libro de prueba · Universo Memorias'));
    const book = JSON.parse(
      document.head.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    );
    expect(book).toMatchObject({
      '@type': 'Book',
      name: 'Libro de prueba',
      isbn: '978-0-00',
      url: 'https://universomemorias.com/libros/libro-1',
    });
    // Sin autor, sin calificaciones y sin fecha de publicación si el libro no tiene una real.
    expect(Object.keys(book)).not.toContain('author');
    expect(Object.keys(book)).not.toContain('aggregateRating');
    expect(Object.keys(book)).not.toContain('datePublished');
  });
});
