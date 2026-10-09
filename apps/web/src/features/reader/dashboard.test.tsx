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

describe('panel del lector', () => {
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
    renderAt('/panel');
    expect(
      await screen.findByRole('heading', { name: 'Hola, Lectora Prueba' }),
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
    renderAt('/panel');
    expect(await screen.findByRole('link', { name: /Repetir/ })).toBeInTheDocument();
  });

  it('si no hay nada desbloqueado da la bienvenida corta y los extras figuran bloqueados', async () => {
    mockApi({
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([
        exp({ status: 'locked', lockedBy: { reason: 'qr' } }),
      ]),
    });
    renderAt('/panel');
    expect(await screen.findByText('Aún no tienes experiencias abiertas')).toBeInTheDocument();
    expect(screen.getByText(/busca las pistas del libro/)).toBeInTheDocument();
    expect(screen.getByText('Bloqueados')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver los extras' })).not.toBeInTheDocument();
  });

  it('con el libro completo los extras se abren desde el panel', async () => {
    mockApi({
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([exp({ status: 'completed' })], true),
    });
    renderAt('/panel');
    expect(await screen.findByText(/Completaste todo el libro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver los extras' })).toHaveAttribute(
      'href',
      '/panel/extras',
    );
  });

  it('un libro sin quizzes publicados lo dice, y sin libros publicados también', async () => {
    mockApi({ [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([]) });
    renderAt('/panel');
    expect(
      await screen.findByText('Este libro todavía no tiene quizzes publicados'),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
    mockApi({ 'GET /api/books': () => json({ books: [] }) });
    renderAt('/panel');
    expect(await screen.findAllByText('Todavía no hay libros disponibles')).not.toHaveLength(0);
  });

  it('con varios libros permite elegir cuál ver y recuerda la elección', async () => {
    const second = {
      ...{
        id: 'f'.repeat(24),
        slug: 'libro-2',
        title: '[PLACEHOLDER] Libro 2',
        order: 2,
        status: 'published',
      },
    };
    const { called } = mockApi({
      'GET /api/books': () =>
        json({
          books: [
            {
              id: BOOK_ID,
              slug: 'libro-1',
              title: '[PLACEHOLDER] Libro 1',
              order: 1,
              status: 'published',
            },
            second,
          ],
        }),
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress([exp({})]),
      [`GET /api/me/progress?bookId=${second.id}`]: progress([
        exp({ title: '[PLACEHOLDER] Quiz del libro 2' }),
      ]),
    });
    renderAt('/panel');
    const select = await screen.findByRole('combobox', { name: 'Libro' });
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.selectOptions(select, second.id);
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz del libro 2' }),
    ).toBeInTheDocument();
    expect(called(`GET /api/me/progress?bookId=${second.id}`)).toHaveLength(1);
    expect(localStorage.getItem('libro_selected_book')).toBe(second.id);
    localStorage.clear();
  });

  it('no muestra libros «próximamente» para jugar', async () => {
    mockApi({
      'GET /api/books': () =>
        json({
          books: [{ id: BOOK_ID, slug: 'libro-2', title: 'Próximo', order: 1, status: 'upcoming' }],
        }),
    });
    renderAt('/panel');
    expect(await screen.findAllByText('Todavía no hay libros disponibles')).not.toHaveLength(0);
  });
});
