import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StarRating } from './icons';

describe('StarRating', () => {
  it.each([1, 2, 3, 4, 5])('con %i dibuja 5 estrellas, %i llenas, y lo dice en texto', (n) => {
    const { container } = render(<StarRating rating={n} />);
    expect(screen.getByText(`${n} de 5 estrellas`)).toBeInTheDocument();
    const stars = container.querySelectorAll('svg');
    expect(stars).toHaveLength(5);
    expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(n);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
