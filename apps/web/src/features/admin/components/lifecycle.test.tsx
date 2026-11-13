import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { READER, apiError, empty, json, mockApi, renderAt } from '../../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

/**
 * Archivar, restaurar y eliminar definitivamente desde las listas y los formularios: los botones visibles, quién ve
 * «Eliminar definitivamente» (solo ADMIN y solo con lo archivado o en borrador), la confirmación (qué se borra y que no se
 * puede deshacer), el teclado y los mensajes del servidor cuando algo lo impide.
 */
const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Marisol Quesada', role: 'ADMIN' };
const EDITOR = { ...ADMIN, id: '670000000000000000000003', name: 'Editor', role: 'EDITOR' };
const STAMP = '2026-10-01T15:00:00.000Z';
const id = (n: number) => String(n).padStart(24, '0');

const post = (n: number, status: string, title: string) => ({
  id: id(n),
  slug: `post-${n}`,
  title,
  template: 'text',
  category: 'novedad',
  excerpt: '',
  featured: false,
  status,
  publishedAt: STAMP,
  createdAt: STAMP,
  updatedAt: STAMP,
  data: { bodyHtml: '' },
});
const POSTS = {
  'GET /api/admin/posts': () =>
    json({
      posts: [
        post(1, 'published', 'Feria publicada'),
        post(2, 'draft', 'Un borrador'),
        post(3, 'archived', 'Una vieja'),
      ],
    }),
};
const row = async (name: RegExp) => within(await screen.findByRole('row', { name }));

describe('actualizaciones: lista', () => {
  it('Archivar o Restaurar siempre; Eliminar definitivamente solo en borrador o archivada (nunca en lo publicado)', async () => {
    mockApi(POSTS, { session: ADMIN });
    renderAt('/admin/actualizaciones');
    const published = await row(/Feria publicada/);
    expect(published.getByRole('button', { name: /^Archivar/ })).toBeInTheDocument();
    expect(published.queryByRole('button', { name: /Restaurar/ })).toBeNull();
    expect(published.queryByRole('button', { name: /Eliminar definitivamente/ })).toBeNull();

    const draft = await row(/Un borrador/);
    expect(draft.getByRole('button', { name: /^Archivar/ })).toBeInTheDocument();
    expect(draft.getByRole('button', { name: /Eliminar definitivamente/ })).toBeInTheDocument();

    const archived = await row(/Una vieja/);
    expect(archived.getByRole('button', { name: /^Restaurar/ })).toBeInTheDocument();
    expect(archived.queryByRole('button', { name: /^Archivar/ })).toBeNull();
    expect(archived.getByRole('button', { name: /Eliminar definitivamente/ })).toBeInTheDocument();
  });

  it('un editor puede archivar y restaurar, pero nunca ve «Eliminar definitivamente»', async () => {
    mockApi(POSTS, { session: EDITOR });
    renderAt('/admin/actualizaciones');
    await screen.findByRole('row', { name: /Un borrador/ });
    expect(screen.getAllByRole('button', { name: /Archivar|Restaurar/ }).length).toBe(3);
    expect(screen.queryByRole('button', { name: /Eliminar definitivamente/ })).toBeNull();
  });

  it('Archivar llama al servidor, avisa cómo deshacerlo y vuelve a pedir la lista', async () => {
    const api = mockApi(
      {
        ...POSTS,
        [`POST /api/admin/posts/${id(1)}/archive`]: () =>
          json(post(1, 'archived', 'Feria publicada')),
      },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones');
    const published = await row(/Feria publicada/);
    await userEvent.click(published.getByRole('button', { name: /^Archivar/ }));
    expect(
      await screen.findByText(
        /La actualización quedó archivada: ya no se ve en público\. Puedes restaurarla/,
      ),
    ).toBeInTheDocument();
    expect(api.called(`POST /api/admin/posts/${id(1)}/archive`)).toHaveLength(1);
    await waitFor(() => expect(api.called('GET /api/admin/posts').length).toBeGreaterThan(1));
  });

  it('Restaurar avisa que vuelve como borrador', async () => {
    mockApi(
      {
        ...POSTS,
        [`POST /api/admin/posts/${id(3)}/restore`]: () => json(post(3, 'draft', 'Una vieja')),
      },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones');
    await userEvent.click((await row(/Una vieja/)).getByRole('button', { name: /^Restaurar/ }));
    expect(await screen.findByText(/vuelve como borrador/)).toBeInTheDocument();
  });

  it('Eliminar pide confirmación que dice qué se borra y que no se puede deshacer; cancelar no borra nada', async () => {
    const api = mockApi(
      { ...POSTS, [`DELETE /api/admin/posts/${id(2)}`]: () => empty() },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones');
    await userEvent.click(
      (await row(/Un borrador/)).getByRole('button', { name: /Eliminar definitivamente/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: '¿Eliminar definitivamente «Un borrador»?',
    });
    expect(
      within(dialog).getByText(/Se borrará la actualización y todo lo que escribiste/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('No se puede deshacer.')).toBeInTheDocument();
    expect(within(dialog).getByText(/no se borran de Cloudinary/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(api.called(`DELETE /api/admin/posts/${id(2)}`)).toHaveLength(0);

    await userEvent.click(
      (await row(/Un borrador/)).getByRole('button', { name: /Eliminar definitivamente/ }),
    );
    const again = await screen.findByRole('dialog', { name: /Eliminar definitivamente/ });
    await userEvent.click(within(again).getByRole('button', { name: 'Eliminar definitivamente' }));
    await waitFor(() => expect(api.called(`DELETE /api/admin/posts/${id(2)}`)).toHaveLength(1));
    expect(await screen.findByText(/se eliminó definitivamente/)).toBeInTheDocument();
  });

  it('con el teclado: Enter en el botón abre la confirmación y Cancelar con Enter la cierra sin borrar', async () => {
    const api = mockApi(POSTS, { session: ADMIN });
    renderAt('/admin/actualizaciones');
    const button = (await row(/Un borrador/)).getByRole('button', {
      name: /Eliminar definitivamente/,
    });
    button.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: /Eliminar definitivamente/ });
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
    cancel.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.called(`DELETE /api/admin/posts/${id(2)}`)).toHaveLength(0);
  });

  it('si el servidor lo bloquea (409), muestra su mensaje y la actualización sigue en la lista', async () => {
    mockApi(
      {
        ...POSTS,
        [`DELETE /api/admin/posts/${id(3)}`]: () =>
          apiError(
            'CONFLICT',
            'Esta actualización ya se avisó por correo: se conserva el registro de ese envío, así que no se puede eliminar. Déjala archivada.',
            409,
          ),
      },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones');
    await userEvent.click(
      (await row(/Una vieja/)).getByRole('button', { name: /Eliminar definitivamente/ }),
    );
    const dialog = await screen.findByRole('dialog', { name: /Eliminar definitivamente/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));
    expect(await screen.findByText(/ya se avisó por correo/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Una vieja/ })).toBeInTheDocument();
  });
});

describe('actualizaciones: formulario', { timeout: 30_000 }, () => {
  const open = (status: string, session = ADMIN) => {
    const api = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/posts/${id(2)}`]: () => json(post(2, status, 'Un borrador')),
        ...POSTS,
        [`DELETE /api/admin/posts/${id(2)}`]: () => empty(),
        [`POST /api/admin/posts/${id(2)}/archive`]: () => json(post(2, 'archived', 'Un borrador')),
      },
      { session },
    );
    renderAt(`/admin/actualizaciones/${id(2)}`);
    return api;
  };

  it('tiene la sección «Archivar o eliminar» con los botones a la vista', async () => {
    open('draft');
    expect(await screen.findByRole('heading', { name: 'Archivar o eliminar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archivar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar definitivamente' })).toBeEnabled();
  });

  it('lo publicado: solo Archivar (no se puede eliminar)', async () => {
    open('published');
    expect(await screen.findByRole('button', { name: 'Archivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar definitivamente' })).toBeNull();
  });

  it('un editor ve la sección sin «Eliminar definitivamente» y con la nota de que eso es del administrador', async () => {
    open('draft', EDITOR);
    expect(await screen.findByRole('button', { name: 'Archivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar definitivamente' })).toBeNull();
    expect(screen.getByText(/lo hace solo un administrador/)).toBeInTheDocument();
  });

  it('con cambios sin guardar los botones quedan apagados y lo explican', async () => {
    open('draft');
    const title = await screen.findByRole('textbox', { name: /^Título( \*)?$/ });
    await userEvent.type(title, 'x');
    expect(screen.getByRole('button', { name: 'Archivar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar definitivamente' })).toBeDisabled();
    expect(
      screen.getByText(/Guarda o descarta tus cambios antes de archivar o eliminar/),
    ).toBeInTheDocument();
  });

  it('eliminar desde el formulario confirma, borra y vuelve a la lista', async () => {
    const api = open('draft');
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar definitivamente' }));
    const dialog = await screen.findByRole('dialog', {
      name: /Eliminar definitivamente «Un borrador»/,
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));
    await waitFor(() => expect(api.called(`DELETE /api/admin/posts/${id(2)}`)).toHaveLength(1));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Actualizaciones' }),
    ).toBeInTheDocument();
  });

  it('archivar desde el formulario actualiza la pantalla: pasa a «Restaurar» y aparece Eliminar', async () => {
    let status = 'published';
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/posts/${id(1)}`]: () => json(post(1, status, 'Feria publicada')),
        [`POST /api/admin/posts/${id(1)}/archive`]: () => {
          status = 'archived';
          return json(post(1, status, 'Feria publicada'));
        },
      },
      { session: ADMIN },
    );
    renderAt(`/admin/actualizaciones/${id(1)}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }));
    expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar definitivamente' })).toBeInTheDocument();
    // El selector de estado del formulario refleja lo guardado (no pisaría el estado al guardar).
    expect(screen.getByLabelText('Estado')).toHaveValue('archived');
  });
});

describe('reseñas: archivar es ocultar y solo lo archivado se elimina', () => {
  const review = (n: number, status: string, authorName: string) => ({
    id: id(n),
    text: 'Me encantó',
    authorName,
    rating: 5,
    order: n,
    status,
    createdAt: STAMP,
    updatedAt: STAMP,
  });
  it('una publicada se archiva; una archivada se restaura o se elimina', async () => {
    mockApi(
      {
        'GET /api/admin/reviews': () =>
          json({ reviews: [review(1, 'published', 'Ana'), review(2, 'hidden', 'Beto')] }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/resenas');
    const published = await row(/Ana/);
    expect(published.getByRole('button', { name: /^Archivar/ })).toBeInTheDocument();
    expect(published.queryByRole('button', { name: /Eliminar definitivamente/ })).toBeNull();
    const archived = await row(/Beto.*Archivada/);
    expect(archived.getByRole('button', { name: /^Restaurar/ })).toBeInTheDocument();
    expect(archived.getByRole('button', { name: /Eliminar definitivamente/ })).toBeInTheDocument();
  });
});

describe('fan arts y capítulos extra', () => {
  const image = {
    provider: 'cloudinary',
    publicId: 'libro/arte',
    deliveryType: 'upload',
    url: 'https://res.cloudinary.com/demo/image/upload/libro/arte.png',
    width: 600,
    height: 600,
    alt: 'Dibujo',
  };
  it('fan arts: borrador y archivado se pueden eliminar; publicado solo se archiva', async () => {
    const art = (n: number, status: string, title: string) => ({
      id: id(n),
      title,
      image,
      artistName: 'Ana',
      permissionConfirmed: true,
      order: n,
      status,
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    mockApi(
      {
        'GET /api/admin/fan-arts': () =>
          json({
            fanArts: [
              art(1, 'published', 'Uno'),
              art(2, 'draft', 'Dos'),
              art(3, 'archived', 'Tres'),
            ],
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/fan-arts');
    expect((await row(/Uno/)).queryByRole('button', { name: /Eliminar/ })).toBeNull();
    expect(
      (await row(/Dos/)).getByRole('button', { name: /Eliminar definitivamente/ }),
    ).toBeInTheDocument();
    expect((await row(/Tres/)).getByRole('button', { name: /^Restaurar/ })).toBeInTheDocument();
  });

  it('capítulos extra: la misma regla, en masculino', async () => {
    const BOOK = { ...READER, id: id(70) };
    void BOOK;
    const extra = (n: number, status: string, title: string) => ({
      id: id(n),
      bookId: id(70),
      slug: `extra-${n}`,
      title,
      kind: 'text',
      bodyHtml: '<p>x</p>',
      order: n,
      status,
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    mockApi(
      {
        'GET /api/admin/books': () =>
          json({
            books: [
              {
                id: id(70),
                slug: 'libro-1',
                title: '[PLACEHOLDER] Libro 1',
                order: 1,
                status: 'published',
                synopsis: '',
                genres: [],
                purchaseLinks: [],
                showInReaderPanel: false,
                wikiSections: [],
                createdAt: STAMP,
                updatedAt: STAMP,
              },
            ],
          }),
        [`GET /api/admin/extras?bookId=${id(70)}`]: () =>
          json({ extras: [extra(1, 'published', 'Uno'), extra(2, 'archived', 'Dos')] }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/extras');
    expect((await row(/Uno/)).getByRole('button', { name: /^Archivar/ })).toBeInTheDocument();
    expect((await row(/Uno/)).queryByRole('button', { name: /Eliminar/ })).toBeNull();
    expect((await row(/Dos/)).getByRole('button', { name: /^Restaurar/ })).toBeInTheDocument();
    expect(
      (await row(/Dos/)).getByRole('button', { name: /Eliminar definitivamente/ }),
    ).toBeInTheDocument();
  });
});
