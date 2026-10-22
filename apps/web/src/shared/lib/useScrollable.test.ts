import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollable } from './useScrollable';

afterEach(() => vi.unstubAllGlobals());

const element = (scrollWidth: number, clientWidth: number) => {
  const node = document.createElement('ul');
  Object.defineProperty(node, 'scrollWidth', { value: scrollWidth });
  Object.defineProperty(node, 'clientWidth', { value: clientWidth });
  return node;
};

describe('useScrollable', () => {
  it('es verdadero solo cuando el contenido desborda (una tira que se desliza)', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const wide = renderHook(() => useScrollable<HTMLUListElement>());
    act(() => wide.result.current[0](element(900, 400)));
    expect(wide.result.current[1]).toBe(true);

    const fits = renderHook(() => useScrollable<HTMLUListElement>());
    act(() => fits.result.current[0](element(400, 400)));
    expect(fits.result.current[1]).toBe(false);
  });

  it('sin ResizeObserver no da foco (no hay tira que recorrer)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const hook = renderHook(() => useScrollable<HTMLUListElement>());
    act(() => hook.result.current[0](element(900, 400)));
    expect(hook.result.current[1]).toBe(false);
  });
});
