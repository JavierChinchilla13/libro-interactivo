import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK_ID, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

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

describe('página del libro en el panel', () => {
  it('saluda, muestra el avance y las tarjetas en orden con su estado', async () => {
    mockApi({
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
          order: 4,
          title: '[PLACEHOLDER] Quiz 4',
          status: 'locked',
          lockedBy: { reason: 'qr' },
        }),
      ]),
    });
    renderAt('/panel/libros/libro-1');
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Libro 1' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Progreso: 1 de 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance en el libro' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );

    const cards = within(screen.getByRole('list', { name: 'Experiencias del libro' })).getAllByRole(
      'listitem',
    );
    expect(cards).toHaveLength(4);
    // Completado de una sola vez: ver resultado, sin «Repetir».
    expect(within(cards[0]!).getByText('Completado')).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('link', { name: /Ver mi resultado/ })).toHaveAttribute(
      'href',
      `/panel/resultados/${'a'.repeat(24)}`,
    );
    expect(within(cards[0]!).getByText('Solo se juega una vez')).toBeInTheDocument();
    expect(within(cards[0]!).queryByRole('link', { name: /Repetir/ })).not.toBeInTheDocument();
    // Disponible con un intento a medias: «Continuar».
    expect(within(cards[1]!).getByRole('link', { name: /Continuar/ })).toHaveAttribute(
      'href',
      `/panel/quiz/${'b'.repeat(24)}`,
    );
    // Bloqueos: por orden (nombra el que falta) y por QR (mensaje de la autora), sin enlaces.
    expect(
      within(cards[2]!).getByText(/Primero completa «\[PLACEHOLDER\] Quiz 2»/),
    ).toBeInTheDocument();
    expect(within(cards[3]!).getByText(/Sigue avanzando en tu lectura/)).toBeInTheDocument();
    expect(within(cards[2]!).queryByRole('link')).not.toBeInTheDocument();
    expect(within(cards[3]!).queryByRole('link')).not.toBeInTheDocument();
  });

  it('un quiz completado que se puede repetir ofrece «Repetir»', async () => {
    mockApi({
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([
        exp({ status: 'completed', allowRetake: true }),
      ]),
    });
    renderAt('/panel/libros/libro-1');
    expect(await screen.findByRole('link', { name: /Repetir/ })).toBeInTheDocument();
  });

  it('si no hay nada desbloqueado da la bienvenida corta y los extras figuran bloqueados', async () => {
    mockApi({
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([
        exp({ status: 'locked', lockedBy: { reason: 'qr' } }),
      ]),
    });
    renderAt('/panel/libros/libro-1');
    expect(await screen.findByText('Aún no tienes experiencias abiertas')).toBeInTheDocument();
    expect(screen.getByText(/busca las pistas del libro/)).toBeInTheDocument();
    expect(screen.getByText('Bloqueados')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver los extras' })).not.toBeInTheDocument();
  });

  it('con el libro completo los extras se abren desde el panel', async () => {
    mockApi({
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([exp({ status: 'completed' })], true),
    });
    renderAt('/panel/libros/libro-1');
    expect(await screen.findByText(/Completaste todo el libro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver los extras' })).toHaveAttribute(
      'href',
      '/panel/extras',
    );
  });

  it('un libro sin quizzes publicados lo dice', async () => {
    mockApi({ [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([]) });
    renderAt('/panel/libros/libro-1');
    expect(
      await screen.findByText('Este libro todavía no tiene quizzes publicados'),
    ).toBeInTheDocument();
  });

  it('un libro que no existe (o que aún no está publicado) muestra la página no encontrada', async () => {
    mockApi({});
    renderAt('/panel/libros/no-existe');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });
});
