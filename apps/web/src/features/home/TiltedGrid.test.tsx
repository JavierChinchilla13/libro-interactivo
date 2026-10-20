import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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

describe('TiltedGrid', () => {
  it('no se muestra con menos de 5 imágenes ni sin imágenes', () => {
    expect(render(<TiltedGrid images={undefined} />).container).toBeEmptyDOMElement();
    expect(render(<TiltedGrid images={images(4)} />).container).toBeEmptyDOMElement();
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
