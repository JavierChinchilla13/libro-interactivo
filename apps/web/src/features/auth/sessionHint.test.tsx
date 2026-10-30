import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../shared/api/client';
import { hasSessionHint } from '../../shared/api/sessionHint';
import { apiError, json, mockApi, renderAt } from '../../test/mockApi';
import { z } from 'zod';

afterEach(() => vi.unstubAllGlobals());

const clearHint = () => {
  document.cookie = 'libro_s=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
};

describe('cookie-pista de sesión (visitas anónimas sin errores 401)', () => {
  it('hasSessionHint solo reconoce libro_s=1', () => {
    clearHint();
    expect(hasSessionHint()).toBe(false);
    document.cookie = 'libro_s=0; path=/';
    expect(hasSessionHint()).toBe(false);
    document.cookie = 'otra=libro_s=1; path=/';
    expect(hasSessionHint()).toBe(false);
    document.cookie = 'libro_s=1; path=/';
    expect(hasSessionHint()).toBe(true);
  });

  it('una visita anónima no pide /me ni intenta renovar la sesión', async () => {
    clearHint();
    const api = mockApi({}, { session: null });
    renderAt('/ingresar');
    await screen.findByRole('heading', { level: 1, name: 'Ingresar' });
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(api.called('GET /api/me')).toHaveLength(0);
    expect(api.called('POST /api/auth/refresh')).toHaveLength(0);
  });

  it('la portada de una visita anónima tampoco: solo pide lo público', async () => {
    clearHint();
    const api = mockApi({ 'GET /api/site': () => json({}) }, { session: null });
    renderAt('/contacto');
    await screen.findByRole('heading', { level: 1, name: 'Contacto' });
    expect(api.called('GET /api/me')).toHaveLength(0);
    expect(api.called('POST /api/auth/refresh')).toHaveLength(0);
  });

  it('con la pista y una sesión caducada hay un solo intento: /me, la renovación y se queda sin sesión', async () => {
    document.cookie = 'libro_s=1; path=/';
    const api = mockApi({}, { session: null });
    renderAt('/ingresar');
    await screen.findByRole('heading', { level: 1, name: 'Ingresar' });
    await waitFor(() => expect(api.called('POST /api/auth/refresh')).toHaveLength(1));
    // Sin sesión nueva, la pantalla de ingreso sigue ahí.
    expect(screen.getByRole('heading', { level: 1, name: 'Ingresar' })).toBeInTheDocument();
  });

  it('con la pista y la sesión vigente, entra al panel como siempre', async () => {
    document.cookie = 'libro_s=1; path=/';
    mockApi();
    renderAt('/ingresar');
    expect(await screen.findByRole('navigation', { name: 'Panel' })).toBeInTheDocument();
  });

  it('sin la pista, un 401 de otra petición no dispara la renovación', async () => {
    clearHint();
    const api = mockApi({ 'GET /api/algo': () => apiError('UNAUTHENTICATED', 'No', 401) });
    await expect(apiRequest('/algo', z.unknown())).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(api.called('POST /api/auth/refresh')).toHaveLength(0);
  });

  it('con la pista, un 401 sí intenta renovar una vez', async () => {
    document.cookie = 'libro_s=1; path=/';
    const api = mockApi({ 'GET /api/algo': () => apiError('UNAUTHENTICATED', 'No', 401) });
    await expect(apiRequest('/algo', z.unknown())).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(api.called('POST /api/auth/refresh')).toHaveLength(1);
  });
});
