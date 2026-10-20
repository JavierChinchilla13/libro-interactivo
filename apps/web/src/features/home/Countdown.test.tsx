import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Countdown } from './Countdown';

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let notify: Callback = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: Callback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Countdown', () => {
  const target = new Date('2027-01-03T03:04:05.000Z');

  it('muestra los números reales, una frase accesible por minuto y, sin movimiento, ningún lienzo', () => {
    const { container } = render(<Countdown target={target} dateLabel="3 de enero de 2027" />);
    act(() => notify([{ isIntersecting: true }]));
    expect(screen.getByText('Sale el 3 de enero de 2027')).toBeInTheDocument();
    expect(screen.getByText('Faltan 2 días, 3 horas, 4 minutos.')).toBeInTheDocument();
    expect(container.querySelector('.countdown-digits')).toHaveTextContent('02');
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
  });

  it('cuenta cada segundo mientras está en pantalla y se detiene al salir de ella', () => {
    const { container } = render(<Countdown target={target} dateLabel="x" />);
    act(() => notify([{ isIntersecting: true }]));
    const seconds = () => container.querySelectorAll('.countdown-digits')[3]?.textContent;
    expect(seconds()).toBe('05');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(seconds()).toBe('03');
    act(() => notify([{ isIntersecting: false }]));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(seconds()).toBe('03');
  });

  it('desaparece al llegar la fecha', () => {
    const { container } = render(
      <Countdown target={new Date('2027-01-01T00:00:01.000Z')} dateLabel="x" />,
    );
    act(() => notify([{ isIntersecting: true }]));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container).toBeEmptyDOMElement();
  });
});
