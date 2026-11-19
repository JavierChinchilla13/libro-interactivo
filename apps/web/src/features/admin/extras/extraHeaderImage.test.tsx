import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, BOOK_ID, READER, json, mockApi, renderAt } from '../../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Marisol Quesada', role: 'ADMIN' };
const STAMP = '2026-10-01T15:00:00.000Z';
const EXTRA_ID = '670000000000000000000030';
const PUBLIC_ID = 'libro/extra/AbCdEfGhIjKlMnOpQrSt';
const SIGN = 'POST /api/admin/uploads/image-signature';
const CLOUD = 'POST https://api.cloudinary.com/v1_1/demo/image/upload';
const PUT = `PUT /api/admin/extras/${EXTRA_ID}`;

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
const extra = (over: Record<string, unknown> = {}) => ({
  id: EXTRA_ID,
  bookId: BOOK_ID,
  slug: 'capitulo-uno',
  title: '[PLACEHOLDER] Capítulo uno',
  kind: 'text',
  bodyHtml: '<p>[PLACEHOLDER] Texto</p>',
  order: 1,
  status: 'draft',
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const headerRef = (over: Record<string, unknown> = {}) => ({
  provider: 'cloudinary',
  deliveryType: 'upload',
  publicId: PUBLIC_ID,
  url: `https://res.cloudinary.com/demo/image/upload/${PUBLIC_ID}.jpg`,
  width: 2400,
  height: 1200,
  alt: 'Una torre entre la niebla',
  ...over,
});

const uploads = () => ({
  [SIGN]: () =>
    json({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      cloudName: 'demo',
      apiKey: 'k',
      signature: 's',
      params: { folder: 'libro/extra', allowed_formats: 'jpg,jpeg,png,webp,gif', timestamp: '1' },
    }),
  [CLOUD]: () =>
    json({
      public_id: PUBLIC_ID,
      secure_url: `https://res.cloudinary.com/demo/image/upload/${PUBLIC_ID}.jpg`,
      width: 2400,
      height: 1200,
    }),
});
const base = (current: Record<string, unknown> = extra()) => ({
  'GET /api/admin/books': () => json({ books: [adminBook] }),
  [`GET /api/admin/extras/${EXTRA_ID}`]: () => json(current),
  [PUT]: ({ body }: { body: unknown }) => json({ ...current, ...(body as object) }),
  ...uploads(),
});
const photo = (name = 'torre.jpg', size = 1000) =>
  new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

describe('formulario del extra · imagen al inicio', () => {
  it('tiene su campo opcional, sin imagen al principio, con la ayuda del texto alternativo', async () => {
    mockApi(base(), { session: ADMIN });
    renderAt(`/admin/extras/${EXTRA_ID}`);
    expect(
      await screen.findByRole('heading', { name: 'Imagen al inicio (opcional)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin imagen.')).toBeInTheDocument();
    expect(screen.getByText('Describe la imagen para quien no la ve.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir imagen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar imagen' })).toBeNull();
  });

  it('sube con el propósito «extra», muestra la vista previa y guarda con su texto alternativo', async () => {
    const { called } = mockApi(base(), { session: ADMIN });
    renderAt(`/admin/extras/${EXTRA_ID}`);
    const picker = await screen.findByLabelText('Elegir archivo: Imagen al inicio (opcional)');
    await userEvent.upload(picker, photo());

    expect(called(SIGN)[0]?.body).toEqual({ purpose: 'extra', resource: 'image' });
    await screen.findByRole('button', { name: 'Quitar imagen' });
    expect(screen.getByRole('button', { name: 'Cambiar imagen' })).toBeInTheDocument();

    // El texto alternativo NO se rellena solo: la persona lo escribe.
    const alt = screen.getByRole('textbox', { name: /Texto alternativo/ });
    expect(alt).toHaveValue('');
    await userEvent.type(alt, 'Una torre entre la niebla');
    await userEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(called(PUT)).toHaveLength(1));
    expect(called(PUT)[0]?.body).toMatchObject({
      headerImage: {
        publicId: PUBLIC_ID,
        width: 2400,
        height: 1200,
        alt: 'Una torre entre la niebla',
      },
    });
  });

  it('sin texto alternativo no se guarda y el error aparece junto al campo', async () => {
    const { called } = mockApi(base(), { session: ADMIN });
    renderAt(`/admin/extras/${EXTRA_ID}`);
    await userEvent.upload(
      await screen.findByLabelText('Elegir archivo: Imagen al inicio (opcional)'),
      photo(),
    );
    await screen.findByRole('button', { name: 'Quitar imagen' });
    await userEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Describe la imagen para quien no la ve')).toBeInTheDocument();
    expect(called(PUT)).toHaveLength(0);
  });

  it('«Quitar imagen» la saca y se guarda sin ella; un extra que ya tenía imagen la muestra al editarlo', async () => {
    const { called } = mockApi(base(extra({ headerImage: headerRef() })), { session: ADMIN });
    renderAt(`/admin/extras/${EXTRA_ID}`);
    const alt = await screen.findByRole('textbox', { name: /Texto alternativo/ });
    expect(alt).toHaveValue('Una torre entre la niebla');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar imagen' }));
    expect(screen.getByText('Sin imagen.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(called(PUT)).toHaveLength(1));
    expect(called(PUT)[0]?.body).not.toHaveProperty('headerImage');
  });

  it('un peso enorme no se bloquea: avisa que ocupa espacio, pero se sube', async () => {
    mockApi(base(), { session: ADMIN });
    renderAt(`/admin/extras/${EXTRA_ID}`);
    await userEvent.upload(
      await screen.findByLabelText('Elegir archivo: Imagen al inicio (opcional)'),
      photo('enorme.jpg', 12 * 1024 * 1024),
    );
    expect(
      await screen.findByText(/pesa 12,0 MB: ocupa más espacio y puede tardar en cargar/),
    ).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Quitar imagen' });
  });

  it('la vista previa de la autora muestra la imagen arriba', async () => {
    mockApi(
      {
        ...base(extra({ headerImage: headerRef() })),
        [`GET /api/admin/extras/${EXTRA_ID}/preview`]: () =>
          json({
            kind: 'text',
            title: '[PLACEHOLDER] Capítulo uno',
            bodyHtml: '<p>Hola</p>',
            headerImage: {
              url: `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1600/${PUBLIC_ID}`,
              width: 1600,
              height: 800,
              alt: 'Una torre entre la niebla',
            },
          }),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/extras/${EXTRA_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: /Vista previa/ }));
    await screen.findByText(/Vista previa \(no cuenta/);
    // Dos imágenes con ese texto: la miniatura del formulario y la de la vista previa (la de 1600 px de ancho).
    const img = (await screen.findAllByAltText('Una torre entre la niebla')).find(
      (element) => element.getAttribute('width') === '1600',
    )!;
    expect(img).toHaveAttribute('width', '1600');
    expect(img).toHaveAttribute('src', expect.stringContaining('c_limit,w_1600'));
  });
});

describe('lector · extra con imagen al inicio', () => {
  const LIBRARY = {
    'GET /api/me/library': () => json({ books: [] }),
  };
  const header = {
    url: `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1600/${PUBLIC_ID}`,
    width: 1600,
    height: 800,
    alt: 'Una torre entre la niebla',
  };
  const open = (id: string, body: Record<string, unknown>) =>
    mockApi({ ...LIBRARY, [`GET /api/extras/${id}`]: () => json(body) });

  it('se ve ARRIBA del título, con alt, medidas reales y carga inmediata (sin diferir)', async () => {
    const id = 'a'.repeat(24);
    open(id, {
      kind: 'text',
      bookId: BOOK_ID,
      title: '[PLACEHOLDER] Texto',
      bodyHtml: '<p>Contenido</p>',
      headerImage: header,
    });
    renderAt(`/panel/extras/${id}`);
    const img = await screen.findByRole('img', { name: 'Una torre entre la niebla' });
    expect(img).toHaveAttribute('width', '1600');
    expect(img).toHaveAttribute('height', '800');
    expect(img).toHaveAttribute('src', header.url);
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    const title = screen.getByRole('heading', { level: 1, name: '[PLACEHOLDER] Texto' });
    // Imagen antes que el título en el documento (sin superponer texto).
    expect(img.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('también en un PDF, antes del botón de abrirlo', async () => {
    const id = 'c'.repeat(24);
    open(id, {
      kind: 'pdf',
      bookId: BOOK_ID,
      title: '[PLACEHOLDER] PDF',
      url: 'https://almacen.ejemplo.com/f.pdf?firma=1',
      mime: 'application/pdf',
      expiresIn: 180,
      headerImage: header,
    });
    renderAt(`/panel/extras/${id}`);
    const img = await screen.findByRole('img', { name: 'Una torre entre la niebla' });
    const link = screen.getByRole('link', { name: 'Abrir en otra pestaña' });
    expect(img.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sin imagen no cambia nada: ni imagen ni espacio reservado', async () => {
    const id = 'b'.repeat(24);
    open(id, {
      kind: 'text',
      bookId: BOOK_ID,
      title: '[PLACEHOLDER] Texto',
      bodyHtml: '<p>Hola</p>',
    });
    renderAt(`/panel/extras/${id}`);
    expect(await screen.findByText('Hola')).toBeInTheDocument();
    expect(screen.queryByTestId('extra-header-image')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
