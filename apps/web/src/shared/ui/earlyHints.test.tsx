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
});
