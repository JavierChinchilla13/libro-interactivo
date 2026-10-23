import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Se ejecuta desde `apps/web` o desde la raíz del monorepo.
const file = ['index.html', 'apps/web/index.html']
  .map((path) => resolve(process.cwd(), path))
  .find((path) => existsSync(path));
if (!file) throw new Error('No se encontró index.html');
const html = readFileSync(file, 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
if (!script) throw new Error('index.html ya no trae el script de pedidos tempranos');

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { __early?: unknown }).__early;
});

describe('pedidos tempranos de index.html', () => {
  it('pide /api/site y /api/books con credenciales y deja las respuestas para la app', () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    new Function(script as string)();
    expect(fetchMock).toHaveBeenCalledWith('/api/site', { credentials: 'include' });
    expect(fetchMock).toHaveBeenCalledWith('/api/books', { credentials: 'include' });
    const early = (window as unknown as { __early: Record<string, unknown> }).__early;
    expect(Object.keys(early).sort()).toEqual(['/books', '/site']);
  });

  describe('panel de la lectora', () => {
    const cover = {
      url: 'https://res.cloudinary.com/x/image/upload/v1/c.jpg',
      width: 1280,
      height: 720,
    };
    const entry = (slug: string, access: string, extra: object = {}) => ({
      access,
      book: { slug, order: 1, cover },
      ...extra,
    });
    const run = async (path: string, books: unknown[]) => {
      window.history.pushState({}, '', path);
      const fetchMock = vi.fn(async (url: string) =>
        url === '/api/me/library'
          ? new Response(JSON.stringify({ books }), { status: 200 })
          : new Response('{}', { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      new Function(script as string)();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return fetchMock;
    };
    afterEach(() => {
      document.head.querySelectorAll('link[rel="preload"]').forEach((link) => link.remove());
      window.history.pushState({}, '', '/');
    });

    it('en /panel pide la sesión y «Tus libros» junto con el resto y precarga la portada grande', async () => {
      const fetchMock = await run('/panel', [entry('libro-1', 'open', { progress: {} })]);
      expect(fetchMock).toHaveBeenCalledWith('/api/me', { credentials: 'include' });
      expect(fetchMock).toHaveBeenCalledWith('/api/me/library', { credentials: 'include' });
      const link = document.head.querySelector('link[rel="preload"]');
      expect(link?.getAttribute('fetchpriority')).toBe('high');
      expect(link?.getAttribute('imagesizes')).toBe('(min-width: 768px) 520px, 92vw');
      expect(link?.getAttribute('imagesrcset')).toContain('w_640');
    });

    it('en /panel/libros/:slug precarga la portada de ese libro', async () => {
      await run('/panel/libros/libro-2', [entry('libro-1', 'open'), entry('libro-2', 'locked')]);
      expect(document.head.querySelector('link[rel="preload"]')).not.toBeNull();
    });

    it('con varias tarjetas pequeñas (ninguna abierta) no precarga nada, y fuera del panel no pide la biblioteca', async () => {
      await run('/panel', [entry('a', 'locked'), entry('b', 'upcoming')]);
      expect(document.head.querySelector('link[rel="preload"]')).toBeNull();
      const other = await run('/wiki', []);
      expect(other).not.toHaveBeenCalledWith('/api/me/library', expect.anything());
    });
  });
});
