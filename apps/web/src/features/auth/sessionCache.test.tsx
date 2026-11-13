import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '../../app/providers';
import { READER, json, mockApi } from '../../test/mockApi';
import { SESSION_KEY, useLogin } from './session';

afterEach(() => vi.unstubAllGlobals());

describe('abrir sesión descarta lo que quedó en la caché de otra cuenta', () => {
  it('el ingreso borra los datos de la sesión anterior (p. ej. el conteo del aviso) y guarda la nueva', async () => {
    mockApi(
      { 'POST /api/auth/login': () => json({ status: 'ok', user: READER }) },
      { session: null },
    );
    const client = createQueryClient();
    const stale = ['admin', 'notifications', 'preview', 'post', 'nuevo', ''] as const;
    client.setQueryData(stale, { recipients: 0 });
    client.setQueryData(['me', 'newsletter'], { status: 'subscribed' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppProviders client={client}>{children}</AppProviders>
    );
    const { result } = renderHook(() => useLogin(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ email: READER.email, password: 'Nube-Azul-Cuatro-87' }),
    );
    expect(client.getQueryData(stale)).toBeUndefined();
    expect(client.getQueryData(['me', 'newsletter'])).toBeUndefined();
    expect(client.getQueryData(SESSION_KEY)).toMatchObject({ id: READER.id });
  });
});
