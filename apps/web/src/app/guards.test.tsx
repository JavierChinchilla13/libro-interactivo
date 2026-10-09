import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from './providers';
import { createTestRouter } from './router';

type Role = 'USER' | 'EDITOR' | 'ADMIN';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const user = (role: Role) => ({
  user: { id: '670000000000000000000001', name: 'Persona', email: 'p@ejemplo.com', role },
});
const unauthenticated = () =>
  json({ error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión' } }, 401);

/** Simula el API: `session` es el usuario con sesión (o null) y el resto responde vacío. */
function mockApi(
  session: Role | null,
  extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined,
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = extra(url, init);
    if (custom) return custom;
    if (url === '/api/me') return session ? json(user(session)) : unauthenticated();
    if (url === '/api/auth/refresh') return unauthenticated();
    if (url === '/api/admin/books') return json({ books: [] });
    return json({ error: { code: 'NOT_FOUND', message: 'No' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  return render(
    <AppProviders client={createQueryClient()}>
      <RouterProvider router={createTestRouter([path])} />
    </AppProviders>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('guards de /admin (solo mejoran la experiencia; la seguridad es del API)', () => {
  it('sin sesión manda a /ingresar', async () => {
    mockApi(null);
    renderAt('/admin/libros');
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('un lector con sesión ve «sin permiso» y no el panel', async () => {
    mockApi('USER');
    renderAt('/admin');
    expect(await screen.findByText('No tienes permiso para ver esta página')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).not.toBeInTheDocument();
  });

  it('una editora entra al panel y NO ve la sección «Solo administradores»', async () => {
    mockApi('EDITOR');
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Inicio del panel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Libros' })).toBeInTheDocument();
    expect(screen.queryByText('Solo administradores')).not.toBeInTheDocument();
    expect(screen.getByText(/Editora/)).toBeInTheDocument();
  });

  it('una administradora ve además Códigos QR, Usuarios, Mensajes, Estadísticas y Ajustes', async () => {
    mockApi('ADMIN');
    renderAt('/admin');
    expect(await screen.findByText('Solo administradores')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Códigos QR' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
    expect(screen.queryByText('pronto')).toBeNull();
  });

  it('un error de red al comprobar la sesión se avisa, no se manda al login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('sin red');
      }),
    );
    renderAt('/admin');
    expect(await screen.findByText('No pudimos comprobar tu sesión')).toBeInTheDocument();
  });
});

describe('sección de códigos QR (solo administradoras)', () => {
  it('una editora no ve el enlace y, si entra por la dirección, recibe «sin permiso»', async () => {
    mockApi('EDITOR');
    renderAt('/admin/qr');
    expect(await screen.findByText('No tienes permiso para ver esta página')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Códigos QR' })).not.toBeInTheDocument();
  });

  it('una administradora entra a /admin/qr', async () => {
    mockApi('ADMIN');
    renderAt('/admin/qr');
    expect(await screen.findByRole('heading', { name: 'Códigos QR' })).toBeInTheDocument();
  });
});

describe('ingreso', () => {
  it('valida los campos antes de llamar al API', async () => {
    const fetchMock = mockApi(null);
    renderAt('/ingresar');
    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Escribe un correo válido')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/login')).toBe(false);
  });

  it('credenciales incorrectas muestran un mensaje genérico', async () => {
    mockApi(null, (url) =>
      url === '/api/auth/login'
        ? json({ error: { code: 'AUTH_INVALID', message: 'Credenciales inválidas' } }, 401)
        : undefined,
    );
    renderAt('/ingresar');
    await userEvent.type(await screen.findByLabelText(/Correo/), 'a@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'cualquiera');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it('una editora que ingresa llega al panel', async () => {
    let logged = false;
    mockApi(null, (url, init) => {
      if (url === '/api/auth/login' && init?.method === 'POST') {
        logged = true;
        return json(user('EDITOR'));
      }
      if (url === '/api/me' && logged) return json(user('EDITOR'));
      return undefined;
    });
    renderAt('/ingresar');
    await userEvent.type(await screen.findByLabelText(/Correo/), 'editora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'Nube-Azul-Cuatro-87');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('heading', { name: 'Inicio del panel' })).toBeInTheDocument();
    await waitFor(() => expect(logged).toBe(true));
  });

  it('con sesión iniciada, /ingresar redirige al panel', async () => {
    mockApi('ADMIN');
    renderAt('/ingresar');
    expect(await screen.findByRole('heading', { name: 'Inicio del panel' })).toBeInTheDocument();
  });
});
