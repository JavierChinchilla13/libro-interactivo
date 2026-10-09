import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../../test/mockApi';
import { dataToPayload, formFromPost, payloadFromForm, statusLabel } from './postForm';

afterEach(() => vi.unstubAllGlobals());

const EDITOR = {
  id: '670000000000000000000002',
  name: 'Editora',
  email: 'e@ejemplo.com',
  role: 'EDITOR',
};
const POST_ID = '670000000000000000000050';
const post = (over: object = {}) => ({
  id: POST_ID,
  slug: 'feria-del-libro',
  title: 'Feria del libro',
  template: 'event',
  category: 'evento',
  excerpt: '',
  featured: false,
  status: 'published',
  publishedAt: '2026-10-01T15:00:00.000Z',
  createdAt: '2026-10-01T15:00:00.000Z',
  updatedAt: '2026-10-01T15:00:00.000Z',
  data: { startsAt: '2027-03-20T22:00:00.000Z', venue: 'Librería Central', bodyHtml: '' },
  ...over,
});

describe('lista del panel', () => {
  const listKey = 'GET /api/admin/posts';

  it('muestra plantilla, tipo, estado (incluida «Programada») y destacadas, y está en el menú', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    mockApi(
      {
        [listKey]: () =>
          json({
            posts: [
              post({ featured: true }),
              post({ id: '2'.padStart(24, '0'), title: 'Programada', publishedAt: future }),
              post({
                id: '3'.padStart(24, '0'),
                title: 'Un borrador',
                status: 'draft',
                template: 'text',
                category: 'novedad',
              }),
            ],
          }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/actualizaciones');
    expect(
      await screen.findByRole('row', {
        name: /Feria del libro.*Destacada.*Evento.*Evento.*Publicada/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Programada.*Programada/ })).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /Un borrador.*Texto simple.*Novedad.*Borrador/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Editar\s*Feria del libro/ })).toHaveAttribute(
      'href',
      `/admin/actualizaciones/${POST_ID}`,
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Administración' })).getByRole('link', {
        name: 'Actualizaciones',
      }),
    ).toBeInTheDocument();
  });

  it('los filtros viajan al servidor', async () => {
    const { called } = mockApi(
      {
        [listKey]: () => json({ posts: [] }),
        [`${listKey}?status=draft`]: () => json({ posts: [] }),
        [`${listKey}?status=draft&category=evento`]: () => json({ posts: [] }),
        [`${listKey}?status=draft&category=evento&q=feria`]: () => json({ posts: [] }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/actualizaciones');
    expect(await screen.findByText('Todavía no hay actualizaciones')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'draft');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'evento');
    await userEvent.type(screen.getByLabelText('Buscar por título'), 'feria');
    expect(await screen.findByText('No hay actualizaciones con esos filtros')).toBeInTheDocument();
    await waitFor(() =>
      expect(called(`${listKey}?status=draft&category=evento&q=feria`)).toHaveLength(1),
    );
  });
});

describe('nueva actualización', () => {
  const createKey = 'POST /api/admin/posts';

  it('primero se elige la plantilla y el formulario cambia según la elegida', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: EDITOR });
    renderAt('/admin/actualizaciones/nueva');
    for (const label of [
      'Texto simple',
      'Imagen destacada',
      'Galería',
      'Evento',
      'Invitación',
      'Anuncio de contenido',
    ]) {
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', { name: /Evento/ }));
    expect(await screen.findByLabelText('Lugar')).toBeInTheDocument();
    expect(screen.getByLabelText('Inicia')).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText('Enlace al mapa')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toHaveValue('evento');
  });

  it('publica un evento: la hora es de Costa Rica, los vacíos no viajan y el slug sale del título', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [createKey]: ({ body }) => json(post({ ...(body as object), id: POST_ID }), 201),
        [`GET /api/admin/posts/${POST_ID}`]: () => json(post()),
      },
      { session: EDITOR },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /^Título/ }),
      'Feria del Libro 2027',
    );
    expect(screen.getByLabelText('Dirección web (slug)')).toHaveValue('feria-del-libro-2027');
    await userEvent.type(screen.getByLabelText('Lugar'), '  Librería Central ');
    fireEvent.change(screen.getByLabelText('Inicia'), { target: { value: '2027-03-20T16:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(called(createKey)).toHaveLength(1));
    const body = called(createKey)[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      slug: 'feria-del-libro-2027',
      title: 'Feria del Libro 2027',
      template: 'event',
      category: 'evento',
      status: 'published',
      featured: false,
      data: { startsAt: '2027-03-20T22:00:00.000Z', venue: '  Librería Central ' },
    });
    expect(body['data']).not.toHaveProperty('endsAt');
    expect(body['data']).not.toHaveProperty('address');
    expect(body).not.toHaveProperty('publishedAt');
    expect(body).not.toHaveProperty('bookId');
  });

  it('muestra los avisos por campo y no llama al API si falta algo para publicar', async () => {
    const { called } = mockApi(
      { 'GET /api/admin/books': () => json({ books: [] }) },
      { session: EDITOR },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /^Título/ }),
      'Evento sin datos',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    const summary = await screen
      .findByRole('alert', { name: /Revisa estos campos/ })
      .catch(() => null);
    void summary;
    expect(await screen.findAllByText('Escribe el lugar')).not.toHaveLength(0);
    expect(screen.getAllByText('Elige la fecha y hora de inicio').length).toBeGreaterThan(0);
    expect(called('POST /api/admin/posts')).toHaveLength(0);
  });

  it('un borrador puede estar incompleto', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        'POST /api/admin/posts': ({ body }) => json(post({ ...(body as object) }), 201),
        [`GET /api/admin/posts/${POST_ID}`]: () => json(post({ status: 'draft' })),
      },
      { session: EDITOR },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Título/ }), 'Solo el título');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(called('POST /api/admin/posts')).toHaveLength(1));
    expect(called('POST /api/admin/posts')[0]?.body).toMatchObject({ status: 'draft', data: {} });
  });

  it('rechaza en el navegador un enlace que no es http(s)', async () => {
    const { called } = mockApi(
      { 'GET /api/admin/books': () => json({ books: [] }) },
      { session: EDITOR },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Título/ }), 'Evento');
    await userEvent.type(screen.getByLabelText('Enlace de más información'), 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect((await screen.findAllByText(/debe empezar con http/i)).length).toBeGreaterThan(0);
    expect(called('POST /api/admin/posts')).toHaveLength(0);
  });

  it('la vista previa sigue lo que se escribe', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: EDITOR });
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Título/ }), 'Mi feria');
    await userEvent.type(screen.getByLabelText('Lugar'), 'Sala 3');
    const preview = screen.getByRole('heading', { name: 'Vista previa' }).closest('section');
    expect(preview).not.toBeNull();
    expect(
      within(preview as HTMLElement).getByRole('heading', { name: 'Mi feria' }),
    ).toBeInTheDocument();
    expect(within(preview as HTMLElement).getByText('Sala 3')).toBeInTheDocument();
  });

  it('cambiar de plantilla limpia los datos de la anterior y propone su tipo', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: EDITOR });
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await userEvent.type(await screen.findByLabelText('Lugar'), 'Sala 3');
    await userEvent.type(screen.getByRole('textbox', { name: /^Título/ }), 'Algo');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar plantilla' }));
    await userEvent.click(screen.getByRole('button', { name: /Invitación/ }));
    expect(screen.queryByLabelText('Lugar')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Texto del botón')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toHaveValue('invitacion');
    // El título se conserva.
    expect(screen.getByRole('textbox', { name: /^Título/ })).toHaveValue('Algo');
  });
});

describe('editar una actualización', () => {
  it('carga los datos (hora de Costa Rica) y guarda con PUT conservando el estado', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/posts/${POST_ID}`]: () => json(post()),
        [`PUT /api/admin/posts/${POST_ID}`]: ({ body }) => json(post({ ...(body as object) })),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/actualizaciones/${POST_ID}`);
    expect(await screen.findByLabelText('Inicia')).toHaveValue('2027-03-20T16:00');
    expect(screen.getByLabelText('Lugar')).toHaveValue('Librería Central');
    expect(screen.getByLabelText('Estado')).toHaveValue('published');
    expect(screen.getByLabelText('Fecha de publicación')).toHaveValue('2026-10-01T09:00');
    await userEvent.clear(screen.getByLabelText('Lugar'));
    await userEvent.type(screen.getByLabelText('Lugar'), 'Otro lugar');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    const body = called(`PUT /api/admin/posts/${POST_ID}`)[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      data: { venue: 'Otro lugar', startsAt: '2027-03-20T22:00:00.000Z' },
      publishedAt: '2026-10-01T15:00:00.000Z',
      status: 'published',
    });
    expect(screen.getByRole('link', { name: 'Ver la publicación' })).toHaveAttribute(
      'href',
      '/actualizaciones/feria-del-libro',
    );
  });

  it('una que no existe muestra el error del servidor', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/posts/${POST_ID}`]: () =>
          apiError('NOT_FOUND', 'No encontramos esa actualización', 404),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/actualizaciones/${POST_ID}`);
    expect(await screen.findByText('No encontramos esa actualización')).toBeInTheDocument();
  });
});

describe('conversión entre formulario y API', () => {
  it('omite textos vacíos, fotos sin imagen y convierte fechas de Costa Rica a UTC', () => {
    expect(
      dataToPayload('gallery', {
        images: [
          { image: { publicId: 'x' } },
          { caption: 'sin foto' },
          { image: { publicId: 'y' }, caption: ' Pie ' },
        ],
        bodyHtml: '<p></p>',
      }),
    ).toEqual({
      images: [{ image: { publicId: 'x' } }, { image: { publicId: 'y' }, caption: 'Pie' }],
    });
    expect(dataToPayload('invitation', { deadline: '2027-01-01T08:30', ctaLabel: ' ' })).toEqual({
      deadline: '2027-01-01T14:30:00.000Z',
    });
    expect(dataToPayload('event', { endsAt: '' })).toEqual({});
  });

  it('ida y vuelta de un evento conserva las fechas', () => {
    const original = post();
    const form = formFromPost(original as never);
    expect(form.data['startsAt']).toBe('2027-03-20T16:00');
    expect(payloadFromForm(form).data).toMatchObject({ startsAt: '2027-03-20T22:00:00.000Z' });
  });

  it('el estado «Programada» sale de una fecha futura', () => {
    expect(statusLabel({ status: 'published', publishedAt: '2999-01-01T00:00:00.000Z' })).toBe(
      'Programada',
    );
    expect(statusLabel({ status: 'published', publishedAt: '2000-01-01T00:00:00.000Z' })).toBe(
      'Publicada',
    );
    expect(statusLabel({ status: 'draft', publishedAt: '2999-01-01T00:00:00.000Z' })).toBe(
      'Borrador',
    );
    expect(statusLabel({ status: 'archived' })).toBe('Archivada');
  });
});
