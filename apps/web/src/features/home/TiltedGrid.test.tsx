import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TiltedGrid } from './TiltedGrid';

const images = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    provider: 'cloudinary' as const,
    publicId: `libro/enc-${i}`,
    url: `https://res.cloudinary.com/demo/image/upload/libro/enc-${i}`,
    width: 800,
    height: 1000,
    alt: `Imagen ${i + 1}`,
    deliveryType: 'upload' as const,
  }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TiltedGrid', () => {
  it('en producción, con menos de 5 imágenes (o ninguna) no pinta nada', () => {
    vi.stubEnv('DEV', false);
    for (const list of [undefined, images(4)]) {
      const { container, unmount } = render(<TiltedGrid images={list} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('en producción, con 5 imágenes sí se pinta', () => {
    vi.stubEnv('DEV', false);
    const { container } = render(<TiltedGrid images={images(5)} />);
    expect(container.querySelector('.tilted-grid')).not.toBeNull();
  });

  it('en desarrollo, con menos de 5 imágenes (o ninguna) muestra marcadores de color decorativos, sin imágenes', () => {
    for (const list of [undefined, images(4)]) {
      const { container, unmount } = render(<TiltedGrid images={list} />);
      expect(container.querySelector('.tilted-grid')).not.toBeNull();
      expect(container.querySelectorAll('img')).toHaveLength(0);
      const placeholders = container.querySelectorAll('.tilted-tile-placeholder');
      expect(placeholders.length).toBeGreaterThanOrEqual(6);
      for (const tile of Array.from(placeholders))
        expect(tile).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });

  it('muestra cada imagen una vez para lectores de pantalla (la copia del bucle va oculta) y se puede pausar', async () => {
    const { container } = render(<TiltedGrid images={images(5)} />);
    expect(screen.getAllByRole('img')).toHaveLength(5);
    expect(container.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(5);
    expect(container.querySelectorAll('img[loading="lazy"]')).toHaveLength(10);
    const pause = screen.getByRole('button', { name: 'Pausar animación' });
    await userEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Reanudar animación' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(container.querySelector('.tilted-grid')).toHaveAttribute('data-paused');
  });
});
