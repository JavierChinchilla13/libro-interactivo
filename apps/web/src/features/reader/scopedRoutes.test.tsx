import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sectionOf } from '../../app/layouts/PanelLayout';
import { BOOK_ID, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const book = (n: number) => ({
  id: n === 1 ? BOOK_ID : `67000000000000000000002${n}`,
  slug: `libro-${n}`,
  title: `[PLACEHOLDER] Libro ${n}`,
  order: n,
  status: 'published',
});
const entry = (n: number, access: string) => ({
  book: book(n),
  access,
  ...(access === 'open' ? { progress: { done: 0, total: 1, bookCompleted: false } } : {}),
});
const world = (entries: unknown[]) =>
  mockApi({
    'GET /api/me/library': () => json({ books: entries }),
    'GET /api/books': () =>
      json({
        books: (entries as { book: unknown }[]).map((e) => e.book),
      }),
    [`GET /api/me/results?bookId=${BOOK_ID}`]: () => json({ results: [] }),
    [`GET /api/extras?bookId=${BOOK_ID}`]: () => json({ locked: true }),
    [`GET /api/me/progress?bookId=${BOOK_ID}`]: () =>
      json({ bookId: BOOK_ID, experiences: [], bookCompleted: false }),
  });

describe('resultados y extras dentro de cada libro', { timeout: 30_000 }, () => {
  it('/panel/resultados lleva a los resultados del primer libro abierto y marca la pestaña', async () => {
    world([entry(2, 'locked'), entry(1, 'open')]);
    renderAt('/panel/resultados');
    expect(await screen.findByRole('heading', { name: 'Mis resultados' })).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Libro 1')).toBeInTheDocument();
    const [tabs] = screen.getAllByRole('navigation', { name: 'Panel' });
    expect(within(tabs!).getByRole('link', { name: 'Resultados' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs!).getByRole('link', { name: 'Panel' })).not.toHaveAttribute('aria-current');
  });

  it('/panel/extras lleva a los extras del libro que la lectora abrió por última vez', async () => {
    localStorage.setItem('libro_selected_book', BOOK_ID);
    world([entry(1, 'open'), entry(3, 'open')]);
    renderAt('/panel/extras');
    expect(await screen.findByRole('heading', { name: 'Capítulos extra' })).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Libro 1')).toBeInTheDocument();
    const [tabs] = screen.getAllByRole('navigation', { name: 'Panel' });
    expect(within(tabs!).getByRole('link', { name: 'Extras' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sin libros abiertos, las direcciones antiguas llevan a la entrada del panel', async () => {
    world([entry(1, 'locked')]);
    renderAt('/panel/resultados');
    expect(await screen.findByRole('heading', { name: /^Hola, / })).toBeInTheDocument();
  });

  it('un libro que no existe en la dirección da «no encontrada»', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel/libros/no-existe/resultados');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });

  it('la página del libro cuenta como «Panel» para la pestaña activa', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel/libros/libro-1');
    await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Libro 1' });
    const [tabs] = screen.getAllByRole('navigation', { name: 'Panel' });
    expect(within(tabs!).getByRole('link', { name: 'Panel' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('sectionOf', () => {
  it.each([
    ['/panel', 'panel'],
    ['/panel/', 'panel'],
    ['/panel/libros/libro-1', 'panel'],
    ['/panel/resultados', 'resultados'],
    ['/panel/resultados/abc', 'resultados'],
    ['/panel/libros/libro-1/resultados', 'resultados'],
    ['/panel/extras', 'extras'],
    ['/panel/extras/abc', 'extras'],
    ['/panel/libros/libro-1/extras', 'extras'],
    ['/panel/cuenta', 'cuenta'],
    ['/panel/quiz/abc', null],
  ])('%s → %s', (path, expected) => {
    expect(sectionOf(path)).toBe(expected);
  });
});
