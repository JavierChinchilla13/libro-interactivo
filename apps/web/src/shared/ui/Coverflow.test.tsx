import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Coverflow, type CoverflowItem } from './Coverflow';

const items: CoverflowItem[] = ['a', 'b', 'c'].map((id, index) => ({
  id,
  label: `Ampliar ${id}`,
  caption: <p>Obra {index + 1}</p>,
  image: {
    provider: 'cloudinary',
    publicId: `libro/${id}`,
    url: `https://res.cloudinary.com/demo/image/upload/libro/${id}`,
    width: 800,
    height: 1000,
    alt: `Imagen ${id}`,
    deliveryType: 'upload',
  },
}));

const scrollTo = vi.fn();

beforeEach(() => {
  scrollTo.mockClear();
  Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
});

describe('Coverflow', () => {
  it('es un grupo con rol de carrusel, con la primera obra activa y su leyenda', () => {
    render(<Coverflow items={items} label="Fan arts" onOpen={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Fan arts' })).toHaveAttribute(
      'aria-roledescription',
      'carrusel',
    );
    expect(screen.getAllByRole('button', { name: /Ampliar/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Ampliar a' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByText('Obra 1')).toBeInTheDocument();
    expect(screen.getByText('Imagen 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  });

  it('tocar la obra del centro la abre; tocar otra solo la lleva al centro', async () => {
    const onOpen = vi.fn();
    render(<Coverflow items={items} label="Fan arts" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ampliar b' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Ampliar a' }));
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it('los botones y las flechas del teclado mueven el carrusel', async () => {
    render(<Coverflow items={items} label="Fan arts" onOpen={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    screen.getByRole('list').focus();
    await userEvent.keyboard('{ArrowRight}{End}{Home}');
    expect(scrollTo).toHaveBeenCalledTimes(4);
  });
});
