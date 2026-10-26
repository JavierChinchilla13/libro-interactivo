import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    [`GET /api/extras?bookId=${BOOK_ID}`]: () => json({ locked: true, hasExtras: true }),
    [`GET /api/me/progress?bookId=${BOOK_ID}`]: () =>
      json({ bookId: BOOK_ID, experiences: [], bookCompleted: false }),
  });

const progressFor = (id: string) => ({
  [`GET /api/me/progress?bookId=${id}`]: () =>
    json({ bookId: id, experiences: [], bookCompleted: false }),
});
const bookTabs = () => screen.getByRole('navigation', { name: /^Secciones de / });
const generalTabs = () => screen.getAllByRole('navigation', { name: 'Panel' })[0]!;

describe('resultados y extras dentro de cada libro', { timeout: 30_000 }, () => {
  it('con un solo libro abierto, /panel/resultados va directo a sus resultados con el título del libro', async () => {
    world([entry(2, 'locked'), entry(1, 'open')]);
    renderAt('/panel/resultados');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Tus resultados',
      }),
    ).toBeInTheDocument();
    expect(within(bookTabs()).getByRole('link', { name: 'Resultados' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('con un solo libro abierto, /panel/extras va directo a sus extras con el título del libro', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel/extras');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Capítulos extra',
      }),
    ).toBeInTheDocument();
    expect(within(bookTabs()).getByRole('link', { name: 'Extras' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('con varios libros abiertos, /panel/resultados y /panel/extras son puntos de acceso que listan los libros', async () => {
    world([entry(1, 'open'), entry(3, 'open'), entry(2, 'locked')]);
    const first = renderAt('/panel/resultados');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Resultados' }),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Tus libros' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/panel/libros/libro-1/resultados',
      '/panel/libros/libro-3/resultados',
    ]);
    expect(screen.getByText(/todavía no abriste no tienen resultados/)).toBeInTheDocument();
    // El libro sin abrir no se ofrece.
    expect(within(list).queryByText('[PLACEHOLDER] Libro 2')).toBeNull();
    first.unmount();
    vi.unstubAllGlobals();
    world([entry(1, 'open'), entry(3, 'open')]);
    renderAt('/panel/extras');
    expect(await screen.findByRole('heading', { level: 1, name: 'Extras' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Tus libros' }))
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/panel/libros/libro-1/extras', '/panel/libros/libro-3/extras']);
  });

  it('sin libros abiertos, los puntos de acceso llevan a la entrada del panel', async () => {
    world([entry(1, 'locked')]);
    renderAt('/panel/resultados');
    expect(await screen.findByRole('heading', { name: /^Hola, / })).toBeInTheDocument();
  });

  it('un libro que no existe en la dirección da «no encontrada»', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel/libros/no-existe/resultados');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });
});

describe('marco del libro: migas, subnavegador y barra', { timeout: 30_000 }, () => {
  it('el resumen lleva migas «Tus libros › libro», el subnavegador con Resumen marcado y arriba solo «‹ Tus libros»', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel/libros/libro-1');
    await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Libro 1' });
    const crumbs = screen.getByRole('navigation', { name: 'Migas' });
    expect(within(crumbs).getByRole('link', { name: 'Tus libros' })).toHaveAttribute(
      'href',
      '/panel',
    );
    expect(within(crumbs).getByText('[PLACEHOLDER] Libro 1')).toHaveAttribute(
      'aria-current',
      'page',
    );
    const tabs = within(bookTabs()).getAllByRole('link');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Resumen', 'Resultados', 'Extras']);
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual([
      '/panel/libros/libro-1',
      '/panel/libros/libro-1/resultados',
      '/panel/libros/libro-1/extras',
    ]);
    expect(within(bookTabs()).getByRole('link', { name: 'Resumen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Arriba: sin «Resultados» ni «Extras» generales, solo volver a «Tus libros».
    expect(
      within(generalTabs())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['‹ Tus libros']);
    // Abajo (celular): volver + las tres secciones del libro.
    const bottom = screen.getByRole('navigation', { name: 'Panel (móvil)' });
    expect(
      within(bottom)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['‹ Tus libros', 'Resumen', 'Resultados', 'Extras']);
    expect(within(bottom).getByRole('link', { name: 'Resumen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('fuera de un libro la barra es la general: Tus libros, Resultados y Extras', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel');
    await screen.findByRole('heading', { name: /^Hola, / });
    expect(
      within(generalTabs())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tus libros', 'Resultados', 'Extras']);
    const bottom = screen.getByRole('navigation', { name: 'Panel (móvil)' });
    expect(
      within(bottom)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tus libros', 'Resultados', 'Extras']);
  });

  it('en Resultados hay cabecera compacta con el título del libro, migas con la sección y la sección marcada', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel/libros/libro-1/resultados');
    await screen.findByRole('heading', { level: 1, name: 'Tus resultados' });
    const crumbs = screen.getByRole('navigation', { name: 'Migas' });
    expect(within(crumbs).getByRole('link', { name: '[PLACEHOLDER] Libro 1' })).toHaveAttribute(
      'href',
      '/panel/libros/libro-1',
    );
    expect(within(crumbs).getByText('Resultados')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('0 de 1 experiencias abiertas')).toBeInTheDocument();
    const bottom = screen.getByRole('navigation', { name: 'Panel (móvil)' });
    expect(within(bottom).getByRole('link', { name: 'Resultados' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('con varios libros abiertos se puede cambiar de libro sin pasar por el panel y conserva la sección', async () => {
    mockApi({
      'GET /api/me/library': () => json({ books: [entry(1, 'open'), entry(3, 'open')] }),
      'GET /api/books': () => json({ books: [book(1), book(3)] }),
      [`GET /api/me/results?bookId=${BOOK_ID}`]: () => json({ results: [] }),
      [`GET /api/me/results?bookId=${book(3).id}`]: () => json({ results: [] }),
      ...progressFor(BOOK_ID),
      ...progressFor(book(3).id),
    });
    renderAt('/panel/libros/libro-1/resultados');
    await screen.findByRole('heading', {
      level: 1,
      name: 'Tus resultados',
    });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Cambiar de libro' }),
      'libro-3',
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Tus resultados',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('[PLACEHOLDER] Libro 3', { selector: 'p' })[0]).toBeInTheDocument();
  });

  it('con un solo libro abierto no ofrece cambiar de libro', async () => {
    world([entry(1, 'open')]);
    renderAt('/panel/libros/libro-1/resultados');
    await screen.findByRole('heading', { level: 1, name: 'Tus resultados' });
    expect(screen.queryByRole('combobox', { name: 'Cambiar de libro' })).toBeNull();
  });

  it('un libro sin abrir solo tiene su resumen: sin subnavegador y sus subrutas vuelven al resumen', async () => {
    world([entry(1, 'locked')]);
    renderAt('/panel/libros/libro-1/extras');
    await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Libro 1' });
    expect(screen.queryByRole('navigation', { name: /^Secciones de / })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Migas' })).toBeInTheDocument();
  });

  it('un título de libro larguísimo se recorta en las migas y la cabecera sin romper nada', async () => {
    const long = 'El archivo de las memorias que el mar devolvió una madrugada sin nombre ni dueño '
      .repeat(3)
      .trim();
    mockApi({
      'GET /api/me/library': () =>
        json({ books: [{ ...entry(1, 'open'), book: { ...book(1), title: long } }] }),
      'GET /api/books': () => json({ books: [{ ...book(1), title: long }] }),
      [`GET /api/me/results?bookId=${BOOK_ID}`]: () => json({ results: [] }),
    });
    renderAt('/panel/libros/libro-1/resultados');
    await screen.findByRole('heading', { level: 1, name: 'Tus resultados' });
    const crumbLink = within(screen.getByRole('navigation', { name: 'Migas' })).getByRole('link', {
      name: long,
    });
    expect(crumbLink).toHaveAttribute('title', long);
    expect(crumbLink).toHaveClass('truncate');
    expect(screen.getAllByText(long, { selector: 'p' })[0]).toHaveClass('line-clamp-2');
  });
});

describe('ajustes del marco del libro', { timeout: 30_000 }, () => {
  it('con un libro sin abrir la barra de abajo solo ofrece «‹ Tus libros» y «Resumen»', async () => {
    world([entry(1, 'locked')]);
    renderAt('/panel/libros/libro-1');
    await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Libro 1' });
    const bottom = screen.getByRole('navigation', { name: 'Panel (móvil)' });
    await waitFor(() =>
      expect(
        within(bottom)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['‹ Tus libros', 'Resumen']),
    );
  });

  it('un libro sin quizzes dice «Aún sin experiencias» y no «0 de 0»', async () => {
    mockApi({
      'GET /api/me/library': () =>
        json({
          books: [{ ...entry(1, 'open'), progress: { done: 0, total: 0, bookCompleted: false } }],
        }),
      'GET /api/books': () => json({ books: [book(1)] }),
      [`GET /api/me/results?bookId=${BOOK_ID}`]: () => json({ results: [] }),
      ...progressFor(BOOK_ID),
    });
    renderAt('/panel/libros/libro-1/resultados');
    await screen.findByRole('heading', { level: 1, name: 'Tus resultados' });
    expect(screen.getByText('Aún sin experiencias')).toBeInTheDocument();
    expect(screen.queryByText(/0 de 0/)).toBeNull();
  });

  it('la descripción de resultados menciona repetir solo si algún quiz del libro lo permite y no repite el título', async () => {
    mockApi({
      'GET /api/me/library': () => json({ books: [entry(1, 'open')] }),
      'GET /api/books': () => json({ books: [book(1)] }),
      [`GET /api/me/results?bookId=${BOOK_ID}`]: () => json({ results: [] }),
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: () =>
        json({
          bookId: BOOK_ID,
          bookCompleted: false,
          experiences: [
            {
              kind: 'quiz',
              id: '1'.repeat(24),
              title: 'Q1',
              order: 1,
              status: 'available',
              inProgress: false,
              allowRetake: true,
            },
          ],
        }),
    });
    renderAt('/panel/libros/libro-1/resultados');
    const description = await screen.findByText(/repetir los quizzes que lo permiten/);
    expect(description).toHaveTextContent(/Aquí queda lo que descubriste en este libro/);
    expect(description.textContent).not.toContain('[PLACEHOLDER] Libro 1');
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
    ['/panel/cuenta', null],
    ['/panel/quiz/abc', null],
  ])('%s → %s', (path, expected) => {
    expect(sectionOf(path)).toBe(expected);
  });
});
