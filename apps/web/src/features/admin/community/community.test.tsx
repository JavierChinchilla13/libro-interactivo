import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../../test/mockApi';
import { fanArtPayload } from './FanArtPages';
import { reviewPayload } from './ReviewPages';

afterEach(() => vi.unstubAllGlobals());

const EDITOR = {
  id: '670000000000000000000002',
  name: 'Editora',
  email: 'e@ejemplo.com',
  role: 'EDITOR',
};
const ID = '670000000000000000000060';
const image = {
  provider: 'cloudinary',
  publicId: 'libro/arte',
  deliveryType: 'upload',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/arte.png',
  width: 600,
  height: 600,
  alt: 'Dibujo',
};
const stamps = { createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' };
const fanArt = (over: object = {}) => ({
  id: ID,
  title: 'Mi dibujo',
  image,
  artistName: 'Ana',
  permissionConfirmed: true,
  permissionNote: 'Por correo',
  order: 1,
  status: 'published',
  ...stamps,
  ...over,
});
const review = (over: object = {}) => ({
  id: ID,
  text: 'Me encantó',
  authorName: 'Lector',
  rating: 5,
  order: 1,
  status: 'published',
  ...stamps,
  ...over,
});
const nav = () => screen.findByRole('navigation', { name: 'Administración' });

describe('fan arts del panel', () => {
  it('lista con el permiso y el estado, y aparece en el menú sin «pronto»', async () => {
    mockApi(
      {
        'GET /api/admin/fan-arts': () =>
          json({
            fanArts: [
              fanArt(),
              fanArt({
                id: '2'.padStart(24, '0'),
                title: undefined,
                artistName: 'Beto',
                permissionConfirmed: false,
                status: 'draft',
              }),
            ],
          }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/fan-arts');
    expect(
      await screen.findByRole('row', { name: /Mi dibujo.*Por Ana.*Confirmado.*Publicado/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /Sin título.*Por Beto.*Sin confirmar.*Borrador/ }),
    ).toBeInTheDocument();
    const menu = await nav();
    expect(within(menu).getByRole('link', { name: 'Fan arts' })).toHaveAttribute(
      'href',
      '/admin/fan-arts',
    );
    expect(within(menu).getByRole('link', { name: 'Reseñas' })).toHaveAttribute(
      'href',
      '/admin/resenas',
    );
    expect(within(menu).queryByText(/Fan arts.*pronto/)).not.toBeInTheDocument();
  });

  it('no deja publicar sin el permiso del artista y no llama al API', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/fan-arts/${ID}`]: () =>
          json(fanArt({ permissionConfirmed: false, status: 'draft' })),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/fan-arts/${ID}`);
    await userEvent.selectOptions(await screen.findByLabelText('Estado'), 'published');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      (
        await screen.findAllByText(
          'No se puede publicar sin confirmar que el artista dio su permiso',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(called(`PUT /api/admin/fan-arts/${ID}`)).toHaveLength(0);
    // Al confirmar el permiso, sí guarda.
    await userEvent.click(screen.getByLabelText(/El artista dio su permiso/));
    expect(screen.getByLabelText(/El artista dio su permiso/)).toBeChecked();
  });

  it('la imagen es obligatoria y el enlace del artista debe ser http(s)', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/fan-arts': () => json({ fanArts: [] }),
        'GET /api/admin/books': () => json({ books: [] }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/fan-arts/nuevo');
    await userEvent.type(await screen.findByLabelText(/Nombre del artista/), 'Ana');
    await userEvent.type(screen.getByLabelText(/Enlace al perfil/), 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect((await screen.findAllByText(/debe empezar con http/i)).length).toBeGreaterThan(0);
    expect(called('POST /api/admin/fan-arts')).toHaveLength(0);
  });

  it('edita y guarda con PUT conservando el permiso y el resto', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/fan-arts/${ID}`]: () => json(fanArt()),
        [`PUT /api/admin/fan-arts/${ID}`]: ({ body }) => json(fanArt({ ...(body as object) })),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/fan-arts/${ID}`);
    expect(await screen.findByLabelText(/Nombre del artista/)).toHaveValue('Ana');
    expect(screen.getByLabelText(/El artista dio su permiso/)).toBeChecked();
    expect(screen.getByLabelText(/Nota sobre el permiso/)).toHaveValue('Por correo');
    await userEvent.clear(screen.getByLabelText(/Nombre del artista/));
    await userEvent.type(screen.getByLabelText(/Nombre del artista/), 'Ana María');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    const body = called(`PUT /api/admin/fan-arts/${ID}`)[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      artistName: 'Ana María',
      permissionConfirmed: true,
      permissionNote: 'Por correo',
      status: 'published',
      title: 'Mi dibujo',
    });
  });

  it('un fan art que no existe muestra el error del servidor', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/fan-arts/${ID}`]: () =>
          apiError('NOT_FOUND', 'No encontramos ese fan art', 404),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/fan-arts/${ID}`);
    expect(await screen.findByText('No encontramos ese fan art')).toBeInTheDocument();
  });

  it('lo vacío no viaja', () => {
    expect(
      fanArtPayload({
        title: ' ',
        image: undefined,
        artistName: ' Ana ',
        artistLink: '',
        bookId: '',
        permissionConfirmed: false,
        permissionNote: '',
        order: '',
        status: 'draft',
      }),
    ).toEqual({ artistName: 'Ana', permissionConfirmed: false, order: 1, status: 'draft' });
  });
});

describe('reseñas del panel', () => {
  it('lista con el estado (Publicada / Oculta) y las estrellas', async () => {
    mockApi(
      {
        'GET /api/admin/reviews': () =>
          json({
            reviews: [
              review(),
              review({
                id: '2'.padStart(24, '0'),
                text: 'Otra',
                rating: undefined,
                status: 'hidden',
              }),
            ],
          }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/resenas');
    expect(
      await screen.findByRole('row', { name: /Me encantó.*Lector.*★★★★★.*Publicada/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Otra.*Oculta/ })).toBeInTheDocument();
  });

  it('crea una reseña: lo vacío no viaja y el texto se guarda tal cual', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/reviews': () => json({ reviews: [] }),
        'GET /api/admin/books': () => json({ books: [] }),
        'POST /api/admin/reviews': ({ body }) => json(review({ ...(body as object) }), 201),
        [`GET /api/admin/reviews/${ID}`]: () => json(review()),
      },
      { session: EDITOR },
    );
    renderAt('/admin/resenas/nueva');
    await userEvent.type(await screen.findByLabelText(/^Reseña/), 'Muy buena <b>historia</b>');
    await userEvent.type(screen.getByLabelText(/Nombre del lector/), 'Lector');
    await userEvent.selectOptions(screen.getByLabelText('Calificación (opcional)'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(called('POST /api/admin/reviews')).toHaveLength(1));
    const body = called('POST /api/admin/reviews')[0]?.body as Record<string, unknown>;
    expect(body).toEqual({
      text: 'Muy buena <b>historia</b>',
      authorName: 'Lector',
      rating: 4,
      order: 1,
      status: 'published',
    });
  });

  it('avisa por campo y no llama al API si falta el texto o el nombre', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/reviews': () => json({ reviews: [] }),
        'GET /api/admin/books': () => json({ books: [] }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/resenas/nueva');
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findAllByText('Escribe la reseña')).not.toHaveLength(0);
    expect(screen.getAllByText('Escribe el nombre del lector').length).toBeGreaterThan(0);
    expect(called('POST /api/admin/reviews')).toHaveLength(0);
  });

  it('ocultar una reseña existente la guarda con el estado «hidden»', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/reviews/${ID}`]: () => json(review()),
        [`PUT /api/admin/reviews/${ID}`]: ({ body }) => json(review({ ...(body as object) })),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/resenas/${ID}`);
    await userEvent.selectOptions(await screen.findByLabelText('Estado'), 'hidden');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(called(`PUT /api/admin/reviews/${ID}`)[0]?.body).toMatchObject({
      status: 'hidden',
      rating: 5,
    });
  });

  it('lo vacío no viaja', () => {
    expect(
      reviewPayload({
        text: ' Hola ',
        authorName: ' Ana ',
        source: '',
        rating: '',
        bookId: '',
        order: '3',
        status: 'hidden',
      }),
    ).toEqual({ text: 'Hola', authorName: 'Ana', order: 3, status: 'hidden' });
  });
});
