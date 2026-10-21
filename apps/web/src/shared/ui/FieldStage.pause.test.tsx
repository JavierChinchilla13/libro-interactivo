import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldStage } from './FieldStage';

interface Fake {
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}
const mounted: Fake[] = [];
let failNext = false;

vi.mock('../field/fieldEffects', () => ({
  mountEffect: vi.fn(async () => {
    if (failNext) {
      failNext = false;
      throw new Error('sin red');
    }
    const fake: Fake = { pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() };
    mounted.push(fake);
    return fake;
  }),
}));

type Callback = (entries: { isIntersecting: boolean }[]) => void;
const observers: Callback[] = [];

beforeEach(() => {
  mounted.length = 0;
  observers.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: Callback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

const stage = (key: 'rain' | 'neon' = 'rain') => (
  <FieldStage visualKey={key}>
    <h1>Campo</h1>
  </FieldStage>
);

describe('FieldStage: pausa y un solo fondo a la vez', () => {
  it('arranca al entrar en pantalla, se pausa al salir y se reanuda al volver', async () => {
    render(stage());
    act(() => observers[0]!([{ isIntersecting: true }]));
    await waitFor(() => expect(mounted).toHaveLength(1));
    expect(mounted[0]!.resume).toHaveBeenCalledTimes(1);
    act(() => observers[0]!([{ isIntersecting: false }]));
    expect(mounted[0]!.pause).toHaveBeenCalled();
    act(() => observers[0]!([{ isIntersecting: true }]));
    expect(mounted[0]!.resume).toHaveBeenCalledTimes(2);
  });

  it('con la pestaña oculta se pausa, y al volver a verse se reanuda', async () => {
    render(stage());
    act(() => observers[0]!([{ isIntersecting: true }]));
    await waitFor(() => expect(mounted).toHaveLength(1));
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mounted[0]!.pause).toHaveBeenCalled();
    const resumed = mounted[0]!.resume.mock.calls.length;
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mounted[0]!.resume.mock.calls.length).toBe(resumed + 1);
  });

  it('al arrancar un segundo escenario, el primero se pausa (solo uno corre a la vez)', async () => {
    render(
      <>
        {stage('rain')}
        {stage('neon')}
      </>,
    );
    act(() => observers[0]!([{ isIntersecting: true }]));
    await waitFor(() => expect(mounted).toHaveLength(1));
    act(() => observers[1]!([{ isIntersecting: true }]));
    await waitFor(() => expect(mounted).toHaveLength(2));
    expect(mounted[0]!.pause).toHaveBeenCalled();
    expect(mounted[1]!.resume).toHaveBeenCalled();
  });

  it('al desmontarse suelta el fondo (destroy)', async () => {
    const view = render(stage());
    act(() => observers[0]!([{ isIntersecting: true }]));
    await waitFor(() => expect(mounted).toHaveLength(1));
    view.unmount();
    expect(mounted[0]!.destroy).toHaveBeenCalled();
  });

  it('si falla la descarga del efecto no hay error sin manejar y se reintenta la próxima vez que se vea', async () => {
    failNext = true;
    const { container } = render(stage());
    act(() => observers[0]!([{ isIntersecting: true }]));
    // Sin efecto: se queda el degradado de CSS (el escenario nunca llega a «listo»).
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mounted).toHaveLength(0);
    expect(container.querySelector('.field-stage')).not.toHaveAttribute('data-ready');
    act(() => observers[0]!([{ isIntersecting: false }]));
    act(() => observers[0]!([{ isIntersecting: true }]));
    await waitFor(() => expect(mounted).toHaveLength(1));
    expect(container.querySelector('.field-stage')).toHaveAttribute('data-ready');
  });
});
