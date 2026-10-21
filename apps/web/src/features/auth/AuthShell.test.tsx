import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthShell } from './AuthShell';

describe('AuthShell', () => {
  it('lleva el título y el contenido en una tarjeta, con el humo de fondo solo decorativo', () => {
    const { container } = render(
      <AuthShell title="Ingresar" tagline="Una frase">
        <button type="button">Entrar</button>
      </AuthShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.getByText('Una frase')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    const smoke = container.querySelector('.auth-smoke');
    expect(smoke).toHaveAttribute('aria-hidden', 'true');
    // El humo no recibe clics ni lo anuncian los lectores de pantalla: no hay nada interactivo dentro.
    expect(smoke?.children).toHaveLength(0);
    expect(container.querySelector('.auth-card')).not.toBeNull();
  });
});
