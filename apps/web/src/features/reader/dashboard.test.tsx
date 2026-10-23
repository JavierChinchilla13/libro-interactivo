import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';
import { LOCKED_BOOK_TEXT } from './LibraryBookCard';

afterEach(() => vi.unstubAllGlobals());

// El cronómetro mira cuándo entra en pantalla; jsdom no trae `IntersectionObserver`.
class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const id = (n: number) => `6700000000000000000000${10 + n}`;
const book = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  slug: `libro-${n}`,
  title: `[PLACEHOLDER] Libro ${n}`,
  tagline: `[PLACEHOLDER] Lema ${n}`,
  order: n,
  status: 'published',
  ...over,
});
const open = (n: number, done: number, total: number, next = true) => ({
  book: book(n),
  access: 'open',
  progress: {
    done,
    total,
    bookCompleted: false,
    ...(next
      ? { nextExperience: { kind: 'quiz', id: 'b'.repeat(24), title: '[PLACEHOLDER] Quiz 2' } }
      : {}),
  },
});
const locked = (n: number) => ({ book: book(n), access: 'locked' });
const upcoming = (n: number, releaseDate?: string) => ({
  book: book(n, { status: 'upcoming', ...(releaseDate ? { releaseDate } : {}) }),
  access: 'upcoming',
});
const library = (books: unknown[]) => ({ 'GET /api/me/library': () => json({ books }) });
const site = {
  universe: {
    headline: '[PLACEHOLDER] ¿Qué es el universo?',
    introHtml: '<p>[PLACEHOLDER] Texto</p>',
  },
  author: { bioHtml: '' },
  social: [],
  lockMessage: 'x',
};

describe('entrada del panel del lector', { timeout: 30_000 }, () => {
  it('saluda, resume el avance y ofrece un solo botón principal: el siguiente paso', async () => {
    mockApi({ ...library([open(1, 1, 4)]), 'GET /api/site': () => json(site) });
    renderAt('/panel');
    expect(
      await screen.findByRole('heading', { name: 'Hola, Lectora Prueba' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 de 4 experiencias abiertas en tu libro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Seguir con [PLACEHOLDER] Quiz 2' })).toHaveAttribute(
      'href',
      `/panel/quiz/${'b'.repeat(24)}`,
    );
    const card = screen.getByRole('article', { name: '[PLACEHOLDER] Libro 1' });
    expect(card).toHaveAttribute('data-access', 'open');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(within(card).getByRole('link', { name: /Entrar al libro/ })).toHaveAttribute(
      'href',
      '/panel/libros/libro-1',
    );
  });

  it('un libro sin abrir sale bloqueado: candado, indicación del QR, sin enlaces ni avance', async () => {
    mockApi({ ...library([locked(1)]), 'GET /api/site': () => json(site) });
    renderAt('/panel');
    const card = await screen.findByRole('article', { name: '[PLACEHOLDER] Libro 1' });
    expect(card).toHaveAttribute('data-access', 'locked');
    expect(within(card).getByText(LOCKED_BOOK_TEXT)).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Seguir con/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('Escanea el QR de tu libro para abrir el primer quiz.'),
    ).toBeInTheDocument();
  });

  it('«próximamente» con fecha muestra la cuenta atrás; sin fecha, solo «Próximamente»', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    mockApi({
      ...library([upcoming(2, '2099-01-01'), upcoming(3)]),
      'GET /api/site': () => json(site),
    });
    renderAt('/panel');
    const withDate = await screen.findByRole('article', { name: '[PLACEHOLDER] Libro 2' });
    expect(withDate).toHaveAttribute('data-access', 'upcoming');
    expect(within(withDate).getByText(/Sale el 1 de enero de 2099/)).toBeInTheDocument();
    expect(within(withDate).getByRole('timer')).toBeInTheDocument();
    const without = screen.getByRole('article', { name: '[PLACEHOLDER] Libro 3' });
    expect(within(without).getAllByText('Próximamente').length).toBeGreaterThan(0);
    expect(within(without).queryByRole('timer')).not.toBeInTheDocument();
    expect(within(without).queryByRole('link')).not.toBeInTheDocument();
  });

  it('con varios libros: cuadrícula, primero lo que tiene un paso por hacer y luego bloqueado y próximamente', async () => {
    mockApi({
      ...library([upcoming(4), locked(2), open(3, 0, 3), open(1, 2, 2, false)]),
      'GET /api/site': () => json(site),
    });
    renderAt('/panel');
    const list = await screen.findByRole('list', { name: 'Tus libros' });
    const titles = within(list)
      .getAllByRole('article')
      .map((card) => card.getAttribute('aria-label'));
    expect(titles).toEqual([
      '[PLACEHOLDER] Libro 3',
      '[PLACEHOLDER] Libro 1',
      '[PLACEHOLDER] Libro 2',
      '[PLACEHOLDER] Libro 4',
    ]);
    expect(screen.getByText('2 de 5 experiencias abiertas en 2 libros')).toBeInTheDocument();
  });

  it('sin libros lo dice; si el servidor falla ofrece reintentar', async () => {
    mockApi({ ...library([]), 'GET /api/site': () => json(site) });
    renderAt('/panel');
    expect(await screen.findByText('Todavía no hay libros disponibles')).toBeInTheDocument();
    vi.unstubAllGlobals();
    cleanup();
    mockApi({
      'GET /api/me/library': () => json({ error: { code: 'INTERNAL', message: 'x' } }, 500),
      'GET /api/site': () => json(site),
    });
    renderAt('/panel');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('«qué es Universo Memorias» sale del texto del sitio y no se pinta si no hay texto', async () => {
    mockApi({ ...library([open(1, 0, 2)]), 'GET /api/site': () => json(site) });
    renderAt('/panel');
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] ¿Qué es el universo?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Texto')).toBeInTheDocument();
    vi.unstubAllGlobals();
    cleanup();
    mockApi({
      ...library([open(1, 0, 2)]),
      'GET /api/site': () => json({ ...site, universe: { introHtml: '' } }),
    });
    renderAt('/panel');
    await screen.findAllByRole('article');
    expect(screen.queryByText('El universo')).not.toBeInTheDocument();
  });

  it('los atajos llevan a resultados, wiki y extras', async () => {
    mockApi({ ...library([open(1, 0, 2)]), 'GET /api/site': () => json(site) });
    renderAt('/panel');
    const nav = await screen.findByRole('navigation', { name: 'Atajos' });
    expect(within(nav).getByRole('link', { name: /Mis resultados/ })).toHaveAttribute(
      'href',
      '/panel/resultados',
    );
    expect(within(nav).getByRole('link', { name: /Wiki/ })).toHaveAttribute('href', '/wiki');
    expect(within(nav).getByRole('link', { name: /Capítulos extra/ })).toHaveAttribute(
      'href',
      '/panel/extras',
    );
  });
});
