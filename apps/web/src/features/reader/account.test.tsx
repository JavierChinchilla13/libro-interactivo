import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK_ID, READER, apiError, empty, json, mockApi, renderAt } from '../../test/mockApi';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const NO_SESSION = { session: null } as const;
const GOOD = 'Nube-Azul-Cuatro-87';

describe('registro', () => {
  it('avisa por campo con los mensajes del servidor y no llama al API si algo está mal', async () => {
    const { called } = mockApi({}, NO_SESSION);
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Ana');
    await userEvent.type(screen.getByLabelText(/Correo/), 'ana@ejemplo');
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Escribe un correo válido')).toBeInTheDocument();
    expect(
      screen.getAllByText('Esa contraseña es demasiado común. Elige otra.').length,
    ).toBeGreaterThan(0);
    expect(called('POST /api/auth/register')).toHaveLength(0);
  });

  it('el medidor de seguridad se actualiza al escribir', async () => {
    mockApi({}, NO_SESSION);
    renderAt('/registro');
    const meter = await screen.findByTestId('password-meter');
    expect(meter).toHaveTextContent('Mínimo 10 caracteres');
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'corta');
    expect(meter).toHaveTextContent('al menos 10 caracteres');
    await userEvent.clear(screen.getByLabelText(/Contraseña/));
    await userEvent.type(screen.getByLabelText(/Contraseña/), GOOD);
    expect(meter).toHaveTextContent('Seguridad: muy buena');
  });

  it('crea la cuenta y lleva al panel; con un QR pendiente vuelve a él', async () => {
    mockApi({ 'POST /api/auth/register': () => json({ user: READER }, 201) }, NO_SESSION);
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'lectora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    // Tras registrarse, la sesión queda activa y el panel se muestra.
    expect(await screen.findByRole('navigation', { name: 'Panel' })).toBeInTheDocument();
  });

  it('un correo ya registrado da el mensaje genérico', async () => {
    mockApi({ 'POST /api/auth/register': () => apiError('CONFLICT', 'x', 409) }, NO_SESSION);
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'lectora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo completar el registro. Si ya tienes una cuenta',
    );
  });

  it('con sesión iniciada /registro redirige al panel', async () => {
    mockApi();
    renderAt('/registro');
    expect(await screen.findByRole('navigation', { name: 'Panel' })).toBeInTheDocument();
  });
});

describe('recuperar contraseña', () => {
  it('«olvidé mi contraseña» responde siempre igual, exista o no el correo', async () => {
    const { called } = mockApi(
      { 'POST /api/auth/forgot-password': () => json({ message: 'ok' }, 200) },
      NO_SESSION,
    );
    renderAt('/olvide-mi-contrasena');
    await userEvent.type(await screen.findByLabelText(/Correo/), 'cualquiera@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(
      await screen.findByText(/Si el correo está registrado, te enviamos un enlace/),
    ).toBeInTheDocument();
    expect(called('POST /api/auth/forgot-password')[0]?.body).toEqual({
      email: 'cualquiera@ejemplo.com',
    });
  });

  it('valida el correo antes de enviar', async () => {
    const { called } = mockApi({}, NO_SESSION);
    renderAt('/olvide-mi-contrasena');
    await userEvent.type(await screen.findByLabelText(/Correo/), 'sin-arroba');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText('Escribe un correo válido')).toBeInTheDocument();
    expect(called('POST /api/auth/forgot-password')).toHaveLength(0);
  });

  it('restablecer: envía el token de la dirección con la nueva contraseña y confirma', async () => {
    const { called } = mockApi(
      { 'POST /api/auth/reset-password': () => json({ message: 'ok' }) },
      NO_SESSION,
    );
    renderAt('/restablecer/' + 'a'.repeat(43));
    await userEvent.type(await screen.findByLabelText(/^Nueva contraseña/), GOOD);
    await userEvent.type(screen.getByLabelText(/Repite/), GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(
      await screen.findByText('Tu contraseña se actualizó. Ya puedes iniciar sesión.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a ingresar' })).toHaveAttribute(
      'href',
      '/ingresar',
    );
    expect(called('POST /api/auth/reset-password')[0]?.body).toEqual({
      token: 'a'.repeat(43),
      newPassword: GOOD,
      newPasswordConfirm: GOOD,
    });
  });

  it('restablecer: contraseñas distintas o débiles se avisan sin gastar el enlace', async () => {
    const { called } = mockApi({}, NO_SESSION);
    renderAt('/restablecer/' + 'a'.repeat(43));
    await userEvent.type(await screen.findByLabelText(/^Nueva contraseña/), GOOD);
    await userEvent.type(screen.getByLabelText(/Repite/), GOOD + 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(called('POST /api/auth/reset-password')).toHaveLength(0);
  });

  it('un enlace inválido, usado o caducado siempre dice lo mismo y ofrece pedir otro', async () => {
    mockApi(
      { 'POST /api/auth/reset-password': () => apiError('TOKEN_INVALID', 'x', 400) },
      NO_SESSION,
    );
    renderAt('/restablecer/' + 'b'.repeat(43));
    await userEvent.type(await screen.findByLabelText(/^Nueva contraseña/), GOOD);
    await userEvent.type(screen.getByLabelText(/Repite/), GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(
      await screen.findByText('El enlace no es válido o ya caducó. Solicita uno nuevo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute(
      'href',
      '/olvide-mi-contrasena',
    );
  });
});

describe('mi cuenta', () => {
  it('cambia el nombre (el correo no se puede cambiar)', async () => {
    const { called } = mockApi({
      'PATCH /api/me': () => json({ user: { ...READER, name: 'Nuevo Nombre' } }),
    });
    renderAt('/panel/cuenta');
    const name = await screen.findByLabelText('Nombre');
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('readonly');
    await userEvent.clear(name);
    await userEvent.type(name, 'Nuevo Nombre');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(await screen.findByText('Nombre actualizado')).toBeInTheDocument();
    expect(called('PATCH /api/me')[0]?.body).toEqual({ name: 'Nuevo Nombre' });
  });

  it('cambia la contraseña: avisa de éxito y de qué pasó con las otras sesiones', async () => {
    const { called } = mockApi({ 'POST /api/auth/change-password': () => json({ message: 'ok' }) });
    renderAt('/panel/cuenta');
    await userEvent.type(await screen.findByLabelText(/^Contraseña actual/), 'Sol-Rojo-Siete-91x');
    await userEvent.type(screen.getByLabelText(/^Nueva contraseña/), GOOD);
    await userEvent.type(screen.getByLabelText(/^Repite la nueva contraseña/), GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Tu contraseña se actualizó')).toBeInTheDocument();
    expect(screen.getByText(/cerramos tus otras sesiones/)).toBeInTheDocument();
    expect(called('POST /api/auth/change-password')[0]?.body).toMatchObject({
      currentPassword: 'Sol-Rojo-Siete-91x',
      newPassword: GOOD,
    });
    expect(screen.getByLabelText(/^Contraseña actual/)).toHaveValue(''); // los campos se limpian
  });

  it('una contraseña actual incorrecta se marca en su campo', async () => {
    mockApi({
      'POST /api/auth/change-password': () =>
        apiError('VALIDATION', 'La contraseña actual no es correcta', 400),
    });
    renderAt('/panel/cuenta');
    await userEvent.type(await screen.findByLabelText(/^Contraseña actual/), 'incorrecta-123');
    await userEvent.type(screen.getByLabelText(/^Nueva contraseña/), GOOD);
    await userEvent.type(screen.getByLabelText(/^Repite la nueva contraseña/), GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
  });

  it('cerrar sesión lleva a ingresar', async () => {
    mockApi({ 'POST /api/auth/logout': () => empty() });
    renderAt('/panel/cuenta');
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
  });
});

describe('mensaje de bienvenida', () => {
  const welcome = {
    show: true,
    title: '[PLACEHOLDER] Bienvenida',
    bodyHtml: '<p>[PLACEHOLDER] El pacto</p>',
  };

  it('aparece sobre el panel; «¡A la aventura!» lo cierra y avisa al servidor', async () => {
    const { called } = mockApi({ 'GET /api/me/welcome': () => json(welcome) });
    renderAt('/panel');
    const dialog = await screen.findByRole('dialog', { name: '[PLACEHOLDER] Bienvenida' });
    expect(within(dialog).getByText('[PLACEHOLDER] El pacto')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '¡A la aventura!' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(called('POST /api/me/welcome-seen')).toHaveLength(1);
  });

  it('Escape también lo cierra', async () => {
    const { called } = mockApi({ 'GET /api/me/welcome': () => json(welcome) });
    renderAt('/panel');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(called('POST /api/me/welcome-seen')).toHaveLength(1);
  });

  it('si el servidor dice que no toca, no aparece; y el HTML se muestra saneado', async () => {
    mockApi();
    renderAt('/panel');
    await screen.findByRole('navigation', { name: 'Panel' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
    mockApi({
      'GET /api/me/welcome': () =>
        json({ show: true, bodyHtml: '<p>Hola</p><script>alert(1)</script>' }),
    });
    const { container } = renderAt('/panel');
    await screen.findAllByRole('dialog');
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('extras del lector', () => {
  const extrasKey = `GET /api/extras?bookId=${BOOK_ID}`;
  const progress = () =>
    json({
      bookId: BOOK_ID,
      bookCompleted: false,
      experiences: [
        {
          kind: 'quiz',
          id: '1'.repeat(24),
          title: 'Q1',
          order: 1,
          status: 'completed',
          inProgress: false,
          allowRetake: true,
        },
        {
          kind: 'quiz',
          id: '2'.repeat(24),
          title: 'Q2',
          order: 2,
          status: 'available',
          inProgress: false,
          allowRetake: true,
        },
        {
          kind: 'quiz',
          id: '3'.repeat(24),
          title: 'Q3',
          order: 3,
          status: 'locked',
          inProgress: false,
          allowRetake: true,
        },
      ],
    });

  it('bloqueados: solo el aviso y cuánto falta, sin títulos ni cantidad', async () => {
    mockApi({
      [extrasKey]: () => json({ locked: true }),
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress,
    });
    renderAt('/panel/extras');
    expect(await screen.findByText('Aún están bloqueados')).toBeInTheDocument();
    expect(await screen.findByText('1 de 3')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir/ })).not.toBeInTheDocument();
  });

  it('abiertos: lista con tipo y «Visto»', async () => {
    mockApi({
      [extrasKey]: () =>
        json({
          locked: false,
          extras: [
            {
              id: 'a'.repeat(24),
              title: '[PLACEHOLDER] Capítulo extra 1',
              kind: 'pdf',
              order: 1,
              opened: true,
            },
            {
              id: 'b'.repeat(24),
              title: '[PLACEHOLDER] Texto extra',
              description: 'Sin spoilers',
              kind: 'text',
              order: 2,
              opened: false,
            },
          ],
        }),
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress,
    });
    renderAt('/panel/extras');
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Capítulo extra 1' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Visto')).toBeInTheDocument();
    expect(screen.getByText('Sin spoilers')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Abrir\s*\[PLACEHOLDER\] Texto extra/ }),
    ).toHaveAttribute('href', `/panel/extras/${'b'.repeat(24)}`);
  });

  it('abrir un texto lo muestra saneado; un extra bloqueado (403) no entrega nada', async () => {
    mockApi({
      [`GET /api/extras/${'a'.repeat(24)}`]: () =>
        json({
          kind: 'text',
          title: '[PLACEHOLDER] Texto',
          bodyHtml: '<p>Contenido</p><script>alert(1)</script>',
        }),
      [`GET /api/extras/${'b'.repeat(24)}`]: () => apiError('NOT_UNLOCKED', 'x', 403),
    });
    const { container } = renderAt(`/panel/extras/${'a'.repeat(24)}`);
    expect(await screen.findByText('Contenido')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    vi.unstubAllGlobals();
    mockApi({ [`GET /api/extras/${'b'.repeat(24)}`]: () => apiError('NOT_UNLOCKED', 'x', 403) });
    renderAt(`/panel/extras/${'b'.repeat(24)}`);
    expect(await screen.findByRole('heading', { name: 'Aún está bloqueado' })).toBeInTheDocument();
  });

  it('un PDF se abre con su enlace temporal; cuando caduca ofrece reintentar y pide uno nuevo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let n = 0;
    mockApi({
      [`GET /api/extras/${'c'.repeat(24)}`]: () => {
        n += 1;
        return json({
          kind: 'pdf',
          title: '[PLACEHOLDER] PDF',
          url: `https://almacen.ejemplo.com/f.pdf?firma=${n}`,
          mime: 'application/pdf',
          expiresIn: 180,
        });
      },
    });
    renderAt(`/panel/extras/${'c'.repeat(24)}`);
    const link = await screen.findByRole('link', { name: 'Abrir en otra pestaña' });
    expect(link).toHaveAttribute('href', 'https://almacen.ejemplo.com/f.pdf?firma=1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await vi.advanceTimersByTimeAsync(171_000);
    expect(await screen.findByText('El enlace del documento caducó')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir en otra pestaña' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      (await screen.findByRole('link', { name: 'Abrir en otra pestaña' })).getAttribute('href'),
    ).toBe('https://almacen.ejemplo.com/f.pdf?firma=2');
    vi.useRealTimers();
  });
});

describe('resultados del lector', () => {
  const quizId = '4'.repeat(24);

  it('lista el resultado vigente de cada quiz y vacío da una guía', async () => {
    mockApi({
      [`GET /api/me/results?bookId=${BOOK_ID}`]: () =>
        json({
          results: [
            {
              quizId,
              title: '[PLACEHOLDER] Quiz 1',
              order: 1,
              attemptsCompleted: 2,
              completedAt: '2026-10-06T12:00:00.000Z',
              resultTitle: '[PLACEHOLDER] Resultado B',
            },
          ],
        }),
    });
    renderAt('/panel/resultados');
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Resultado B' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 intentos/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver/ })).toHaveAttribute(
      'href',
      `/panel/resultados/${quizId}`,
    );
    vi.unstubAllGlobals();
    mockApi({ [`GET /api/me/results?bookId=${BOOK_ID}`]: () => json({ results: [] }) });
    renderAt('/panel/resultados');
    expect(await screen.findAllByText('Todavía no tienes resultados')).not.toHaveLength(0);
  });

  it('el detalle muestra el resultado, el historial (vigente primero) y si se puede repetir', async () => {
    mockApi({
      [`GET /api/me/results/${quizId}`]: () =>
        json({
          quizId,
          title: '[PLACEHOLDER] Quiz 1',
          allowRetake: false,
          current: {
            attemptId: 'a'.repeat(24),
            completedAt: '2026-10-06T12:00:00.000Z',
            result: { key: 'r2', title: '[PLACEHOLDER] Resultado B' },
          },
          history: [
            {
              attemptId: 'a'.repeat(24),
              attemptNumber: 2,
              version: 1,
              completedAt: '2026-10-06T12:00:00.000Z',
              resultTitle: '[PLACEHOLDER] Resultado B',
            },
            {
              attemptId: 'b'.repeat(24),
              attemptNumber: 1,
              version: 1,
              completedAt: '2026-10-05T12:00:00.000Z',
              resultTitle: '[PLACEHOLDER] Resultado A',
            },
          ],
        }),
    });
    renderAt(`/panel/resultados/${quizId}`);
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Resultado B' }),
    ).toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'Historial' });
    expect(
      within(history)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('Intento 2'), expect.stringContaining('Intento 1')]);
    expect(within(history).getByText(/\(vigente\)/)).toBeInTheDocument();
    expect(screen.getByText('Este quiz solo se juega una vez.')).toBeInTheDocument();
  });

  it('un quiz sin resultado todavía lo explica', async () => {
    mockApi({ [`GET /api/me/results/${quizId}`]: () => apiError('NOT_FOUND', 'x', 404) });
    renderAt(`/panel/resultados/${quizId}`);
    expect(
      await screen.findByRole('heading', { name: 'Todavía no tienes este resultado' }),
    ).toBeInTheDocument();
  });
});
