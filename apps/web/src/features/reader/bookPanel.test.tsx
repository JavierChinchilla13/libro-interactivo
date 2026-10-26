import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK_ID, json, mockApi, renderAt } from '../../test/mockApi';
import { LOCKED_BOOK_TEXT } from './LibraryBookCard';

afterEach(() => vi.unstubAllGlobals());

// El cronómetro mira cuándo entra en pantalla; jsdom no trae `IntersectionObserver`.
class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const book = (over: Record<string, unknown> = {}) => ({
  id: BOOK_ID,
  slug: 'libro-1',
  title: '[PLACEHOLDER] Libro 1',
  tagline: '[PLACEHOLDER] Lema',
  order: 1,
  status: 'published',
  ...over,
});
const open = (progress: Record<string, unknown> = {}, field?: unknown) => ({
  book: book(),
  access: 'open',
  progress: { done: 1, total: 3, bookCompleted: false, ...progress },
  ...(field ? { field } : {}),
});
const exp = (over: Record<string, unknown>) => ({
  kind: 'quiz',
  id: '670000000000000000000020',
  title: '[PLACEHOLDER] Quiz 1',
  order: 1,
  status: 'available',
  inProgress: false,
  allowRetake: true,
  ...over,
});
const progress =
  (experiences: unknown[], bookCompleted = false) =>
  () =>
    json({ bookId: BOOK_ID, experiences, bookCompleted });
const world = (entry: unknown, extra: Record<string, unknown> = {}) =>
  mockApi({
    'GET /api/me/library': () => json({ books: [entry] }),
    [`GET /api/me/results?bookId=${BOOK_ID}`]: () => json({ results: [] }),
    ...extra,
  });

describe('página del libro en el panel', { timeout: 30_000 }, () => {
  it('abierta: cabecera con avance y siguiente paso, y el hilo con los estados en orden', async () => {
    world(
      open({
        nextExperience: { kind: 'quiz', id: 'b'.repeat(24), title: '[PLACEHOLDER] Quiz 2' },
      }),
      {
        [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([
          exp({
            id: 'a'.repeat(24),
            order: 1,
            title: '[PLACEHOLDER] Quiz 1',
            status: 'completed',
            allowRetake: false,
          }),
          exp({
            id: 'b'.repeat(24),
            order: 2,
            title: '[PLACEHOLDER] Quiz 2',
            status: 'available',
            inProgress: true,
          }),
          exp({
            id: 'c'.repeat(24),
            order: 3,
            title: '[PLACEHOLDER] Quiz 3',
            status: 'locked',
            lockedBy: { reason: 'order', waitingFor: '[PLACEHOLDER] Quiz 2' },
          }),
          exp({
            id: 'd'.repeat(24),
            kind: 'game',
            order: 4,
            title: '[PLACEHOLDER] Juego',
            status: 'locked',
            lockedBy: { reason: 'qr' },
          }),
        ]),
      },
    );
    renderAt('/panel/libros/libro-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Libro 1' }),
    ).toBeInTheDocument();
    // Las migas del marco del libro llevan de vuelta a «Tus libros».
    expect(
      within(screen.getByRole('navigation', { name: 'Migas' })).getByRole('link', {
        name: 'Tus libros',
      }),
    ).toHaveAttribute('href', '/panel');
    expect(screen.getByRole('link', { name: 'Seguir con [PLACEHOLDER] Quiz 2' })).toHaveAttribute(
      'href',
      `/panel/quiz/${'b'.repeat(24)}`,
    );
    expect(screen.getByRole('link', { name: 'Ver la ficha del libro' })).toHaveAttribute(
      'href',
      '/libros/libro-1',
    );
    const list = await screen.findByRole('list', { name: 'Experiencias del libro' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(within(cards[0]!).getByText('Completado')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Solo se juega una vez')).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('link', { name: /Continuar/ })).toBeInTheDocument();
    // Lo que sigue: silueta con el motivo del bloqueo, sin enlaces.
    expect(
      within(cards[2]!).getByText(/Primero completa «\[PLACEHOLDER\] Quiz 2»/),
    ).toBeInTheDocument();
    expect(within(cards[2]!).queryByRole('link')).not.toBeInTheDocument();
    expect(within(cards[3]!).getByText('Juego')).toBeInTheDocument();
    expect(within(cards[3]!).getByText(/Sigue avanzando en tu lectura/)).toBeInTheDocument();
  });

  it('«Tu campo» aparece en el quiz completado y en la lista de resultados del libro', async () => {
    const visual = { key: 'gradient', fieldName: 'Transformación' };
    world(open({ done: 1, total: 1 }, visual), {
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([
        exp({ id: 'a'.repeat(24), status: 'completed' }),
      ]),
      [`GET /api/me/results?bookId=${BOOK_ID}`]: () =>
        json({
          results: [
            {
              quizId: 'a'.repeat(24),
              title: '[PLACEHOLDER] Quiz 1',
              order: 1,
              attemptsCompleted: 1,
              completedAt: '2026-10-20T10:00:00.000Z',
              resultTitle: '[PLACEHOLDER] Resultado A',
              visual,
            },
          ],
        }),
    });
    renderAt('/panel/libros/libro-1');
    const results = await screen.findByRole('list', { name: 'Resultados de este libro' });
    expect(within(results).getByText('Transformación')).toBeInTheDocument();
    expect(within(results).getByRole('link')).toHaveAttribute(
      'href',
      `/panel/resultados/${'a'.repeat(24)}`,
    );
    const thread = screen.getByRole('list', { name: 'Experiencias del libro' });
    expect(await within(thread).findByText('Tu campo')).toBeInTheDocument();
    expect(within(thread).getByText('Transformación')).toBeInTheDocument();
  });

  it('sin resultados lo dice; los extras bloqueados son una silueta y, con el libro completo, se abren', async () => {
    world(open({ done: 0, total: 1 }), {
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([exp({ status: 'available' })]),
    });
    renderAt('/panel/libros/libro-1');
    expect(
      await screen.findByText('Cuando completes un quiz, tu resultado se queda aquí.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Se abren al completar todos los quizzes y el juego/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver los extras' })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
    cleanup();
    world(open({ done: 1, total: 1, bookCompleted: true }), {
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([exp({ status: 'completed' })], true),
    });
    renderAt('/panel/libros/libro-1');
    expect(await screen.findByText(/Completaste todo el libro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver los extras' })).toHaveAttribute(
      'href',
      '/panel/libros/libro-1/extras',
    );
  });

  it('un libro sin abrir solo muestra lo público y no pide su avance', async () => {
    const { called } = world({ book: book(), access: 'locked' });
    renderAt('/panel/libros/libro-1');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(LOCKED_BOOK_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Seguir con/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver la ficha del libro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Experiencias del libro' })).not.toBeInTheDocument();
    expect(called(`GET /api/me/progress?bookId=${BOOK_ID}`)).toHaveLength(0);
    expect(called(`GET /api/me/results?bookId=${BOOK_ID}`)).toHaveLength(0);
  });

  it('un libro «próximamente» muestra la cuenta atrás y nada más', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { called } = world({
      book: book({ status: 'upcoming', releaseDate: '2099-01-01' }),
      access: 'upcoming',
    });
    renderAt('/panel/libros/libro-1');
    expect(await screen.findByText(/Sale el 1 de enero de 2099/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Experiencias del libro' })).not.toBeInTheDocument();
    expect(called(`GET /api/me/progress?bookId=${BOOK_ID}`)).toHaveLength(0);
  });

  it('un libro que no existe (o que no se muestra) lleva a la página no encontrada', async () => {
    world(open());
    renderAt('/panel/libros/no-existe');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });
});
