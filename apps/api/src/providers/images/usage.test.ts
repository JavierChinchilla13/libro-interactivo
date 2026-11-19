import { cloudinaryUsageSchema } from '@libro/shared';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../lib/errors.js';
import { CloudinaryImageProvider, DisabledImageProvider } from './ImageProvider.js';
import { normalizeCloudinaryUsage } from './usage.js';

const NOW = new Date('2026-11-19T12:00:00Z');

/** La respuesta REAL de un plan gratuito por créditos (cifras de la cuenta de desarrollo, sin nada de la cuenta). */
const CREDITS_PLAN = {
  plan: 'Free',
  last_updated: '2026-11-18',
  date_requested: '2026-11-19',
  transformations: { usage: 372, credits_usage: 0.37, breakdown: { transformation: 191 } },
  objects: { usage: 120 },
  bandwidth: { usage: 67_821_569, credits_usage: 0.06 },
  storage: { usage: 222_388_302, credits_usage: 0.21 },
  credits: { usage: 0.64, limit: 25, used_percent: 2.56 },
  resources: 100,
  requests: 500,
  media_limits: { image_max_size_bytes: 10_485_760, video_max_size_bytes: 104_857_600 },
};

/** Un plan antiguo: sin `credits`, con tope en bytes de almacenamiento y de ancho de banda. */
const LEGACY_PLAN = {
  plan: 'Advanced',
  last_updated: '2026-11-18',
  transformations: { usage: 12_000, limit: 100_000 },
  bandwidth: { usage: 5_000_000_000, limit: 200_000_000_000 },
  storage: { usage: 1_700_000_000, limit: 150_000_000_000 },
  requests: 10,
};

describe('normalizeCloudinaryUsage', () => {
  it('plan por créditos: créditos con su porcentaje, almacenamiento sin tope y ancho de banda', () => {
    const usage = normalizeCloudinaryUsage(CREDITS_PLAN, NOW);
    expect(usage).toEqual({
      available: true,
      plan: 'Free',
      credits: { used: 0.64, limit: 25, percent: 2.6 },
      storage: { bytes: 222_388_302, limitBytes: null },
      bandwidth: { bytes: 67_821_569, limitBytes: null },
      lastUpdated: '2026-11-18',
      checkedAt: NOW.toISOString(),
    });
    expect(cloudinaryUsageSchema.safeParse(usage).success).toBe(true);
  });

  it('plan antiguo: sin créditos, con el tope de almacenamiento y de ancho de banda en bytes', () => {
    const usage = normalizeCloudinaryUsage(LEGACY_PLAN, NOW);
    expect(usage).toMatchObject({
      available: true,
      plan: 'Advanced',
      storage: { bytes: 1_700_000_000, limitBytes: 150_000_000_000 },
      bandwidth: { bytes: 5_000_000_000, limitBytes: 200_000_000_000 },
    });
    expect(usage.credits).toBeUndefined();
  });

  it('calcula el porcentaje cuando Cloudinary no lo manda', () => {
    const usage = normalizeCloudinaryUsage({ credits: { usage: 3.2, limit: 25 } }, NOW);
    expect(usage.credits).toEqual({ used: 3.2, limit: 25, percent: 12.8 });
  });

  it('un campo faltante, de otro tipo o negativo se omite sin romper nada', () => {
    const usage = normalizeCloudinaryUsage(
      {
        plan: 42,
        credits: { usage: 'mucho', limit: 25 },
        storage: { usage: -5 },
        bandwidth: { usage: 100, limit: 0 },
      },
      NOW,
    );
    expect(usage.plan).toBeUndefined();
    expect(usage.credits).toBeUndefined();
    expect(usage.storage).toBeUndefined();
    expect(usage.bandwidth).toEqual({ bytes: 100, limitBytes: null });
  });

  it('sin ninguna cifra útil queda «no disponible» (nunca una respuesta vacía que parezca 0)', () => {
    for (const raw of [{}, null, 'texto', [], { plan: 'Free' }]) {
      expect(normalizeCloudinaryUsage(raw, NOW)).toMatchObject({ available: false });
    }
  });

  it('no copia nada que no sea una cifra o el plan: ni claves, ni nombre de cuenta, ni campos desconocidos', () => {
    const usage = normalizeCloudinaryUsage(
      {
        ...CREDITS_PLAN,
        api_key: '123456',
        api_secret: 'secreto-de-prueba',
        cloud_name: 'mi-cuenta',
        extra: { token: 'abc' },
      },
      NOW,
    );
    expect(JSON.stringify(usage)).not.toMatch(/secreto|123456|mi-cuenta|token|api_/);
  });
});

describe('CloudinaryImageProvider.usage', () => {
  const credentials = { cloudName: 'mi-cuenta', apiKey: '123', apiSecret: 'secreto-de-prueba' };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('llama a GET /usage con las credenciales de la API de administración y normaliza la respuesta', async () => {
    const fetchImpl = vi.fn(async () => json(CREDITS_PLAN));
    const usage = await new CloudinaryImageProvider(credentials, fetchImpl).usage();
    expect(usage).toMatchObject({ available: true, plan: 'Free', credits: { limit: 25 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudinary.com/v1_1/mi-cuenta/usage');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from('123:secreto-de-prueba').toString('base64')}`,
    );
  });

  it('un error de Cloudinary o de red es 503 con un mensaje sin detalles', async () => {
    for (const fetchImpl of [
      vi.fn(async () => json({ error: { message: 'Invalid API key 123' } }, 401)),
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    ]) {
      const error = await new CloudinaryImageProvider(credentials, fetchImpl)
        .usage()
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('UNAVAILABLE');
      expect((error as AppError).message).not.toMatch(/123|secreto|ECONNRESET|Invalid API/);
    }
  });

  it('sin credenciales, el proveedor apagado responde 503 con un mensaje claro', async () => {
    await expect(new DisabledImageProvider().usage()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Cloudinary no está configurado',
    });
  });
});
