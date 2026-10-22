import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasGrid, TiltedGrid } from './TiltedGrid';

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
    // Las tres primeras se piden ya (se ven en la primera pantalla); las demás, al acercarse.
    expect(container.querySelectorAll('img[loading="eager"]')).toHaveLength(3);
    expect(container.querySelectorAll('img[loading="lazy"]')).toHaveLength(7);
    const pause = screen.getByRole('button', { name: 'Pausar animación' });
    await userEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Reanudar animación' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(container.querySelector('.tilted-grid')).toHaveAttribute('data-paused');
  });

  it('cada imagen conserva su proporción (acotada entre 0,6 y 1,8) y se pide por alto, sin ampliar', () => {
    const list = [
      { ...images(1)[0]!, width: 600, height: 400 }, // 1,5
      { ...images(1)[0]!, publicId: 'b', width: 500, height: 1000 }, // 0,5 -> 0,6
      { ...images(1)[0]!, publicId: 'c', width: 1900, height: 500 }, // 3,8 -> 1,8
      ...images(2),
    ];
    const { container } = render(<TiltedGrid images={list} />);
    const tiles = Array.from(container.querySelectorAll<HTMLElement>('.tilted-track > li')).slice(
      0,
      3,
    );
    expect(tiles.map((tile) => tile.style.aspectRatio)).toEqual(['1.5 / 1', '0.6 / 1', '1.8 / 1']);
    const first = container.querySelector('img');
    expect(first?.getAttribute('src')).toContain('/upload/f_auto,q_auto,c_limit,h_560/');
  });

  it('cada imagen entra al terminar de cargar (pendiente hasta entonces)', () => {
    const { container } = render(<TiltedGrid images={images(5)} />);
    const tile = container.querySelector<HTMLElement>('.tilted-track > li');
    expect(tile).toHaveAttribute('data-pending');
    fireEvent.load(tile!.querySelector('img')!);
    expect(tile).not.toHaveAttribute('data-pending');
  });

  it('si una imagen no carga, deja un hueco oculto a los lectores de pantalla', () => {
    const { container } = render(<TiltedGrid images={images(5)} />);
    const tile = container.querySelector<HTMLElement>('.tilted-track > li');
    fireEvent.error(tile!.querySelector('img')!);
    expect(tile).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('hasGrid', () => {
  it('en producción solo con 5 o más imágenes; en desarrollo siempre', () => {
    vi.stubEnv('DEV', false);
    expect(hasGrid(undefined)).toBe(false);
    expect(hasGrid(images(4))).toBe(false);
    expect(hasGrid(images(5))).toBe(true);
    vi.stubEnv('DEV', true);
    expect(hasGrid(undefined)).toBe(true);
  });
});
