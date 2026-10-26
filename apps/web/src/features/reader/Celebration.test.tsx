import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Celebration } from './Celebration';

afterEach(() => vi.unstubAllGlobals());

const motion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

describe('celebración del resultado de un quiz', () => {
  it('con movimiento hay un sello, un anillo y 14 chispas decorativas', () => {
    motion(false);
    const { container } = render(<Celebration fieldKey="gradient" />);
    expect(screen.getByRole('status')).toHaveTextContent('Quiz completado');
    expect(container.querySelectorAll('[data-spark]')).toHaveLength(14);
    expect(container.querySelector('.celebration-ring')).not.toBeNull();
    // Todo lo que se mueve es decoración: nada que anuncie un lector de pantalla.
    for (const node of container.querySelectorAll('[data-spark], .celebration-ring')) {
      expect(node).toHaveAttribute('aria-hidden', 'true');
    }
    expect(container.querySelector('.celebration-orb')).toHaveAttribute('data-key', 'gradient');
  });

  it('es un solo momento: al terminar la última chispa se quitan del DOM', () => {
    motion(false);
    const { container } = render(<Celebration />);
    const sparks = container.querySelectorAll('[data-spark]');
    fireEvent(sparks[sparks.length - 1]!, new Event('animationend'));
    expect(container.querySelectorAll('[data-spark]')).toHaveLength(0);
    expect(container.querySelector('.celebration-ring')).toBeNull();
    // El sello se queda.
    expect(screen.getByRole('status')).toHaveTextContent('Quiz completado');
  });

  it('con «reducir movimiento» no hay chispas ni anillo y el sello se ve completo', () => {
    motion(true);
    const { container } = render(<Celebration fieldKey="neon" />);
    expect(container.querySelectorAll('[data-spark]')).toHaveLength(0);
    expect(container.querySelector('.celebration-ring')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Quiz completado');
    expect(container.querySelector('.celebration-orb')).not.toBeNull();
  });

  it('no usa nada del resultado: sin la clave visual, igual', () => {
    motion(false);
    const { container } = render(<Celebration />);
    expect(container.querySelector('.celebration-orb')).not.toHaveAttribute('data-key');
    expect(container.textContent).toBe('Quiz completado');
  });
});
