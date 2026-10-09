import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { READER, apiError, empty, json, mockApi, renderAt } from '../../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const ADMIN = {
  id: '670000000000000000000003',
  name: 'Autora',
  email: 'a@ejemplo.com',
  role: 'ADMIN',
};
const EDITOR = { ...ADMIN, id: '670000000000000000000002', name: 'Editora', role: 'EDITOR' };
const USER_ID = '670000000000000000000001';
const stamp = '2026-10-01T10:00:00.000Z';
const person = (over: object = {}) => ({
  id: USER_ID,
  name: 'Lectora Uno',
  email: 'uno@ejemplo.com',
  role: 'USER',
  status: 'active',
  createdAt: stamp,
  completedQuizzes: 1,
  ...over,
});
const list = (users: object[], over: object = {}) => ({
  users,
  total: users.length,
  page: 1,
  pageSize: 20,
  totalQuizzes: 3,
  ...over,
});
const detail = (user = person()) => ({
  user,
  books: [
    {
      bookId: '670000000000000000000010',
      title: 'Libro Uno',
      quizzes: [
        {
          quizId: '670000000000000000000020',
          title: 'Quiz Uno',
          order: 1,
          status: 'completed',
          completedAt: stamp,
          resultTitle: 'El Faro',
          attempts: 2,
        },
        {
          quizId: '670000000000000000000021',
          title: 'Quiz Dos',
          order: 2,
          status: 'unlocked',
          attempts: 0,
        },
      ],
    },
  ],
});
const message = (over: object = {}) => ({
  id: '670000000000000000000040',
  name: 'Visitante',
  email: 'visita@ejemplo.com',
  message: 'Hola <b>autora</b>',
  createdAt: stamp,
  handled: false,
  ...over,
});

describe('menú y permisos del panel', () => {
  it('la administradora ve los enlaces nuevos (sin «pronto») y la editora no entra', async () => {
    mockApi({ 'GET /api/admin/users': () => json(list([person()])) }, { session: ADMIN });
    renderAt('/admin/usuarios');
    const menu = await screen.findByRole('navigation', { name: 'Administración' });
    for (const [name, href] of [
      ['Usuarios', '/admin/usuarios'],
      ['Mensajes de contacto', '/admin/mensajes'],
      ['Estadísticas', '/admin/estadisticas'],
      ['Ajustes del sitio', '/admin/ajustes'],
    ] as const) {
      expect(within(menu).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(within(menu).queryByText('pronto')).not.toBeInTheDocument();
  });

  it('una editora que abre /admin/usuarios no ve la pantalla ni llama al API de usuarios', async () => {
    const { called } = mockApi(
      { 'GET /api/admin/books': () => json({ books: [] }) },
      { session: EDITOR },
    );
    renderAt('/admin/usuarios');
    // El guard la saca de la ruta: aparece la ayuda de «sin permiso» o el inicio del panel, nunca la lista.
    await waitFor(() => expect(screen.queryByLabelText('Buscar por nombre o correo')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).toBeNull();
    expect(called('GET /api/admin/users?page=1')).toHaveLength(0);
  });
});

describe('usuarios', () => {
  it('lista con rol, estado y progreso, y busca enviando el texto al API', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/users?page=1': () =>
          json(
            list([
              person(),
              person({
                id: '2'.padStart(24, '0'),
                name: 'Editora Dos',
                email: 'dos@ejemplo.com',
                role: 'EDITOR',
                status: 'disabled',
                completedQuizzes: 0,
              }),
            ]),
          ),
        'GET /api/admin/users?q=dos&page=1': () => json(list([person({ name: 'Editora Dos' })])),
      },
      { session: ADMIN },
    );
    renderAt('/admin/usuarios');
    expect(
      await screen.findByRole('row', { name: /Lectora Uno.*Lectora.*Activa.*1 de 3/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /Editora Dos.*Editora.*Desactivada.*0 de 3/ }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar por nombre o correo'), 'dos');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(called('GET /api/admin/users?q=dos&page=1')).toHaveLength(1));
  });

  it('crea una cuenta de administración validando antes de llamar al API', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/users?page=1': () => json(list([])),
        'POST /api/admin/users': ({ body }) =>
          json(person({ ...(body as object), id: '3'.padStart(24, '0') }), 201),
      },
      { session: ADMIN },
    );
    renderAt('/admin/usuarios');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva cuenta de administración' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crear y enviar invitación' }));
    expect((await screen.findAllByText(/Escribe el nombre/)).length).toBeGreaterThan(0);
    expect(called('POST /api/admin/users')).toHaveLength(0);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nueva Editora');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'nueva@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Crear y enviar invitación' }));
    await waitFor(() => expect(called('POST /api/admin/users')).toHaveLength(1));
    expect(called('POST /api/admin/users')[0]?.body).toEqual({
      name: 'Nueva Editora',
      email: 'nueva@ejemplo.com',
      role: 'EDITOR',
    });
  });

  it('el detalle muestra el progreso por quiz, con resultado e intentos', async () => {
    mockApi({ [`GET /api/admin/users/${USER_ID}`]: () => json(detail()) }, { session: ADMIN });
    renderAt(`/admin/usuarios/${USER_ID}`);
    expect(await screen.findByRole('heading', { name: 'Lectora Uno' })).toBeInTheDocument();
    expect(screen.getByText(/Quiz 1 · Quiz Uno/)).toBeInTheDocument();
    expect(screen.getByText(/Resultado: El Faro.*2 intentos/)).toBeInTheDocument();
    expect(screen.getByText('Desbloqueado')).toBeInTheDocument();
    expect(screen.getByText(/Quiz 2 · Quiz Dos/)).toBeInTheDocument();
  });

  it('desactiva con confirmación y no llama al API si se cancela', async () => {
    const { called } = mockApi(
      {
        [`GET /api/admin/users/${USER_ID}`]: () => json(detail()),
        [`PATCH /api/admin/users/${USER_ID}`]: ({ body }) => json(person(body as object)),
      },
      { session: ADMIN },
    );
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderAt(`/admin/usuarios/${USER_ID}`);
    const button = await screen.findByRole('button', { name: 'Desactivar cuenta' });
    await userEvent.click(button);
    expect(called(`PATCH /api/admin/users/${USER_ID}`)).toHaveLength(0);
    await userEvent.click(button);
    await waitFor(() => expect(called(`PATCH /api/admin/users/${USER_ID}`)).toHaveLength(1));
    expect(called(`PATCH /api/admin/users/${USER_ID}`)[0]?.body).toEqual({ status: 'disabled' });
    confirm.mockRestore();
  });

  it('cambia el rol de la persona', async () => {
    const { called } = mockApi(
      {
        [`GET /api/admin/users/${USER_ID}`]: () => json(detail()),
        [`PATCH /api/admin/users/${USER_ID}`]: ({ body }) => json(person(body as object)),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/usuarios/${USER_ID}`);
    await userEvent.selectOptions(await screen.findByLabelText('Rol'), 'EDITOR');
    await waitFor(() => expect(called(`PATCH /api/admin/users/${USER_ID}`)).toHaveLength(1));
    expect(called(`PATCH /api/admin/users/${USER_ID}`)[0]?.body).toEqual({ role: 'EDITOR' });
  });

  it('elimina a una lectora tras confirmar y vuelve a la lista; muestra el error del servidor', async () => {
    const { called } = mockApi(
      {
        [`GET /api/admin/users/${USER_ID}`]: () => json(detail()),
        [`DELETE /api/admin/users/${USER_ID}`]: () => empty(),
        'GET /api/admin/users?page=1': () => json(list([])),
      },
      { session: ADMIN },
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt(`/admin/usuarios/${USER_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    await waitFor(() => expect(called(`DELETE /api/admin/users/${USER_ID}`)).toHaveLength(1));
    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
  });

  it('en una cuenta de administración no ofrece eliminar, y en la propia no deja cambiar nada', async () => {
    mockApi(
      {
        [`GET /api/admin/users/${ADMIN.id}`]: () =>
          json(detail(person({ id: ADMIN.id, name: 'Autora', role: 'ADMIN' }))),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/usuarios/${ADMIN.id}`);
    expect(await screen.findByText(/no puedes cambiar tu propio rol/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar cuenta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desactivar cuenta' })).toBeNull();
  });

  it('una cuenta de administración ajena se desactiva pero no se elimina', async () => {
    mockApi(
      {
        [`GET /api/admin/users/${EDITOR.id}`]: () =>
          json(detail(person({ id: EDITOR.id, name: 'Editora', role: 'EDITOR' }))),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/usuarios/${EDITOR.id}`);
    expect(await screen.findByRole('button', { name: 'Desactivar cuenta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar cuenta' })).toBeNull();
    expect(screen.getByText(/se desactivan/)).toBeInTheDocument();
  });

  it('muestra el error cuando es la última administradora', async () => {
    mockApi(
      {
        [`GET /api/admin/users/${EDITOR.id}`]: () =>
          json(detail(person({ id: EDITOR.id, name: 'Otra Admin', role: 'ADMIN' }))),
        [`PATCH /api/admin/users/${EDITOR.id}`]: () =>
          apiError('VALIDATION', 'Debe quedar al menos una administradora activa', 400),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/usuarios/${EDITOR.id}`);
    await userEvent.selectOptions(await screen.findByLabelText('Rol'), 'EDITOR');
    expect(await screen.findByText(/al menos una administradora activa/)).toBeInTheDocument();
  });
});

describe('mensajes de contacto', () => {
  it('muestra los pendientes como texto (sin interpretar HTML) y marca atendido', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/contact-messages?status=unhandled&page=1': () =>
          json({ messages: [message()], total: 1, unhandled: 1, page: 1, pageSize: 20 }),
        'PATCH /api/admin/contact-messages/670000000000000000000040': ({ body }) =>
          json(message(body as object)),
      },
      { session: ADMIN },
    );
    renderAt('/admin/mensajes');
    expect(await screen.findByText('Hola <b>autora</b>')).toBeInTheDocument();
    expect(document.querySelector('article b')).toBeNull();
    expect(screen.getByText(/1 sin atender/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Marcar atendido' }));
    await waitFor(() =>
      expect(called('PATCH /api/admin/contact-messages/670000000000000000000040')).toHaveLength(1),
    );
    expect(called('PATCH /api/admin/contact-messages/670000000000000000000040')[0]?.body).toEqual({
      handled: true,
    });
  });

  it('elimina con confirmación (si se cancela no llama al API)', async () => {
    const id = '670000000000000000000040';
    const { called } = mockApi(
      {
        'GET /api/admin/contact-messages?status=unhandled&page=1': () =>
          json({ messages: [message()], total: 1, unhandled: 1, page: 1, pageSize: 20 }),
        [`DELETE /api/admin/contact-messages/${id}`]: () => empty(),
      },
      { session: ADMIN },
    );
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderAt('/admin/mensajes');
    const button = await screen.findByRole('button', { name: 'Eliminar' });
    await userEvent.click(button);
    expect(called(`DELETE /api/admin/contact-messages/${id}`)).toHaveLength(0);
    await userEvent.click(button);
    await waitFor(() => expect(called(`DELETE /api/admin/contact-messages/${id}`)).toHaveLength(1));
    confirm.mockRestore();
  });

  it('avisa cuando la bandeja está vacía', async () => {
    mockApi(
      {
        'GET /api/admin/contact-messages?status=unhandled&page=1': () =>
          json({ messages: [], total: 0, unhandled: 0, page: 1, pageSize: 20 }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/mensajes');
    expect(await screen.findByText('No hay mensajes en esta bandeja')).toBeInTheDocument();
  });
});

describe('estadísticas', () => {
  it('muestra los totales y la distribución de resultados por quiz', async () => {
    mockApi(
      {
        'GET /api/admin/stats': () =>
          json({
            readers: { total: 12, last7Days: 3, last30Days: 8, disabled: 1 },
            staff: 2,
            attempts: { completed: 30, inProgress: 4 },
            booksCompleted: 5,
            unhandledMessages: 6,
            quizzes: [
              {
                quizId: '670000000000000000000020',
                title: 'Quiz Uno',
                bookTitle: 'Libro Uno',
                order: 1,
                completedUsers: 10,
                attempts: 12,
                results: [
                  { key: 'r1', title: 'El Faro', count: 8 },
                  { key: 'r2', title: 'La Isla', count: 4 },
                ],
              },
            ],
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/estadisticas');
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText(/3 esta semana · 8 este mes · 1 desactivadas/)).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText(/Libro Uno · Quiz 1 · Quiz Uno/)).toBeInTheDocument();
    expect(screen.getByText(/10 personas · 12 intentos completados/)).toBeInTheDocument();
    expect(screen.getByText('El Faro')).toBeInTheDocument();
    expect(screen.getByText('La Isla')).toBeInTheDocument();
  });
});

describe('ajustes del sitio (contacto)', () => {
  const settings = (contact: object) => ({
    welcome: { enabled: false, showMode: 'every_login', bodyHtml: '' },
    universe: { introHtml: '' },
    author: { bioHtml: '' },
    social: [],
    lock: {},
    contact,
  });

  it('carga lo guardado y guarda solo la sección de contacto', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/site-settings': () =>
          json(
            settings({
              recipientEmail: 'autora@ejemplo.com',
              storeMessages: true,
              retentionDays: 90,
            }),
          ),
        'PATCH /api/admin/site-settings': ({ body }) =>
          json(settings((body as { contact: object }).contact)),
      },
      { session: ADMIN },
    );
    renderAt('/admin/ajustes');
    const email = await screen.findByLabelText(/Correo donde llegan/);
    expect(email).toHaveValue('autora@ejemplo.com');
    await userEvent.click(screen.getByLabelText(/Guardar los mensajes en el panel/));
    await userEvent.clear(screen.getByLabelText(/Días que se guardan/));
    await userEvent.type(screen.getByLabelText(/Días que se guardan/), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(called('PATCH /api/admin/site-settings')[0]?.body).toEqual({
      contact: { recipientEmail: 'autora@ejemplo.com', storeMessages: false, retentionDays: 30 },
    });
  });

  it('sin correo propio guarda sin él (vuelve al del desarrollador)', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/site-settings': () =>
          json(settings({ storeMessages: true, retentionDays: 365 })),
        'PATCH /api/admin/site-settings': ({ body }) =>
          json(settings((body as { contact: object }).contact)),
      },
      { session: ADMIN },
    );
    renderAt('/admin/ajustes');
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(called('PATCH /api/admin/site-settings')[0]?.body).toEqual({
      contact: { storeMessages: true, retentionDays: 365 },
    });
  });

  it('no guarda un correo o unos días inválidos', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/site-settings': () =>
          json(settings({ storeMessages: true, retentionDays: 365 })),
      },
      { session: ADMIN },
    );
    renderAt('/admin/ajustes');
    await userEvent.type(await screen.findByLabelText(/Correo donde llegan/), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(called('PATCH /api/admin/site-settings')).toHaveLength(0);
  });
});

describe('eliminar mi cuenta (lectora)', () => {
  it('pide la contraseña, la envía y recarga en el inicio', async () => {
    const { called } = mockApi({ 'DELETE /api/me': () => empty() }, { session: READER });
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    renderAt('/panel/cuenta');
    await userEvent.click(await screen.findByRole('button', { name: /Eliminar mi cuenta…/ }));
    const submit = screen.getByRole('button', { name: 'Eliminar mi cuenta para siempre' });
    expect(submit).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/Tu contraseña, para confirmar/),
      'Nube-Azul-Cuatro-87',
    );
    await userEvent.click(submit);
    await waitFor(() => expect(called('DELETE /api/me')).toHaveLength(1));
    expect(called('DELETE /api/me')[0]?.body).toEqual({ password: 'Nube-Azul-Cuatro-87' });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('con contraseña incorrecta se queda en la pantalla y lo dice', async () => {
    mockApi(
      { 'DELETE /api/me': () => apiError('VALIDATION', 'La contraseña no es correcta', 400) },
      { session: READER },
    );
    renderAt('/panel/cuenta');
    await userEvent.click(await screen.findByRole('button', { name: /Eliminar mi cuenta…/ }));
    await userEvent.type(screen.getByLabelText(/Tu contraseña, para confirmar/), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta para siempre' }));
    expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument();
  });
});
