import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from './providers';
import { createTestRouter } from './router';

function renderApp(path = '/') {
  return render(
    <AppProviders client={createQueryClient()}>
      <RouterProvider router={createTestRouter([path])} />
    </AppProviders>,
  );
}

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('portada', () => {
  it('muestra el título y consulta /api/health', async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ status: 'ok', db: 'up', uptimeSeconds: 12 }), { status: 200 }),
    );
    renderApp('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Libro Interactivo' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Todo funciona correctamente.')).toBeInTheDocument();
    expect(screen.getByTestId('server-status')).toHaveTextContent('en línea');
    expect(screen.getByTestId('db-status')).toHaveTextContent('conectada');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('avisa cuando el servidor no responde', async () => {
    mockFetch(new Error('red caída'));
    renderApp('/');
    expect(await screen.findByText('Hay un problema con el servicio.')).toBeInTheDocument();
    expect(screen.getByTestId('server-status')).toHaveTextContent('sin conexión');
  });

  it('avisa cuando la base de datos está caída', async () => {
    mockFetch(
      new Response(JSON.stringify({ status: 'ok', db: 'down', uptimeSeconds: 1 }), { status: 200 }),
    );
    renderApp('/');
    expect(await screen.findByText('Hay un problema con el servicio.')).toBeInTheDocument();
    expect(screen.getByTestId('db-status')).toHaveTextContent('sin conexión');
  });
});

describe('navegación', () => {
  it('abre la página de estado y una ruta desconocida muestra el aviso', async () => {
    mockFetch(
      new Response(JSON.stringify({ status: 'ok', db: 'up', uptimeSeconds: 1 }), { status: 200 }),
    );
    renderApp('/estado');
    expect(screen.getByRole('heading', { name: 'Estado del sistema' })).toBeInTheDocument();
  });

  it('muestra "Página no encontrada" en rutas inexistentes', () => {
    mockFetch(new Error('no importa'));
    renderApp('/ruta-que-no-existe');
    expect(screen.getByText('Página no encontrada.')).toBeInTheDocument();
  });
});
