import { render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '../../app/providers';
import { createTestRouter } from '../../app/router';
import { PENDING_TOKEN_KEY } from './RedeemPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const user = {
  user: { id: '670000000000000000000001', name: 'Lectora', email: 'l@ejemplo.com', role: 'USER' },
};
const unauthenticated = () =>
  json({ error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión' } }, 401);
const invalid = () =>
  json({ error: { code: 'TOKEN_INVALID', message: 'Este código no es válido' } }, 400);
const info = {
  valid: true,
  bookTitle: '[PLACEHOLDER] Libro 1',
  kind: 'quiz',
  title: '[PLACEHOLDER] Quiz 2',
};
const redeemed = {
  kind: 'quiz',
  refId: '670000000000000000000020',
  bookId: '670000000000000000000010',
  title: '[PLACEHOLDER] Quiz 2',
};

function mockApi(options: { session: boolean; resolve?: () => Response; redeem?: () => Response }) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/me') return options.session ? json(user) : unauthenticated();
    if (url === '/api/auth/refresh') return unauthenticated();
    if (url.startsWith('/api/access/resolve/')) return (options.resolve ?? (() => json(info)))();
    if (url === '/api/access/redeem')
      return (options.redeem ?? (() => json({ ...redeemed, alreadyUnlocked: false })))();
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

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('entrada por QR (/u/:token)', () => {
  it('con sesión canjea el código y avisa que quedó desbloqueado', async () => {
    const fetchMock = mockApi({ session: true });
    renderAt('/u/abc.def');
    expect(await screen.findByText('¡Desbloqueado!')).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Libro 1')).toBeInTheDocument();
    const redeemCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/access/redeem');
    expect(redeemCalls).toHaveLength(1);
    expect(JSON.parse((redeemCalls[0]?.[1] as RequestInit).body as string)).toEqual({
      token: 'abc.def',
    });
    expect(sessionStorage.getItem(PENDING_TOKEN_KEY)).toBeNull();
  });

  it('canjear de nuevo se explica como «ya lo tenías» (es inofensivo)', async () => {
    mockApi({ session: true, redeem: () => json({ ...redeemed, alreadyUnlocked: true }) });
    renderAt('/u/abc.def');
    expect(await screen.findByText('Ya lo tenías desbloqueado')).toBeInTheDocument();
  });

  it('sin sesión muestra qué se va a desbloquear, NO canjea y manda a ingresar recordando el código', async () => {
    const fetchMock = mockApi({ session: false });
    renderAt('/u/abc.def');
    expect(await screen.findByText('[PLACEHOLDER] Quiz 2')).toBeInTheDocument();
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/ingresar');
    expect(page.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/access/redeem')).toBe(false);
    await waitFor(() => expect(sessionStorage.getItem(PENDING_TOKEN_KEY)).toBe('abc.def'));
  });

  it('un código que no sirve muestra siempre el mismo mensaje genérico y no ofrece ingresar ni canjear', async () => {
    const fetchMock = mockApi({ session: true, resolve: invalid });
    renderAt('/u/basura');
    expect(await screen.findByText(/Este código no es válido/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).queryByRole('link', { name: 'Ingresar' }),
    ).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/access/redeem')).toBe(false);
    expect(sessionStorage.getItem(PENDING_TOKEN_KEY)).toBeNull();
  });

  it('si el canje falla porque el código dejó de servir, lo dice sin pistas', async () => {
    mockApi({ session: true, redeem: invalid });
    renderAt('/u/abc.def');
    expect(await screen.findByRole('alert')).toHaveTextContent('Este código no es válido.');
  });

  it('un corte de red se distingue de un código inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/me') return unauthenticated();
        throw new TypeError('sin red');
      }),
    );
    renderAt('/u/abc.def');
    expect(await screen.findByText(/No pudimos conectar con el servidor/)).toBeInTheDocument();
  });
});
