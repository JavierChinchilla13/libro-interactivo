import type { AuthUser } from '@libro/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '../../app/providers';
import { createTestRouter } from '../../app/router';
import { homeFor, landingAfterLogin } from './session';

const account = (role: AuthUser['role']): AuthUser => ({
  id: '670000000000000000000001',
  name: 'Persona',
  email: 'p@ejemplo.com',
  role,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('a dónde se va al terminar de ingresar', () => {
  it('sin dirección previa: el equipo a /admin y los lectores a /panel', () => {
    expect(homeFor(account('ADMIN'))).toBe('/admin');
    expect(homeFor(account('EDITOR'))).toBe('/admin');
    expect(homeFor(account('USER'))).toBe('/panel');
    expect(landingAfterLogin(account('ADMIN'), undefined)).toBe('/admin');
    expect(landingAfterLogin(account('USER'), undefined)).toBe('/panel');
  });

  it('con dirección previa se respeta, salvo /admin para quien no es del equipo', () => {
    expect(landingAfterLogin(account('USER'), '/u/abc123')).toBe('/u/abc123');
    expect(landingAfterLogin(account('USER'), '/panel/libros/mi-libro?x=1')).toBe(
      '/panel/libros/mi-libro?x=1',
    );
    expect(landingAfterLogin(account('ADMIN'), '/admin/libros')).toBe('/admin/libros');
    expect(landingAfterLogin(account('EDITOR'), '/admin')).toBe('/admin');
    expect(landingAfterLogin(account('USER'), '/admin')).toBe('/panel');
    expect(landingAfterLogin(account('USER'), '/admin/libros')).toBe('/panel');
    expect(landingAfterLogin(account('USER'), '/admin?x=1')).toBe('/panel');
    // «/administracion» no es «/admin»: es otra dirección.
    expect(landingAfterLogin(account('USER'), '/administracion')).toBe('/administracion');
  });

  it('solo rutas internas: una dirección con otro sitio o rara cae al inicio por rol', () => {
    expect(landingAfterLogin(account('USER'), '//otro-sitio.example/x')).toBe('/panel');
    expect(landingAfterLogin(account('ADMIN'), 'https://otro-sitio.example')).toBe('/admin');
    expect(landingAfterLogin(account('USER'), '')).toBe('/panel');
  });
});

/** API simulada: sin sesión hasta que se ingresa; entonces responde con el usuario indicado. */
function mockLogin(role: AuthUser['role']) {
  let logged = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/login' && init?.method === 'POST') {
        logged = true;
        return json({ status: 'ok', user: account(role) });
      }
      if (url === '/api/me') {
        return logged
          ? json({ user: account(role) })
          : json({ error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión' } }, 401);
      }
      if (url === '/api/auth/refresh') {
        return json({ error: { code: 'UNAUTHENTICATED', message: 'No' } }, 401);
      }
      return json({ error: { code: 'NOT_FOUND', message: 'No' } }, 404);
    }),
  );
}

async function signInFrom(path: string) {
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  await userEvent.type(await screen.findByLabelText(/Correo/), 'p@ejemplo.com');
  await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Nube-Azul-Cuatro-87');
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  return router;
}

describe('quien llega a /admin sin sesión y luego ingresa', () => {
  it('sin sesión, /admin/libros manda a /ingresar y recuerda la dirección', async () => {
    mockLogin('USER');
    const router = createTestRouter(['/admin/libros']);
    render(
      <AppProviders client={createQueryClient()}>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ingresar');
    expect(router.state.location.state).toEqual({ from: '/admin/libros' });
  });

  it('un lector termina en /panel, no en «sin permiso» de /admin', async () => {
    mockLogin('USER');
    const router = await signInFrom('/admin/libros');
    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'));
    expect(screen.queryByText('No tienes permiso para ver esta página')).toBeNull();
  });

  it('un administrador vuelve a la sección que pedía', async () => {
    mockLogin('ADMIN');
    const router = await signInFrom('/admin/libros');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/libros'));
  });

  it('entrando directo a /ingresar, cada rol va a su inicio', async () => {
    mockLogin('ADMIN');
    const router = await signInFrom('/ingresar');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
  });
});
