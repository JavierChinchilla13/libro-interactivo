import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleButton } from './GoogleButton';

const SCRIPT = 'script[src="https://accounts.google.com/gsi/client"]';

afterEach(() => {
  document.head.querySelectorAll(SCRIPT).forEach((node) => node.remove());
  delete (window as { google?: unknown }).google;
  vi.restoreAllMocks();
});

function renderButton(props: { clientId?: string } = {}) {
  const onCredential = vi.fn();
  render(
    <MemoryRouter>
      <GoogleButton
        onCredential={onCredential}
        clientId={'clientId' in props ? props.clientId : 'cliente-de-prueba'}
      />
    </MemoryRouter>,
  );
  return onCredential;
}

describe('GoogleButton', () => {
  it('no contacta a Google hasta que la persona lo toca', async () => {
    renderButton();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Política de cookies' })).toHaveAttribute(
      'href',
      '/cookies',
    );
    expect(document.head.querySelector(SCRIPT)).toBeNull();
  });

  it('al tocarlo carga el script y deja que Google dibuje su botón', async () => {
    const user = userEvent.setup();
    const renderGoogle = vi.fn();
    const initialize = vi.fn();
    const onCredential = renderButton();

    await user.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    const script = document.head.querySelector(SCRIPT);
    expect(script).not.toBeNull();
    expect(screen.getByRole('button', { name: /Abriendo Google/ })).toBeDisabled();

    // Google deja su objeto global al terminar de cargar.
    window.google = { accounts: { id: { initialize, renderButton: renderGoogle } } };
    script?.dispatchEvent(new Event('load'));
    await waitFor(() => expect(renderGoogle).toHaveBeenCalledTimes(1));
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'cliente-de-prueba' }),
    );
    // El botón propio se cambia por el de Google, en el mismo lugar.
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).toBeNull();

    // La credencial que entrega Google llega al padre.
    const config = initialize.mock.calls[0]?.[0] as {
      callback: (r: { credential?: string }) => void;
    };
    config.callback({ credential: 'id-token' });
    expect(onCredential).toHaveBeenCalledWith('id-token');
  });

  it('si el script no carga, avisa y deja seguir con correo y contraseña', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    document.head.querySelector(SCRIPT)?.dispatchEvent(new Event('error'));
    expect(await screen.findByText(/No pudimos abrir Google/)).toBeInTheDocument();
  });

  it('sin ID de cliente no muestra nada', () => {
    renderButton({ clientId: undefined });
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
    expect(document.head.querySelector(SCRIPT)).toBeNull();
  });
});
