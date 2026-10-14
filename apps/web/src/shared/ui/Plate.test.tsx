import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Plate, plateRatio } from './Plate';

const cover = (width: number, height: number) => ({
  url: 'https://res.cloudinary.com/demo/image/upload/libro/c',
  alt: 'Portada',
  width,
  height,
});

describe('plateRatio', () => {
  it('respeta la proporción de la imagen entre 2:3 y 16:9', () => {
    expect(plateRatio({ width: 600, height: 900 })).toBeCloseTo(2 / 3);
    expect(plateRatio({ width: 800, height: 1000 })).toBeCloseTo(0.8);
    expect(plateRatio({ width: 1280, height: 720 })).toBeCloseTo(16 / 9);
  });

  it('recorta lo que se sale de los límites y no se rompe con datos inválidos', () => {
    expect(plateRatio({ width: 100, height: 900 })).toBeCloseTo(2 / 3);
    expect(plateRatio({ width: 3000, height: 500 })).toBeCloseTo(16 / 9);
    expect(plateRatio({ width: 0, height: 0 })).toBeCloseTo(2 / 3);
  });
});

describe('Plate', () => {
  it('una portada apaisada conserva su forma en una caja que no depende del tamaño natural de la imagen', () => {
    const { container } = render(
      <Plate cover={cover(1280, 720)} className="w-1/2" landscapeClassName="w-full" />,
    );
    const box = container.querySelector('[data-plate="cover"]') as HTMLElement;
    expect(parseFloat(box.style.aspectRatio)).toBeCloseTo(16 / 9);
    expect(box).toHaveAttribute('data-landscape', 'true');
    expect(box.className).toContain('w-full');
    expect(box.className).not.toContain('w-1/2');
    const image = screen.getByRole('img', { name: 'Portada' });
    expect(image.className).toContain('absolute');
    expect(image.className).toContain('object-cover');
    expect(image).toHaveAttribute('width', '1280');
    expect(image).toHaveAttribute('height', '720');
  });

  it('una portada de libro (2:3) usa las clases de las portadas altas', () => {
    const { container } = render(
      <Plate cover={cover(600, 900)} className="w-3/5" landscapeClassName="w-full" />,
    );
    const box = container.querySelector('[data-plate="cover"]') as HTMLElement;
    expect(box.className).toContain('w-3/5');
    expect(box).not.toHaveAttribute('data-landscape');
  });

  it('la portada principal carga sin demora y con prioridad; las demás, perezosas', () => {
    const { rerender } = render(<Plate cover={cover(600, 900)} priority />);
    const image = screen.getByRole('img', { name: 'Portada' });
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('loading', 'eager');
    rerender(<Plate cover={cover(600, 900)} />);
    expect(screen.getByRole('img', { name: 'Portada' })).toHaveAttribute('loading', 'lazy');
  });

  it('ofrece varios anchos de la miniatura (srcset) solo si la imagen es de Cloudinary', () => {
    const { rerender } = render(<Plate cover={cover(600, 900)} />);
    expect(screen.getByRole('img', { name: 'Portada' }).getAttribute('srcset')).toContain('w_320');
    rerender(<Plate cover={{ ...cover(600, 900), url: 'https://ejemplo.com/c.png' }} />);
    expect(screen.getByRole('img', { name: 'Portada' })).not.toHaveAttribute('srcset');
  });

  it('sin portada es una portada tipográfica decorativa, sin imagen', () => {
    const { container } = render(<Plate />);
    expect(container.querySelector('img')).toBeNull();
    const plate = container.querySelector('.plate');
    expect(plate).toHaveAttribute('aria-hidden', 'true');
    expect(plate).toHaveTextContent('Universo');
    expect(plate).toHaveTextContent('Memorias');
  });
});
