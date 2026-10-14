import { render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_COVER_SIZES, Plate } from './Plate';

// Se ejecuta desde `apps/web` o desde la raíz del monorepo.
const file = ['index.html', 'apps/web/index.html']
  .map((path) => resolve(process.cwd(), path))
  .find((path) => existsSync(path));
if (!file) throw new Error('No se encontró index.html');
const html = readFileSync(file, 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
if (!script) throw new Error('index.html ya no trae el script de pedidos tempranos');

const bookList = (cover: object | undefined) => ({
  books: [
    { id: 'a', slug: 'uno', title: 'Uno', order: 1, status: 'published', cover: undefined },
    { id: 'b', slug: 'dos', title: 'Dos', order: 2, status: 'published', cover },
    { id: 'c', slug: 'tres', title: 'Tres', order: 3, status: 'upcoming' },
  ],
});
const image = (
  width: number,
  height: number,
  url = 'https://res.cloudinary.com/demo/image/upload/libro/c',
) => ({
  url,
  alt: 'Portada',
  width,
  height,
});

function runScript(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const body = responses[url.replace('/api', '')];
    return new Response(JSON.stringify(body ?? {}), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  new Function(script as string)();
  return fetchMock;
}
const settle = () => new Promise((resolveNow) => setTimeout(resolveNow, 20));

beforeEach(() => {
  document.head.querySelectorAll('link[rel="preload"]').forEach((node) => node.remove());
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { __early?: unknown }).__early;
});

describe('pedidos tempranos de index.html', () => {
  it('pide /api/site y /api/books con credenciales y deja las respuestas para la app', () => {
    const fetchMock = runScript({ '/books': bookList(undefined) });
    expect(fetchMock).toHaveBeenCalledWith('/api/site', { credentials: 'include' });
    expect(fetchMock).toHaveBeenCalledWith('/api/books', { credentials: 'include' });
    const early = (window as unknown as { __early: Record<string, unknown> }).__early;
    expect(Object.keys(early).sort()).toEqual(['/books', '/site']);
  });

  it.each([
    ['apaisada', image(1280, 720), HERO_COVER_SIZES.landscape],
    ['de libro (2:3)', image(600, 900), HERO_COVER_SIZES.tall],
  ])(
    'la portada %s se pide con los mismos anchos y `sizes` que usa la placa',
    async (_name, cover, sizes) => {
      runScript({ '/books': bookList(cover) });
      await settle();
      const link = document.head.querySelector<HTMLLinkElement>('link[rel="preload"][as="image"]');
      expect(link).not.toBeNull();
      expect(link?.getAttribute('fetchpriority')).toBe('high');
      expect(link?.getAttribute('imagesizes')).toBe(sizes);

      const { container } = render(
        <Plate
          cover={cover}
          priority
          sizes={HERO_COVER_SIZES.tall}
          landscapeSizes={HERO_COVER_SIZES.landscape}
        />,
      );
      const img = container.querySelector('img');
      expect(img?.getAttribute('srcset')).toBe(link?.getAttribute('imagesrcset'));
      expect(img?.getAttribute('sizes')).toBe(sizes);
    },
  );

  it('no pide imagen si el libro destacado no tiene portada de Cloudinary', async () => {
    runScript({ '/books': bookList(undefined) });
    await settle();
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
    document.head.querySelectorAll('link').forEach((node) => node.remove());
    runScript({ '/books': bookList(image(600, 900, 'https://ejemplo.com/c.png')) });
    await settle();
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
  });
});
