import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK, BOOK_ID, READER, json, mockApi, renderAt } from '../../test/mockApi';
import { pickBook, playable, wikiBooks } from '../reader/useBook';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const NO_SESSION = { session: null } as const;
const UPCOMING_ID = '670000000000000000000020';

const published = { ...BOOK, order: 1 };
const upcoming = {
  ...BOOK,
  id: UPCOMING_ID,
  slug: 'memorias-postergadas',
  title: '[PLACEHOLDER] Memorias Postergadas',
  order: 2,
  status: 'upcoming',
};
const termSections = (bookId: string) => ({
  bookId,
  sections: [{ kind: 'term', title: 'Glosario', locked: false }],
});
const term = (id: string, name: string) => ({
  locked: false,
  id: id.padStart(24, '0'),
  kind: 'term',
  slug: name.toLowerCase(),
  name,
  letter: name.charAt(0).toUpperCase(),
  order: 1,
});
const sectionsKey = (bookId: string) => `GET /api/wiki/sections?bookId=${bookId}`;
const termsKey = (bookId: string) => `GET /api/wiki/entries?bookId=${bookId}&kind=term`;
const wikiOf = (bookId: string, names: string[]) => ({
  [sectionsKey(bookId)]: () => json(termSections(bookId)),
  [termsKey(bookId)]: () => json({ entries: names.map((name, i) => term(String(i + 1), name)) }),
});
const books = (...list: object[]) => ({ 'GET /api/books': () => json({ books: list }) });

describe('qué libros usa cada parte', () => {
  const list = [published, upcoming] as never[];

  it('la wiki usa los publicados y los «próximamente»; el panel, los quizzes y el juego siguen solo con los publicados', () => {
    expect(wikiBooks(list).map((b) => b.status)).toEqual(['published', 'upcoming']);
    expect(playable(list).map((b) => b.status)).toEqual(['published']);
    // La elección por defecto del panel ignora un «próximamente» aunque sea el único o el elegido.
    expect(pickBook([upcoming] as never[], null, 'first')).toBeUndefined();
    expect(pickBook(list, UPCOMING_ID, 'first')?.id).toBe(BOOK_ID);
    expect(pickBook(list, null, 'featured')?.id).toBe(BOOK_ID);
  });
});

describe('wiki con un libro «próximamente»', () => {
  it('un visitante y un lector ven sus entradas, incluida una de toda la saga', async () => {
    for (const options of [NO_SESSION, { session: READER }]) {
      mockApi(
        { ...books(upcoming), ...wikiOf(UPCOMING_ID, ['Término del libro', 'Término de la saga']) },
        options,
      );
      const view = renderAt('/wiki');
      expect(await screen.findByText('Término de la saga')).toBeInTheDocument();
      expect(screen.getByText('Término del libro')).toBeInTheDocument();
      expect(screen.getByText('[PLACEHOLDER] Memorias Postergadas')).toBeInTheDocument();
      // Ya no hay aviso de «vista previa»: los «próximamente» son públicos.
      expect(screen.queryByText(/Vista previa/)).toBeNull();
      view.unmount();
      vi.unstubAllGlobals();
    }
  });

  it('con un solo libro no hay selector', async () => {
    mockApi({ ...books(upcoming), ...wikiOf(UPCOMING_ID, ['Uno']) }, NO_SESSION);
    renderAt('/wiki');
    await screen.findByText('Uno');
    expect(screen.queryByRole('group', { name: 'Libro de la wiki' })).toBeNull();
  });
});

describe('selector de libro de la wiki', () => {
  const two = {
    ...books(published, upcoming),
    ...wikiOf(BOOK_ID, ['Término del libro uno']),
    ...wikiOf(UPCOMING_ID, ['Término del libro dos']),
  };

  it('con dos o más libros aparece arriba de las pestañas, con el libro actual marcado', async () => {
    mockApi(two, NO_SESSION);
    renderAt('/wiki');
    const group = await screen.findByRole('group', { name: 'Libro de la wiki' });
    const buttons = group.querySelectorAll('button');
    expect([...buttons].map((b) => b.textContent)).toEqual([
      '[PLACEHOLDER] Libro 1',
      '[PLACEHOLDER] Memorias Postergadas',
    ]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    const tabs = screen.getByRole('tablist', { name: 'Secciones de la wiki' });
    expect(group.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await screen.findByText('Término del libro uno')).toBeInTheDocument();
  });

  it('elegir otro libro cambia lo mostrado, se recuerda y se puede hacer con el teclado', async () => {
    mockApi(two, NO_SESSION);
    renderAt('/wiki');
    await screen.findByText('Término del libro uno');
    const other = await screen.findByRole('button', { name: '[PLACEHOLDER] Memorias Postergadas' });
    other.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Término del libro dos')).toBeInTheDocument();
    expect(screen.queryByText('Término del libro uno')).toBeNull();
    expect(
      await screen.findByRole('button', { name: '[PLACEHOLDER] Memorias Postergadas' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('libro_selected_book')).toBe(UPCOMING_ID);
  });

  it('el libro elegido se recuerda al volver y la dirección puede traerlo (?libro=)', async () => {
    mockApi(two, NO_SESSION);
    localStorage.setItem('libro_selected_book', UPCOMING_ID);
    const first = renderAt('/wiki');
    expect(await screen.findByText('Término del libro dos')).toBeInTheDocument();
    first.unmount();
    vi.unstubAllGlobals();

    mockApi(two, NO_SESSION);
    renderAt('/wiki?libro=libro-1');
    expect(await screen.findByText('Término del libro uno')).toBeInTheDocument();
    // La dirección manda sobre lo recordado.
    expect(screen.queryByText('Término del libro dos')).toBeNull();
  });

  it('elegir un libro deja el parámetro en la dirección y las pestañas lo conservan', async () => {
    const full = {
      ...books(published, upcoming),
      [sectionsKey(BOOK_ID)]: () =>
        json({
          bookId: BOOK_ID,
          sections: [
            { kind: 'place', title: 'Lugares', locked: false },
            { kind: 'term', title: 'Glosario', locked: false },
          ],
        }),
      [`GET /api/wiki/entries?bookId=${BOOK_ID}&kind=place`]: () => json({ entries: [] }),
      ...wikiOf(UPCOMING_ID, ['Término del libro dos']),
      [termsKey(BOOK_ID)]: () => json({ entries: [] }),
    };
    mockApi(full, NO_SESSION);
    renderAt('/wiki');
    await userEvent.click(
      await screen.findByRole('button', { name: '[PLACEHOLDER] Memorias Postergadas' }),
    );
    await screen.findByText('Término del libro dos');
    // Al cambiar de libro, las pestañas son las de ese libro (aquí solo «Glosario»).
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(1));
  });
});

describe('mensajes vacíos', () => {
  it('sin ningún libro servido: «Todavía no hay una wiki disponible.»', async () => {
    mockApi(books(), NO_SESSION);
    renderAt('/wiki');
    expect(await screen.findByText('Todavía no hay una wiki disponible.')).toBeInTheDocument();
  });

  it('con libro pero sin entradas publicadas: «Todavía no hay entradas publicadas en la wiki.»', async () => {
    mockApi(
      {
        ...books(upcoming),
        [sectionsKey(UPCOMING_ID)]: () => json({ bookId: UPCOMING_ID, sections: [] }),
      },
      NO_SESSION,
    );
    renderAt('/wiki');
    expect(
      await screen.findByText('Todavía no hay entradas publicadas en la wiki.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay una wiki disponible.')).toBeNull();
  });
});
