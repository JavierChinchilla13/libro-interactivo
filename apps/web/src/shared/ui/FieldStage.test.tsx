import type { ResultPayload } from '@libro/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultView } from '../../features/reader/ResultView';
import { FieldStage } from './FieldStage';

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let notify: Callback = () => undefined;
let reduce = false;

beforeEach(() => {
  reduce = false;
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo() {}
      lineTo() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const gradient = { addColorStop: () => undefined };
  HTMLCanvasElement.prototype.getContext = (() =>
    new Proxy(
      {},
      {
        get: (_t, name) => (name === 'createRadialGradient' ? () => gradient : () => undefined),
        set: () => true,
      },
    )) as unknown as HTMLCanvasElement['getContext'];
});

afterEach(() => vi.unstubAllGlobals());

describe('FieldStage', () => {
  it('muestra el texto de inmediato y solo descarga el fondo cuando entra en pantalla', async () => {
    const { container } = render(
      <FieldStage visualKey="rain">
        <h1>Agitación</h1>
      </FieldStage>,
    );
    expect(screen.getByRole('heading', { name: 'Agitación' })).toBeInTheDocument();
    const stage = container.querySelector('.field-stage') as HTMLElement;
    expect(stage).toHaveAttribute('data-key', 'rain');
    expect(stage).not.toHaveAttribute('data-ready');
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
    act(() => notify([{ isIntersecting: true }]));
    await waitFor(() => expect(stage).toHaveAttribute('data-ready'));
  });

  it('con movimiento reducido pinta un cuadro y no arranca fotogramas', async () => {
    reduce = true;
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const { container } = render(
      <FieldStage visualKey="neon">
        <h1>Virtud</h1>
      </FieldStage>,
    );
    act(() => notify([{ isIntersecting: true }]));
    await waitFor(() =>
      expect(container.querySelector('.field-stage')).toHaveAttribute('data-ready'),
    );
    expect(raf).not.toHaveBeenCalled();
  });
});

describe('ResultView con campo animado', () => {
  const base: ResultPayload = { key: 'r1', title: 'Eres de la Transformación' };

  it('lleva el título sobre el fondo del campo y nombra el campo', () => {
    const { container } = render(
      <ResultView
        result={{ ...base, visual: { key: 'gradient', fieldName: 'Transformación' } }}
        asPage
      />,
    );
    expect(container.querySelector('.field-stage')).toHaveAttribute('data-key', 'gradient');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Eres de la Transformación' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Campo: Transformación')).toBeInTheDocument();
  });

  it('sin campo no hay escenario animado', () => {
    const { container } = render(<ResultView result={base} asPage />);
    expect(container.querySelector('.field-stage')).toBeNull();
  });
});
