import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, apiError, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const NO_SESSION = { session: null } as const;
const image = (name: string) => ({
  provider: 'cloudinary',
  publicId: `libro/${name}`,
  deliveryType: 'upload',
  url: `https://res.cloudinary.com/demo/image/upload/libro/${name}.png`,
  width: 600,
  height: 600,
  alt: `Dibujo ${name}`,
});
const art = (n: number, over: object = {}) => ({
  id: String(n).padStart(24, '0'),
  title: `Título ${n}`,
  image: image(`arte${n}`),
  artistName: `Artista ${n}`,
  order: n,
  ...over,
});

describe('fan arts', () => {
  it('muestra el mosaico con imágenes perezosas y el aviso para escribir a la autora', async () => {
    mockApi({ 'GET /api/fan-arts': () => json({ fanArts: [art(1), art(2)] }) }, NO_SESSION);
    renderAt('/fan-arts');
    expect(await screen.findByRole('heading', { level: 1, name: 'Fan arts' })).toBeInTheDocument();
    const first = await screen.findByRole('img', { name: 'Dibujo arte1' });
    expect(first).toHaveAttribute('loading', 'lazy');
    expect(first).toHaveAttribute('src', expect.stringContaining('w_480'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Contacto' }),
    ).toHaveAttribute('href', '/contacto');
  });

  it('al tocar uno se amplía con el crédito del artista, su enlace y el permiso; las flechas cambian de dibujo', async () => {
    mockApi(
      {
        'GET /api/fan-arts': () =>
          json({
            fanArts: [
              art(1, { artistLink: 'https://ejemplo.com/ana' }),
              art(2, { title: undefined }),
            ],
          }),
      },
      NO_SESSION,
    );
    renderAt('/fan-arts');
    await userEvent.click(
      await screen.findByRole('button', { name: /Ampliar el fan art Título 1/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Foto ampliada' });
    expect(within(dialog).getByText('Título 1')).toBeInTheDocument();
    const credit = within(dialog).getByRole('link', { name: /Artista 1/ });
    expect(credit).toHaveAttribute('href', 'https://ejemplo.com/ana');
    expect(credit).toHaveAttribute('target', '_blank');
    expect(credit).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(dialog).getByText(/publicado con su permiso/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Foto siguiente' }));
    // El segundo no trae enlace: el nombre va como texto, sin enlace roto.
    expect(within(dialog).getByText(/Por Artista 2/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con varios libros publicados ofrece filtrar y pide solo los de ese libro', async () => {
    const second = { ...BOOK, id: '670000000000000000000011', slug: 'libro-2', title: 'Libro 2' };
    const { called } = mockApi(
      {
        'GET /api/books': () => json({ books: [BOOK, second] }),
        'GET /api/fan-arts': () => json({ fanArts: [art(1), art(2)] }),
        [`GET /api/fan-arts?bookId=${second.id}`]: () => json({ fanArts: [art(2)] }),
      },
      NO_SESSION,
    );
    renderAt('/fan-arts');
    await screen.findByRole('img', { name: 'Dibujo arte1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Libro 2' }));
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Dibujo arte1' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('img', { name: 'Dibujo arte2' })).toBeInTheDocument();
    expect(called(`GET /api/fan-arts?bookId=${second.id}`)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Libro 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('con un solo libro no muestra filtro', async () => {
    mockApi({ 'GET /api/fan-arts': () => json({ fanArts: [art(1)] }) }, NO_SESSION);
    renderAt('/fan-arts');
    await screen.findByRole('img', { name: 'Dibujo arte1' });
    expect(screen.queryByRole('group', { name: 'Filtrar por libro' })).not.toBeInTheDocument();
  });

  it('sin fan arts lo dice y con error del servidor lo avisa', async () => {
    mockApi({ 'GET /api/fan-arts': () => json({ fanArts: [] }) }, NO_SESSION);
    const first = renderAt('/fan-arts');
    expect(await screen.findByText('Todavía no hay fan arts publicados.')).toBeInTheDocument();
    first.unmount();
    mockApi({ 'GET /api/fan-arts': () => apiError('INTERNAL', 'Error', 500) }, NO_SESSION);
    renderAt('/fan-arts');
    expect(await screen.findByText(/Algo salió mal en el servidor/)).toBeInTheDocument();
  });

  it('el menú público lleva a los fan arts', async () => {
    mockApi({ 'GET /api/fan-arts': () => json({ fanArts: [] }) }, NO_SESSION);
    renderAt('/fan-arts');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Fan arts' })).toHaveAttribute(
      'href',
      '/fan-arts',
    );
  });
});

describe('reseñas en la landing', () => {
  const base = {
    'GET /api/site': () =>
      json({ universe: { introHtml: '' }, author: { bioHtml: '' }, social: [], lockMessage: 'x' }),
    'GET /api/books': () => json({ books: [] }),
  };
  const key = 'GET /api/reviews?limit=6';
  const review = (n: number, over: object = {}) => ({
    id: String(n).padStart(24, '0'),
    text: `Reseña número ${n}`,
    authorName: `Lector ${n}`,
    order: n,
    ...over,
  });

  it('muestra cada reseña con su autor, su fuente y las estrellas', async () => {
    mockApi(
      {
        ...base,
        [key]: () => json({ reviews: [review(1, { rating: 4, source: 'Goodreads' }), review(2)] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    const section = await screen.findByRole('region', { name: 'Reseñas de lectores' });
    expect(await within(section).findByText(/Reseña número 1/)).toBeInTheDocument();
    expect(within(section).getByText(/Lector 1/)).toBeInTheDocument();
    expect(within(section).getByText(/Goodreads/)).toBeInTheDocument();
    expect(within(section).getByRole('img', { name: '4 de 5 estrellas' })).toBeInTheDocument();
    // La segunda no trae calificación ni fuente.
    expect(within(section).getAllByRole('img')).toHaveLength(1);
  });

  it('es texto plano: el HTML de una reseña se muestra como texto, nunca se ejecuta', async () => {
    mockApi(
      {
        ...base,
        [key]: () =>
          json({ reviews: [review(1, { text: '<img src=x onerror="alert(1)"> Genial' })] }),
      },
      NO_SESSION,
    );
    const { container } = renderAt('/');
    expect(await screen.findByText(/<img src=x onerror="alert\(1\)"> Genial/)).toBeInTheDocument();
    expect(container.querySelector('img[onerror]')).toBeNull();
  });

  it('sin reseñas la sección no aparece', async () => {
    mockApi({ ...base, [key]: () => json({ reviews: [] }) }, NO_SESSION);
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Reseñas de lectores' })).toBeNull(),
    );
  });
});
