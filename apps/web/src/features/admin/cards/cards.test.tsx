import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK, BOOK_ID, READER, json, mockApi, renderAt } from '../../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
});

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Marisol Quesada', role: 'ADMIN' };
const EDITOR = { ...ADMIN, id: '670000000000000000000003', name: 'Editora', role: 'EDITOR' };
const STAMP = '2026-10-01T15:00:00.000Z';
const adminBook = {
  ...BOOK,
  synopsis: '',
  genres: [],
  purchaseLinks: [],
  showInReaderPanel: false,
  wikiSections: [],
  createdAt: STAMP,
  updatedAt: STAMP,
};
const books = { 'GET /api/admin/books': () => json({ books: [adminBook] }) };
const pid = (n: number | string) =>
  `libro/cartas/AbCdEfGhIjKlMnOpQrSt${String(n).padStart(4, '0')}`;
const thumb = (publicId: string) =>
  `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_480/${publicId}`;

const image = (n: number, alt?: string) => ({
  publicId: pid(n),
  ...(alt ? { alt } : {}),
  width: 1200,
  height: 1800,
  bytes: 1_000_000,
  format: 'jpg',
  url: thumb(pid(n)),
});
const card = (id: string, n: number, over: Record<string, unknown> = {}) => ({
  id,
  bookId: BOOK_ID,
  title: `[PLACEHOLDER] Carta ${n}`,
  order: n,
  status: 'published',
  images: [image(n * 10)],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const C1 = '670000000000000000000091';
const C2 = '670000000000000000000092';
const LIST = `GET /api/admin/cards?bookId=${BOOK_ID}`;
const SIGN = 'POST /api/admin/cards/upload-signature';
const CLOUD = 'POST https://api.cloudinary.com/v1_1/demo/image/upload';

/** Una firma distinta por llamada y un Cloudinary que responde con ese mismo identificador. */
function uploads() {
  let signed = 0;
  let uploaded = 0;
  return {
    [SIGN]: () => {
      signed += 1;
      return json({
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        cloudName: 'demo',
        apiKey: 'k',
        signature: `s${signed}`,
        params: { public_id: pid(signed), timestamp: '1', allowed_formats: 'jpg,jpeg,png,webp' },
        maxBytes: 8 * 1024 * 1024,
      });
    },
    [CLOUD]: () => {
      uploaded += 1;
      return json({
        public_id: pid(uploaded),
        secure_url: `https://res.cloudinary.com/demo/image/upload/${pid(uploaded)}.jpg`,
        width: 1200,
        height: 1800,
      });
    },
  };
}
const png = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });

describe('/admin/cartas (lista)', () => {
  it('lista las del libro con su estado, su cantidad de imágenes y su posición; el menú dice «Hallazgos»', async () => {
    mockApi(
      {
        ...books,
        [LIST]: () =>
          json({
            cards: [
              card(C1, 1, { images: [image(1), image(2), image(3)] }),
              card(C2, 2, { status: 'archived' }),
            ],
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/cartas');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hallazgos' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Elementos de «Hallazgos»' });
    const items = within(list).getAllByRole('article');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Publicada')).toBeInTheDocument();
    expect(within(items[0]!).getByText('3 imágenes')).toBeInTheDocument();
    expect(within(items[0]!).getByText('· Posición 1')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Archivada')).toBeInTheDocument();
    expect(within(items[1]!).getByText('1 imagen')).toBeInTheDocument();
    // Con su miniatura de entrega (nunca la original).
    expect(within(items[0]!).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      thumb(pid(1)),
    );
    const menu = screen.getAllByRole('navigation')[0]!;
    expect(within(menu).getByRole('link', { name: /Hallazgos/ })).toHaveAttribute(
      'href',
      '/admin/cartas',
    );
    expect(document.title).toBe('Hallazgos · Administración · Universo Memorias');
  });

  it('sin nada explica cómo empezar; sin libros pide crear uno', async () => {
    mockApi({ ...books, [LIST]: () => json({ cards: [] }) }, { session: ADMIN });
    renderAt('/admin/cartas');
    expect(
      await screen.findByText(/Todavía no hay nada en «Hallazgos» en este libro/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear la primera' })).toHaveAttribute(
      'href',
      `/admin/cartas/nueva?libro=${BOOK_ID}`,
    );
  });

  it('se reordenan con las flechas: manda el nuevo orden y avisa', async () => {
    let order = [C1, C2];
    const { called } = mockApi(
      {
        ...books,
        [LIST]: () =>
          json({
            cards: order.map((id, index) => card(id, id === C1 ? 1 : 2, { order: index + 1 })),
          }),
        'PATCH /api/admin/cards/reorder': ({ body }) => {
          order = (body as { ids: string[] }).ids;
          return json({
            cards: order.map((id, index) => card(id, id === C1 ? 1 : 2, { order: index + 1 })),
          });
        },
      },
      { session: ADMIN },
    );
    renderAt('/admin/cartas');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Bajar «[PLACEHOLDER] Carta 1» una posición' }),
    );
    await waitFor(() => expect(called('PATCH /api/admin/cards/reorder')).toHaveLength(1));
    expect(called('PATCH /api/admin/cards/reorder')[0]?.body).toEqual({
      bookId: BOOK_ID,
      ids: [C2, C1],
    });
    expect(await screen.findByText('Orden guardado')).toBeInTheDocument();
    // La primera ya no se puede subir y la última no se puede bajar.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Subir «[PLACEHOLDER] Carta 2» una posición' }),
      ).toBeDisabled(),
    );
  });

  it('archivar manda la carta completa (con sus imágenes y su texto alternativo) y publicar la devuelve', async () => {
    const { called } = mockApi(
      {
        ...books,
        [LIST]: () => json({ cards: [card(C1, 1, { images: [image(1, 'Un mapa'), image(2)] })] }),
        [`PUT /api/admin/cards/${C1}`]: ({ body }) =>
          json(card(C1, 1, { status: (body as { status: string }).status })),
      },
      { session: ADMIN },
    );
    renderAt('/admin/cartas');
    await userEvent.click(await screen.findByRole('button', { name: /^Archivar/ }));
    await waitFor(() => expect(called(`PUT /api/admin/cards/${C1}`)).toHaveLength(1));
    expect(called(`PUT /api/admin/cards/${C1}`)[0]?.body).toEqual({
      bookId: BOOK_ID,
      title: '[PLACEHOLDER] Carta 1',
      order: 1,
      status: 'archived',
      images: [{ publicId: pid(1), alt: 'Un mapa' }, { publicId: pid(2) }],
    });
    expect(await screen.findByText('Archivada')).toBeInTheDocument();
  });

  it('el nombre de la sección: se guarda sin formato, el menú y el título cambian al instante y vacío vuelve a «Hallazgos»', async () => {
    let label = 'Hallazgos';
    const { called } = mockApi(
      {
        ...books,
        [LIST]: () => json({ cards: [] }),
        'GET /api/site': () =>
          json({
            universe: { introHtml: '' },
            author: { bioHtml: '' },
            social: [],
            lockMessage: 'x',
            cardsLabel: label,
          }),
        'PATCH /api/admin/site-settings': ({ body }) => {
          label = (body as { cardsLabel: string }).cardsLabel || 'Hallazgos';
          return json({
            welcome: { enabled: false, bodyHtml: '', showMode: 'every_login' },
            universe: { introHtml: '' },
            author: { bioHtml: '' },
            social: [],
            lock: {},
            cardsLabel: label,
          });
        },
      },
      { session: ADMIN },
    );
    renderAt('/admin/cartas');
    const input = await screen.findByRole('textbox', { name: 'Nombre' });
    expect(input).toHaveValue('Hallazgos');
    expect(screen.getByRole('button', { name: 'Guardar nombre' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'Reliquias');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    await waitFor(() => expect(called('PATCH /api/admin/site-settings')).toHaveLength(1));
    expect(called('PATCH /api/admin/site-settings')[0]?.body).toEqual({ cardsLabel: 'Reliquias' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Reliquias' })).toBeInTheDocument();
    expect(screen.getByText('Nombre guardado')).toBeInTheDocument();
    expect(
      within(screen.getAllByRole('navigation')[0]!).getByRole('link', { name: /Reliquias/ }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Reliquias · Administración · Universo Memorias');

    await userEvent.clear(screen.getByRole('textbox', { name: 'Nombre' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hallazgos' })).toBeInTheDocument();
  });
});

describe('/admin/cartas/nueva (formulario con varias imágenes)', () => {
  const base = () => ({
    ...books,
    [LIST]: () => json({ cards: [card(C2, 1)] }),
    ...uploads(),
  });

  it('sube varias a la vez (una firma por imagen), las ordena, las describe, quita una y guarda en ese orden', async () => {
    const { called } = mockApi(
      {
        ...base(),
        'POST /api/admin/cards': ({ body }) =>
          json(card(C1, 1, { title: (body as { title: string }).title }), 201),
        [`GET /api/admin/cards/${C1}`]: () => json(card(C1, 1)),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/cartas/nueva?libro=${BOOK_ID}`);
    await userEvent.type(
      await screen.findByRole('textbox', { name: /^Título/ }),
      'Mi carta de prueba',
    );
    const picker = screen.getByLabelText('Elegir imágenes de la carta');
    await userEvent.upload(picker, [png('uno.png'), png('dos.png'), png('tres.png')]);

    const images = await screen.findByRole('list', { name: 'Imágenes de la carta' });
    await waitFor(() => expect(within(images).getAllByRole('listitem')).toHaveLength(3));
    // Cada imagen pidió SU firma y se subió por su cuenta.
    expect(called(SIGN)).toHaveLength(3);
    expect(called(CLOUD)).toHaveLength(3);
    expect(called(SIGN)[0]?.body).toEqual({ bookId: BOOK_ID });
    expect(screen.getByText('3 de 12')).toBeInTheDocument();
    const rows = () => within(images).getAllByRole('listitem');
    expect(within(rows()[0]!).getByText('Portada')).toBeInTheDocument();
    expect(within(rows()[1]!).queryByText('Portada')).toBeNull();

    // Texto alternativo de la segunda y reordenar: la tercera sube un lugar.
    await userEvent.type(
      within(rows()[1]!).getByRole('textbox', { name: /Texto alternativo de la imagen 2/ }),
      'Un mapa antiguo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subir la imagen 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la imagen 1' }));
    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]!).getByText('Portada')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(called('POST /api/admin/cards')).toHaveLength(1));
    // Quedaron la tercera y la segunda (con su alt), en ese orden; el orden de la carta es el siguiente al de las que ya hay.
    expect(called('POST /api/admin/cards')[0]?.body).toEqual({
      bookId: BOOK_ID,
      title: 'Mi carta de prueba',
      order: 2,
      status: 'published',
      images: [{ publicId: pid(3) }, { publicId: pid(2), alt: 'Un mapa antiguo' }],
    });
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('sin imágenes o sin título no guarda y lo dice', async () => {
    const { called } = mockApi(base(), { session: ADMIN });
    renderAt(`/admin/cartas/nueva?libro=${BOOK_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Crear' }));
    expect((await screen.findAllByText('Escribe el título de la carta')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sube al menos una imagen').length).toBeGreaterThan(0);
    expect(called('POST /api/admin/cards')).toHaveLength(0);
  });

  it('un archivo que no es JPG, PNG o WebP, o que pesa más de 8 MB, se avisa sin subir nada', async () => {
    const { called } = mockApi(base(), { session: ADMIN });
    renderAt(`/admin/cartas/nueva?libro=${BOOK_ID}`);
    const picker = await screen.findByLabelText('Elegir imágenes de la carta');
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(picker, [
      new File(['x'], 'gato.gif', { type: 'image/gif' }),
      png('enorme.png', 9 * 1024 * 1024),
    ]);
    const alert = await screen.findByText('Algunas imágenes no se subieron');
    const box = alert.closest('div')!;
    expect(box).toHaveTextContent('«gato.gif» no es JPG, PNG ni WebP.');
    expect(box).toHaveTextContent('«enorme.png» pesa 9,0 MB y el máximo es 8 MB.');
    expect(called(SIGN)).toHaveLength(0);
    expect(called(CLOUD)).toHaveLength(0);
    expect(screen.getByText('0 de 12')).toBeInTheDocument();
  });

  it('un fallo de una imagen no frena a las demás y dice cuál falló', async () => {
    let n = 0;
    const handlers = base();
    mockApi(
      {
        ...handlers,
        [CLOUD]: () => {
          n += 1;
          return n === 1
            ? json({ error: { message: 'x' } }, 400)
            : json({
                public_id: pid(2),
                secure_url: `https://res.cloudinary.com/demo/image/upload/${pid(2)}.jpg`,
                width: 1200,
                height: 1800,
              });
        },
      },
      { session: ADMIN },
    );
    renderAt(`/admin/cartas/nueva?libro=${BOOK_ID}`);
    await userEvent.upload(await screen.findByLabelText('Elegir imágenes de la carta'), [
      png('mala.png'),
      png('buena.png'),
    ]);
    expect(await screen.findByText(/«mala.png»: No se pudo subir el archivo/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1 de 12')).toBeInTheDocument());
  });

  it('el tope es de 12 imágenes: si no caben todas, se suben las primeras y se avisa', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => image(i + 100));
    const { called } = mockApi(
      {
        ...books,
        [`GET /api/admin/cards/${C1}`]: () => json(card(C1, 1, { images: eleven })),
        ...uploads(),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/cartas/${C1}`);
    await userEvent.upload(await screen.findByLabelText('Elegir imágenes de la carta'), [
      png('a.png'),
      png('b.png'),
      png('c.png'),
    ]);
    expect(
      await screen.findByText(/Una carta admite hasta 12 imágenes: se subieron las primeras 1/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('12 de 12')).toBeInTheDocument());
    expect(called(SIGN)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Agregar más imágenes' })).toBeDisabled();
  });

  it('al editar muestra lo guardado, deja cambiar el estado y envía todo con su texto alternativo', async () => {
    const { called } = mockApi(
      {
        ...books,
        [`GET /api/admin/cards/${C1}`]: () =>
          json(card(C1, 1, { images: [image(1, 'Un mapa'), image(2)] })),
        [`PUT /api/admin/cards/${C1}`]: ({ body }) =>
          json(card(C1, 1, body as Record<string, unknown>)),
        ...uploads(),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/cartas/${C1}`);
    expect(await screen.findByRole('textbox', { name: /^Título/ })).toHaveValue(
      '[PLACEHOLDER] Carta 1',
    );
    expect(screen.getByRole('textbox', { name: /imagen 1 \(opcional\)/ })).toHaveValue('Un mapa');
    expect(
      screen
        .getAllByRole('link', { name: 'Códigos QR' })
        .some((link) => link.getAttribute('href') === '/admin/qr'),
    ).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'archived');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(called(`PUT /api/admin/cards/${C1}`)).toHaveLength(1));
    expect(called(`PUT /api/admin/cards/${C1}`)[0]?.body).toEqual({
      bookId: BOOK_ID,
      title: '[PLACEHOLDER] Carta 1',
      order: 1,
      status: 'archived',
      images: [{ publicId: pid(1), alt: 'Un mapa' }, { publicId: pid(2) }],
    });
  });
});

describe('quién entra', () => {
  it('una editora no ve «Hallazgos» en el menú de administración', async () => {
    mockApi({ ...books }, { session: EDITOR });
    renderAt('/admin');
    const menu = (await screen.findAllByRole('navigation'))[0]!;
    await within(menu).findByRole('link', { name: 'Libros' });
    expect(within(menu).queryByRole('link', { name: /Hallazgos/ })).toBeNull();
  });
});

describe('«Códigos QR»: crear el código de una carta', () => {
  it('ofrece solo las publicadas sin código, crea el código y lo marca con el nombre de la sección', async () => {
    const created = {
      id: '670000000000000000000040',
      bookId: BOOK_ID,
      target: { kind: 'card', refId: C1 },
      label: '[PLACEHOLDER] Libro 1 — [PLACEHOLDER] Carta 1',
      status: 'active',
      redeemCount: 0,
      createdAt: STAMP,
    };
    let tokens: unknown[] = [];
    const { called } = mockApi(
      {
        ...books,
        [LIST]: () =>
          json({
            cards: [card(C1, 1), card(C2, 2, { status: 'archived' })],
          }),
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: [] }),
        [`GET /api/admin/access-tokens?bookId=${BOOK_ID}`]: () => json({ tokens }),
        'POST /api/admin/access-tokens': () => {
          tokens = [created];
          return json(created, 201);
        },
      },
      { session: ADMIN },
    );
    renderAt('/admin/qr');
    const select = await screen.findByRole('combobox', { name: 'Hallazgos' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    // La archivada no se ofrece: su código no abriría nada.
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Elige uno', '[PLACEHOLDER] Carta 1']);
    const create = screen.getByRole('button', { name: 'Crear código de «Hallazgos»' });
    expect(create).toBeDisabled();
    await userEvent.selectOptions(select, C1);
    await userEvent.click(create);
    await waitFor(() => expect(called('POST /api/admin/access-tokens')).toHaveLength(1));
    expect(called('POST /api/admin/access-tokens')[0]?.body).toEqual({ kind: 'card', refId: C1 });
    const list = await screen.findByRole('list', { name: 'Códigos del libro' });
    expect(within(list).getByText('Hallazgos')).toBeInTheDocument();
    expect(
      within(list).getByText('[PLACEHOLDER] Libro 1 — [PLACEHOLDER] Carta 1'),
    ).toBeInTheDocument();
  });
});
