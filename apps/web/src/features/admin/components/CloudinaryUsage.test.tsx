import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders, createQueryClient } from '../../../app/providers';
import { apiError, json, mockApi } from '../../../test/mockApi';
import {
  CloudinaryUsagePanel,
  formatBytes,
  formatCount,
  usageLevel,
  usagePercent,
} from './CloudinaryUsage';

const ADMIN = {
  id: '670000000000000000000001',
  name: 'Marisol Quesada',
  email: 'm@ejemplo.com',
  role: 'ADMIN',
};
const EDITOR = { ...ADMIN, id: '670000000000000000000002', role: 'EDITOR' };
const URL = 'GET /api/admin/cloudinary-usage';
const GB = 1024 ** 3;

const usage = (percent: number, over: object = {}) => ({
  available: true,
  plan: 'Free',
  credits: { used: (25 * percent) / 100, limit: 25, percent },
  storage: { bytes: 1.7 * GB, limitBytes: null },
  checkedAt: '2026-11-19T12:00:00.000Z',
  ...over,
});

function show(variant?: 'full' | 'compact') {
  return render(
    <AppProviders client={createQueryClient()}>
      <CloudinaryUsagePanel {...(variant ? { variant } : {})} />
    </AppProviders>,
  );
}

const consoleLink = () =>
  screen.getByRole('link', { name: /Ver el uso o ampliar el plan en Cloudinary/ });

beforeEach(() => document.body.replaceChildren());
afterEach(() => document.body.replaceChildren());

describe('formato', () => {
  it('cuenta con coma decimal y enteros sin decimales', () => {
    expect(formatCount(25)).toBe('25');
    expect(formatCount(3.2)).toBe('3,2');
    expect(formatCount(0.64)).toBe('0,6');
  });

  it('bytes en GB o MB, nunca con punto decimal', () => {
    expect(formatBytes(1.7 * GB)).toBe('1,7 GB');
    expect(formatBytes(222_388_302)).toBe('212,1 MB');
    expect(formatBytes(150 * GB)).toBe('150 GB');
    expect(formatBytes(200_000)).toBe('menos de 1 MB');
  });

  it('el nivel: aviso desde el 80 % y alerta desde el 95 %', () => {
    expect(usageLevel(13)).toBe('ok');
    expect(usageLevel(79.9)).toBe('ok');
    expect(usageLevel(80)).toBe('warn');
    expect(usageLevel(94.9)).toBe('warn');
    expect(usageLevel(95)).toBe('alert');
    expect(usageLevel(undefined)).toBe('ok');
  });

  it('el porcentaje toma el más alto, incluido el almacenamiento si el plan tiene tope', () => {
    expect(
      usagePercent({
        available: true,
        credits: { used: 3, limit: 25, percent: 12 },
        storage: { bytes: 90, limitBytes: 100 },
        checkedAt: 'x',
      }),
    ).toBe(90);
  });
});

describe('barra de uso de Cloudinary', () => {
  it('al 13 %: créditos con coma decimal, almacenamiento, plan y la barra sin aviso', async () => {
    mockApi({ [URL]: () => json(usage(13)) }, { session: ADMIN });
    show();
    expect(
      await screen.findAllByText('Cloudinary: 3,3 de 25 créditos este mes (13 %)'),
    ).not.toHaveLength(0);
    expect(screen.getByText('Almacenamiento: 1,7 GB')).toBeInTheDocument();
    expect(screen.getByText('Plan Free')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Uso del plan de Cloudinary' });
    expect(bar).toHaveAttribute('aria-valuenow', '13');
    expect(bar).toHaveAttribute('data-level', 'ok');
    expect(screen.queryByText(/Atención:|Casi agotado:/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Espacio en Cloudinary' })).toBeInTheDocument();
  });

  it('al 80 % avisa con texto (no solo con color); al 95 % lo dice más fuerte', async () => {
    mockApi({ [URL]: () => json(usage(80)) }, { session: ADMIN });
    const first = show();
    expect(await screen.findByText(/Atención: ya usaste más del 80 % del plan/)).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-level', 'warn');
    first.unmount();

    mockApi({ [URL]: () => json(usage(96)) }, { session: ADMIN });
    show();
    expect(
      await screen.findByText(/Casi agotado: Cloudinary podría rechazar archivos/),
    ).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-level', 'alert');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '96');
  });

  it('la barra no pasa del 100 % aunque el uso lo pase', async () => {
    mockApi({ [URL]: () => json(usage(118)) }, { session: ADMIN });
    show();
    await screen.findByRole('progressbar');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('el enlace a Cloudinary abre en pestaña nueva, con rel seguro y a la consola real', async () => {
    mockApi({ [URL]: () => json(usage(13)) }, { session: ADMIN });
    show();
    await screen.findByRole('progressbar');
    const link = consoleLink();
    expect(link).toHaveAttribute('href', 'https://console.cloudinary.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sin datos (Cloudinary no disponible) solo queda el enlace: ni barra ni cifras inventadas', async () => {
    mockApi(
      {
        [URL]: () =>
          json({
            available: false,
            reason: 'Cloudinary no está configurado',
            checkedAt: '2026-11-19T12:00:00.000Z',
          }),
      },
      { session: ADMIN },
    );
    show();
    const link = await screen.findByRole('link', { name: /Ver el uso o ampliar el plan/ });
    expect(link).toBeVisible();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/créditos|Almacenamiento|Plan /)).toBeNull();
  });

  it('si la consulta falla, la pantalla sigue y queda el enlace', async () => {
    mockApi({ [URL]: () => apiError('INTERNAL', 'Error', 500) }, { session: ADMIN });
    show();
    await waitFor(() => expect(consoleLink()).toBeInTheDocument());
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('un plan sin créditos usa el almacenamiento con tope como barra', async () => {
    mockApi(
      {
        [URL]: () =>
          json({
            available: true,
            plan: 'Advanced',
            storage: { bytes: 120 * GB, limitBytes: 150 * GB },
            checkedAt: '2026-11-19T12:00:00.000Z',
          }),
      },
      { session: ADMIN },
    );
    show();
    expect(
      await screen.findByText('Cloudinary: 120 GB de 150 GB de almacenamiento (80 %)'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Atención: ya usaste más del 80 %/)).toBeInTheDocument();
  });

  it('la versión discreta no lleva título y muestra lo mismo', async () => {
    mockApi({ [URL]: () => json(usage(13)) }, { session: ADMIN });
    show('compact');
    await screen.findByRole('progressbar');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Almacenamiento: 1,7 GB')).toBeInTheDocument();
  });

  it('el editor no la ve ni la pide', async () => {
    const { called } = mockApi({ [URL]: () => json(usage(13)) }, { session: EDITOR });
    const { container } = show();
    await waitFor(() => expect(called('GET /api/me')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(called(URL)).toHaveLength(0);
  });
});
