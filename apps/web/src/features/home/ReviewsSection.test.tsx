import type { PublicReview } from '@libro/shared';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ReviewsSection } from './LandingSections';

const review = (over: Partial<PublicReview> & { id: string }): PublicReview => ({
  text: '[PLACEHOLDER] Una historia que no pude soltar.',
  authorName: '[PLACEHOLDER] Lectora',
  order: 1,
  ...over,
});

const renderSection = (reviews: PublicReview[]) =>
  render(
    <MemoryRouter>
      <ReviewsSection reviews={reviews} />
    </MemoryRouter>,
  );

describe('ReviewsSection', () => {
  it('no pinta nada sin reseñas', () => {
    const { container } = renderSection([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('cada reseña va en un marco exterior con su tarjeta, cita y atribución', () => {
    const { container } = renderSection([
      review({ id: '1', text: '[PLACEHOLDER] Destacada', rating: 5 }),
      review({
        id: '2',
        text: '[PLACEHOLDER] Segunda',
        authorName: '[PLACEHOLDER] Otra',
        source: 'Blog',
      }),
      review({ id: '3', text: '[PLACEHOLDER] Tercera' }),
    ]);
    const frames = container.querySelectorAll('.review-frame');
    expect(frames).toHaveLength(3);
    expect(container.querySelectorAll('.review-frame-lead')).toHaveLength(1);
    // Cita y atribución dentro de la tarjeta (figure > blockquote + figcaption).
    for (const frame of Array.from(frames)) {
      const card = frame.querySelector('figure.review-card');
      expect(card?.querySelector('blockquote')).not.toBeNull();
      expect(card?.querySelector('figcaption')).not.toBeNull();
    }
    expect(screen.getByText('5 de 5 estrellas')).toBeInTheDocument();
    expect(within(frames[1] as HTMLElement).getByText(/Blog/)).toBeInTheDocument();
  });

  it('una reseña de 600 caracteres seguidos conserva su texto entero y puede partirse en cualquier punto', () => {
    const long = `[PLACEHOLDER] ${'palabra'.repeat(86)}`.slice(0, 600);
    const { container } = renderSection([
      review({ id: '1', text: long }),
      review({ id: '2', text: long }),
    ]);
    const quotes = Array.from(container.querySelectorAll('blockquote'));
    expect(quotes).toHaveLength(2);
    for (const quote of quotes) {
      expect(quote.textContent).toContain(long);
      expect(quote.className).toContain('overflow-wrap:anywhere');
    }
  });

  it('las citas llevan un tope de líneas para que una reseña larga no desequilibre el diseño', () => {
    const { container } = renderSection([review({ id: '1' }), review({ id: '2' })]);
    const quotes = container.querySelectorAll('blockquote');
    expect(quotes[0]?.className).toContain('line-clamp-8');
    expect(quotes[1]?.className).toContain('line-clamp-6');
  });
});
