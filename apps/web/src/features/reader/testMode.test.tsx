import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, BOOK_ID, READER, apiError, json, mockApi, renderAt } from '../../test/mockApi';
import { resetMessage } from './TestModeBanner';
import { pickBook, pickTeamBook, playable, teamBooks } from './useBook';

afterEach(() => vi.unstubAllGlobals());

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Marisol', role: 'ADMIN' };
const EDITOR = { ...READER, id: '670000000000000000000003', name: 'Editor', role: 'EDITOR' };
const DRAFT_ID = '670000000000000000000040';
const UPCOMING_ID = '670000000000000000000041';
const QUIZ = '670000000000000000000020';
const TEXT = 'Modo prueba: nada de esto cuenta para las estadísticas ni para los lectores.';
const UNPUBLISHED = 'Este libro aún no está publicado: los lectores no lo ven.';

// El cronómetro mira cuándo entra en pantalla; jsdom no trae `IntersectionObserver`.
class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const book = (over: Record<string, unknown> = {}) => ({
  ...BOOK,
  tagline: '[PLACEHOLDER] Lema',
  ...over,
});
/** Un libro abierto en la biblioteca; `unpublished` es lo que decide el servidor para el equipo. */
const entry = (
  slug: string,
  id: string,
  order: number,
  unpublished?: 'draft' | 'upcoming',
  status: 'published' | 'upcoming' = 'published',
) => ({
  // Un borrador llega a la web con status «upcoming» (el tipo solo admite dos estados).
  book: book({ slug, id, order, title: `[PLACEHOLDER] ${slug}`, status }),
  access: 'open',
  ...(unpublished ? { unpublished } : {}),
  progress: { done: 0, total: 1, bookCompleted: false },
});
const library = (...entries: unknown[]) => ({
  'GET /api/me/library': () => json({ books: entries }),
});
const progress = (bookId: string) => ({
  [`GET /api/me/progress?bookId=${bookId}`]: () =>
    json({
      bookId,
      bookCompleted: false,
      experiences: [
        {
          kind: 'quiz',
          id: QUIZ,
          title: '[PLACEHOLDER] Quiz 1',
          order: 1,
          status: 'available',
          inProgress: false,
          allowRetake: true,
        },
      ],
    }),
  [`GET /api/me/results?bookId=${bookId}`]: () => json({ results: [] }),
});

describe('la franja «Modo prueba» solo es del equipo', () => {
  it('el administrador y el editor la ven en el panel, con role="status" y el texto completo', async () => {
    for (const session of [ADMIN, EDITOR]) {
      mockApi(library(entry('libro-1', BOOK_ID, 1)), { session });
      const view = renderAt('/panel');
      const banner = await screen.findByTestId('test-mode-banner');
      expect(banner).toHaveAttribute('role', 'status');
      expect(banner).toHaveTextContent(TEXT);
      // No depende solo del color: lleva texto y la etiqueta «Prueba».
      expect(banner).toHaveTextContent('Prueba');
      view.unmount();
      vi.unstubAllGlobals();
    }
  });

  it('un lector no la ve (ni nada de modo prueba) y un visitante no entra al panel', async () => {
    mockApi(library(entry('libro-1', BOOK_ID, 1)), { session: READER });
    renderAt('/panel');
    await screen.findByRole('navigation', { name: 'Panel' });
    expect(screen.queryByTestId('test-mode-banner')).toBeNull();
    expect(screen.queryByText(/Modo prueba/)).toBeNull();
  });

  it('«Volver a administración» lleva a /admin', async () => {
    mockApi(library(entry('libro-1', BOOK_ID, 1)), { session: ADMIN });
    renderAt('/panel');
    const link = await screen.findByRole('link', { name: 'Volver a administración' });
    expect(link).toHaveAttribute('href', '/admin');
  });
});

describe('«este libro aún no está publicado» sale de `unpublished`, no del status', () => {
  it.each(['draft', 'upcoming'] as const)(
    'un libro %s (con status «upcoming» en la web) lo dice en su panel',
    async (kind) => {
      vi.stubGlobal('IntersectionObserver', FakeObserver);
      mockApi(
        {
          ...library(entry('libro-sin-publicar', DRAFT_ID, 3, kind, 'upcoming')),
          ...progress(DRAFT_ID),
        },
        { session: ADMIN },
      );
      renderAt('/panel/libros/libro-sin-publicar');
      const banner = await screen.findByTestId('test-mode-banner');
      await waitFor(() => expect(banner).toHaveTextContent(UNPUBLISHED));
      expect(banner).toHaveTextContent(TEXT);
      // El libro se rotula como sin publicar en su cabecera.
      expect(
        await screen.findByText(
          kind === 'draft' ? 'Borrador · modo prueba' : 'Próximamente · modo prueba',
        ),
      ).toBeInTheDocument();
    },
  );

  it('un libro publicado no lleva la frase; tampoco si solo su status es «upcoming» pero la biblioteca no lo marca', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    mockApi(
      {
        ...library(
          entry('libro-1', BOOK_ID, 1),
          entry('libro-raro', UPCOMING_ID, 2, undefined, 'upcoming'),
        ),
        ...progress(BOOK_ID),
        ...progress(UPCOMING_ID),
      },
      { session: ADMIN },
    );
    const first = renderAt('/panel/libros/libro-1');
    const banner = await screen.findByTestId('test-mode-banner');
    await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] libro-1' });
    expect(banner).not.toHaveTextContent(UNPUBLISHED);
    first.unmount();
    renderAt('/panel/libros/libro-raro');
    await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] libro-raro' });
    expect(screen.getByTestId('test-mode-banner')).not.toHaveTextContent(UNPUBLISHED);
  });

  it('en un quiz y en el juego la franja sigue ahí y dice si el libro es un borrador', async () => {
    mockApi(
      {
        ...library(entry('libro-sin-publicar', DRAFT_ID, 3, 'draft', 'upcoming')),
        [`GET /api/quizzes/${QUIZ}`]: () =>
          json({
            id: QUIZ,
            bookId: DRAFT_ID,
            title: '[PLACEHOLDER] Quiz 1',
            instructionsHtml: '<p>[PLACEHOLDER]</p>',
            allowRetake: false,
            status: 'available',
            completedCount: 0,
            canStart: true,
          }),
        [`GET /api/me/progress?bookId=${DRAFT_ID}`]:
          progress(DRAFT_ID)[`GET /api/me/progress?bookId=${DRAFT_ID}`]!,
      },
      { session: ADMIN },
    );
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 1' });
    await waitFor(() =>
      expect(screen.getByTestId('test-mode-banner')).toHaveTextContent(UNPUBLISHED),
    );
  });
});

describe('«Reiniciar mi progreso de prueba»', () => {
  const setup = (handler: () => Response) =>
    mockApi(
      { ...library(entry('libro-1', BOOK_ID, 1)), 'DELETE /api/me/test-progress': handler },
      { session: ADMIN },
    );
  const open = async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reiniciar mi progreso de prueba' }),
    );
    return screen.getByRole('group', { name: 'Confirmar el reinicio' });
  };

  it('pide confirmación (con foco en «Cancelar»), no borra nada si se cancela y Escape también cancela', async () => {
    const { called } = setup(() => json({ quizAttempts: 1, gameSessions: 0 }));
    renderAt('/panel');
    const group = await open();
    expect(group).toHaveTextContent('Se borrarán tus intentos y partidas de prueba.');
    expect(group).toHaveTextContent('No afecta a ningún lector ni a tu cuenta.');
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Cancelar' })).toHaveFocus(),
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Cancelar' }));
    expect(called('DELETE /api/me/test-progress')).toHaveLength(0);
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Confirmar el reinicio' })).toBeNull();
    expect(called('DELETE /api/me/test-progress')).toHaveLength(0);
  });

  it('al confirmar borra y muestra el mensaje de éxito con los conteos', async () => {
    const { called } = setup(() => json({ quizAttempts: 2, gameSessions: 1 }));
    renderAt('/panel');
    const group = await open();
    await userEvent.click(within(group).getByRole('button', { name: 'Sí, reiniciar' }));
    expect(
      await screen.findByText(
        'Listo: se borraron 2 intentos de quiz y 1 partida de juego de prueba. Tu recorrido empieza desde cero.',
      ),
    ).toBeInTheDocument();
    expect(called('DELETE /api/me/test-progress')).toHaveLength(1);
    // La confirmación se cierra y el botón vuelve.
    expect(
      screen.getByRole('button', { name: 'Reiniciar mi progreso de prueba' }),
    ).toBeInTheDocument();
  });

  it('sin nada que borrar lo dice; con un error lo muestra y no da por hecho el reinicio', async () => {
    setup(() => json({ quizAttempts: 0, gameSessions: 0 }));
    const first = renderAt('/panel');
    await userEvent.click(within(await open()).getByRole('button', { name: 'Sí, reiniciar' }));
    expect(
      await screen.findByText('No había pruebas que borrar: tu recorrido ya está desde cero.'),
    ).toBeInTheDocument();
    first.unmount();
    vi.unstubAllGlobals();

    setup(() => apiError('INTERNAL', 'Falló', 500));
    renderAt('/panel');
    await userEvent.click(within(await open()).getByRole('button', { name: 'Sí, reiniciar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos reiniciar tu progreso de prueba',
    );
    expect(screen.queryByText(/Listo: se borraron/)).toBeNull();
  });

  it('el mensaje concuerda en número', () => {
    expect(resetMessage({ quizAttempts: 1, gameSessions: 1 })).toContain(
      '1 intento de quiz y 1 partida de juego',
    );
    expect(resetMessage({ quizAttempts: 3, gameSessions: 2 })).toContain(
      '3 intentos de quiz y 2 partidas de juego',
    );
  });
});

describe('qué libros usa el equipo (sin tocar playable)', () => {
  const entries = [
    entry('libro-1', BOOK_ID, 1),
    entry('libro-borrador', DRAFT_ID, 3, 'draft', 'upcoming'),
    entry('libro-proximo', UPCOMING_ID, 2, 'upcoming', 'upcoming'),
  ] as never[];

  it('teamBooks toma lo que la biblioteca entrega abierto, sin filtrar por status', () => {
    expect(teamBooks(entries).map((b) => b.slug)).toEqual([
      'libro-1',
      'libro-borrador',
      'libro-proximo',
    ]);
    // Lo cerrado o «próximamente» sin abrir (un lector) no entra.
    expect(teamBooks([{ ...entry('x', 'a'.repeat(24), 1), access: 'locked' }] as never[])).toEqual(
      [],
    );
  });

  it('por defecto el equipo ve un libro publicado antes que uno sin publicar, y respeta el elegido', () => {
    expect(pickTeamBook(entries, null)?.slug).toBe('libro-1');
    expect(pickTeamBook(entries, DRAFT_ID)?.slug).toBe('libro-borrador');
    const onlyDraft = [entries[1]] as never[];
    expect(pickTeamBook(onlyDraft, null)?.slug).toBe('libro-borrador');
  });

  it('playable() y pickBook() siguen ignorando los «próximamente» (panel, quizzes y juego de los lectores)', () => {
    const books = entries.map((e) => (e as { book: never }).book);
    expect(playable(books).map((b) => (b as { slug: string }).slug)).toEqual(['libro-1']);
    expect(pickBook(books, DRAFT_ID, 'first')?.slug).toBe('libro-1');
  });
});

describe('el panel del equipo trabaja con libros sin publicar', () => {
  it('«Extras» de un libro en borrador abre su página (con la biblioteca como fuente) y no «no encontrado»', async () => {
    mockApi(
      {
        ...library(entry('libro-sin-publicar', DRAFT_ID, 3, 'draft', 'upcoming')),
        [`GET /api/extras?bookId=${DRAFT_ID}`]: () => json({ locked: false, extras: [] }),
        [`GET /api/me/progress?bookId=${DRAFT_ID}`]: () =>
          json({ bookId: DRAFT_ID, experiences: [], bookCompleted: false }),
      },
      { session: ADMIN },
    );
    renderAt('/panel/libros/libro-sin-publicar/extras');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Capítulos extra' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No encontramos/)).toBeNull();
  });

  it('un lector con el mismo libro «próximamente» no puede entrar a su página de extras (usa la lista pública)', async () => {
    mockApi(
      {
        'GET /api/me/library': () =>
          json({
            books: [
              {
                book: book({ slug: 'libro-sin-publicar', id: DRAFT_ID, status: 'upcoming' }),
                access: 'upcoming',
              },
            ],
          }),
        'GET /api/books': () =>
          json({ books: [book({ slug: 'libro-sin-publicar', id: DRAFT_ID, status: 'upcoming' })] }),
      },
      { session: READER },
    );
    renderAt('/panel/libros/libro-sin-publicar/extras');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 1, name: 'Capítulos extra' })).toBeNull(),
    );
  });
});
