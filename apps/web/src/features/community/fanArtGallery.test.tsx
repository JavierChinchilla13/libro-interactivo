import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicFanArt } from '@libro/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';
import { FanArtGallery, galleryShape, ratioOf } from './FanArtGallery';

afterEach(() => vi.unstubAllGlobals());

const NO_SESSION = { session: null } as const;
const SHAPES: [number, number][] = [
  [800, 1200], // vertical
  [1200, 800], // horizontal
  [1000, 1000], // cuadrada
];
const art = (n: number, over: Partial<PublicFanArt> = {}): PublicFanArt => {
  const [width, height] = SHAPES[n % SHAPES.length]!;
  return {
    id: String(n).padStart(24, '0'),
    title: `Título ${n}`,
    image: {
      provider: 'cloudinary',
      publicId: `libro/arte${n}`,
      deliveryType: 'upload',
      url: `https://res.cloudinary.com/demo/image/upload/libro/arte${n}.png`,
      width,
      height,
      alt: `Dibujo ${n}`,
    },
    artistName: `Artista ${n}`,
    order: n,
    ...over,
  };
};
const many = (count: number) => Array.from({ length: count }, (_, index) => art(index + 1));

describe('galleryShape', () => {
  it.each([
    [0, 'empty'],
    [1, 'single'],
    [2, 'rows'],
    [3, 'rows'],
    [4, 'rows'],
    [5, 'rows'],
    [7, 'rows'],
    [8, 'mosaic'],
    [12, 'mosaic'],
    [60, 'mosaic'],
  ])('%i piezas → %s', (count, shape) => {
    expect(galleryShape(count)).toBe(shape);
  });
});

describe('ratioOf', () => {
  it('respeta la proporción declarada y nunca estira: sin medidas queda cuadrada y los extremos se acotan', () => {
    expect(ratioOf(art(0))).toBeCloseTo(2 / 3);
    expect(ratioOf(art(1))).toBeCloseTo(3 / 2);
    expect(ratioOf(art(2))).toBe(1);
    const broken = art(3);
    broken.image = { ...broken.image, width: 0, height: 0 };
    expect(ratioOf(broken)).toBe(1);
    const panorama = art(4);
    panorama.image = { ...panorama.image, width: 6000, height: 400 };
    expect(ratioOf(panorama)).toBe(2.5);
  });
});

describe('FanArtGallery', () => {
  it.each([1, 2, 3, 4, 5, 7, 8, 12])(
    'con %i piezas pinta cada una una sola vez y se abre por su posición',
    async (count) => {
      const onOpen = vi.fn();
      render(<FanArtGallery arts={many(count)} onOpen={onOpen} />);
      const list = screen.getByRole('list', { name: 'Fan arts' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(count);
      expect(list).toHaveAttribute('data-shape', galleryShape(count));
      await userEvent.click(within(list).getAllByRole('button')[count - 1]!);
      expect(onOpen).toHaveBeenCalledWith(count - 1);
    },
  );

  it('una sola pieza va destacada y centrada, con su proporción y el alto acotado por CSS', () => {
    render(<FanArtGallery arts={[art(1)]} onOpen={() => {}} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveClass('fan-single');
    expect(item.style.getPropertyValue('--ratio')).toBe('1.5');
    expect(item.parentElement).toHaveClass('justify-center');
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'eager');
  });

  it('las hileras se centran y cada pieza ocupa el ancho de su proporción con la misma altura', () => {
    render(<FanArtGallery arts={many(4)} onOpen={() => {}} />);
    const list = screen.getByRole('list', { name: 'Fan arts' });
    expect(list).toHaveClass('flex-wrap', 'justify-center');
    const widths = within(list)
      .getAllByRole('listitem')
      .map((item) => item.style.width);
    // Horizontal (3/2), cuadrada (1), vertical (2/3) y otra horizontal: anchos distintos con la misma altura variable.
    expect(widths.every((width) => width.includes('var(--row-h)'))).toBe(true);
    expect(widths[0]).toContain('1.5');
    expect(widths[1]).toContain('* 1)');
    expect(widths[2]).toContain('0.666');
    expect(widths[3]).toBe(widths[0]);
    for (const button of within(list).getAllByRole('button')) {
      expect(button.style.aspectRatio).not.toBe('');
    }
  });

  it('desde 8 es un mosaico en columnas con las proporciones reales', () => {
    render(<FanArtGallery arts={many(8)} onOpen={() => {}} />);
    const list = screen.getByRole('list', { name: 'Fan arts' });
    expect(list).toHaveClass('columns-2');
    expect(within(list).getAllByRole('listitem')[0]).toHaveClass('break-inside-avoid');
  });

  it('títulos y artistas muy largos se recortan a dos líneas y conservan el texto completo en title', () => {
    const title = 'Una noche larguísima en la que la ciudad entera olvidó cómo se llamaba el mar '
      .repeat(3)
      .trim();
    const artistName = 'Alejandra Montserrat-Wiśniewska de la Vega y Fernández-Kowalczyk '
      .repeat(2)
      .trim();
    render(
      <FanArtGallery
        arts={[art(1), art(2, { title, artistName }), art(3, { title: undefined })]}
        onOpen={() => {}}
      />,
    );
    const longTitle = screen.getByText(title);
    expect(longTitle).toHaveClass('line-clamp-2');
    expect(longTitle).toHaveAttribute('title', title);
    expect(screen.getByText(`Por ${artistName}`)).toHaveAttribute('title', artistName);
    // Sin título solo se muestra el artista.
    expect(screen.getByText('Por Artista 3')).toBeInTheDocument();
    expect(screen.queryByText('Título 3')).toBeNull();
  });

  it('una imagen que falla deja un marco liso con aviso, sin romper la fila ni el botón', () => {
    render(<FanArtGallery arts={many(3)} onOpen={() => {}} />);
    const [first] = screen.getAllByRole('img');
    fireEvent.error(first!);
    expect(screen.getByText('Imagen no disponible')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('página de fan arts', { timeout: 30_000 }, () => {
  const serve = (count: number) =>
    mockApi({ 'GET /api/fan-arts': () => json({ fanArts: many(count) }) }, NO_SESSION);

  it.each([
    [1, 'single'],
    [4, 'rows'],
    [12, 'mosaic'],
  ])('con %i fan arts usa la forma «%s» por defecto', async (count, shape) => {
    serve(count);
    renderAt('/fan-arts');
    const list = await screen.findByRole('list', { name: 'Fan arts' });
    expect(list).toHaveAttribute('data-shape', shape);
  });

  it('con 0 dice que todavía no hay y no ofrece carrusel', async () => {
    serve(0);
    renderAt('/fan-arts');
    expect(await screen.findByText('Todavía no hay fan arts publicados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carrusel' })).toBeNull();
  });

  it('el botón del carrusel aparece desde 5 piezas y no antes; cambia de vista y vuelve', async () => {
    serve(4);
    const four = renderAt('/fan-arts');
    await screen.findByRole('list', { name: 'Fan arts' });
    expect(screen.queryByRole('button', { name: 'Carrusel' })).toBeNull();
    four.unmount();

    serve(5);
    renderAt('/fan-arts');
    const user = userEvent.setup();
    await screen.findByRole('list', { name: 'Fan arts' });
    const carousel = screen.getByRole('button', { name: 'Carrusel' });
    expect(screen.getByRole('button', { name: 'Galería' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(carousel);
    expect(carousel).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('list', { name: 'Fan arts' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Galería' }));
    expect(screen.getByRole('list', { name: 'Fan arts' })).toBeInTheDocument();
  });
});
