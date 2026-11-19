import { cloudinaryUsageSchema, type CloudinaryUsage } from '@libro/shared';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/errors.js';
import {
  createCloudinaryUsageService,
  USAGE_CACHE_MS,
} from '../services/cloudinaryUsage.service.js';
import { createTestClock } from '../test-utils/app.js';
import { staffWorld } from '../test-utils/admin.js';
import { fakeImages } from '../test-utils/fakeImages.js';
import { useTestDb } from '../test-utils/db.js';
import type { ImageProvider } from '../providers/images/ImageProvider.js';

useTestDb();

const URL = '/api/admin/cloudinary-usage';
const OK: CloudinaryUsage = {
  available: true,
  plan: 'Free',
  credits: { used: 3.2, limit: 25, percent: 12.8 },
  storage: { bytes: 1_700_000_000, limitBytes: null },
  checkedAt: '2026-11-19T12:00:00.000Z',
};

describe('GET /api/admin/cloudinary-usage', () => {
  it('solo ADMIN: sin sesión 401, lector y editor 403', async () => {
    const world = await staffWorld({ images: fakeImages().provider });
    expect((await request(world.app).get(URL)).status).toBe(401);
    expect((await world.reader.get(URL)).status).toBe(403);
    expect((await world.editor.get(URL)).status).toBe(403);
  });

  it('un administrador recibe el uso normalizado, sin caché del navegador', async () => {
    const world = await staffWorld({ images: fakeImages().provider });
    const res = await world.admin.get(URL).expect(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(cloudinaryUsageSchema.parse(res.body)).toMatchObject({
      available: true,
      plan: 'Free',
      credits: { used: 3.2, limit: 25, percent: 12.8 },
      storage: { bytes: 1_700_000_000, limitBytes: null },
    });
  });

  it('la respuesta no trae claves, secretos ni el nombre de la cuenta', async () => {
    const world = await staffWorld({ images: fakeImages().provider });
    const text = JSON.stringify((await world.admin.get(URL).expect(200)).body);
    expect(text).not.toMatch(/secret|api_key|apiKey|clave-de-prueba|demo|signature/i);
  });

  it('si Cloudinary falla (o no está configurado) responde 200 con «no disponible» y el panel sigue', async () => {
    const provider: ImageProvider = {
      ...fakeImages().provider,
      usage: vi.fn(async () => {
        throw new AppError('UNAVAILABLE', 'Cloudinary no está configurado');
      }),
    };
    const world = await staffWorld({ images: provider });
    const res = await world.admin.get(URL).expect(200);
    expect(cloudinaryUsageSchema.parse(res.body)).toMatchObject({
      available: false,
      reason: 'Cloudinary no está configurado',
    });
  });

  it('con el proveedor apagado (sin credenciales) también responde 200 «no disponible», nunca 503 hacia el panel', async () => {
    const world = await staffWorld();
    const res = await world.admin.get(URL).expect(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toBe('Cloudinary no está configurado');
  });

  it('un fallo se registra solo con su mensaje (sin claves ni la respuesta de Cloudinary)', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'warn' }, { write: (line: string) => void lines.push(line) });
    const provider: ImageProvider = {
      ...fakeImages().provider,
      usage: vi.fn(async () => {
        throw new AppError('UNAVAILABLE', 'No pudimos consultar el uso de Cloudinary');
      }),
    };
    const world = await staffWorld({ images: provider, logger });
    await world.admin.get(URL).expect(200);
    const text = lines.join('\n');
    expect(text).toMatch(/No se pudo consultar el uso de Cloudinary/);
    expect(text).not.toMatch(/secret|api_key|Authorization|Basic /i);
  });
});

describe('caché del uso', () => {
  const setup = (usage: () => Promise<CloudinaryUsage>) => {
    const clock = createTestClock(new Date('2026-11-19T12:00:00Z'));
    const images = { ...fakeImages().provider, usage: vi.fn(usage) };
    const service = createCloudinaryUsageService({ images, clock });
    return { clock, images, service };
  };

  it('dentro de 10 minutos no vuelve a llamar a Cloudinary; pasado ese tiempo, sí', async () => {
    const { clock, images, service } = setup(async () => OK);
    await service.get();
    await service.get();
    clock.advance(USAGE_CACHE_MS - 1000);
    await service.get();
    expect(images.usage).toHaveBeenCalledTimes(1);
    clock.advance(2000);
    await service.get();
    expect(images.usage).toHaveBeenCalledTimes(2);
  });

  it('las consultas que llegan a la vez comparten una sola llamada', async () => {
    const { images, service } = setup(async () => OK);
    await Promise.all([service.get(), service.get(), service.get()]);
    expect(images.usage).toHaveBeenCalledTimes(1);
  });

  it('un fallo se recuerda solo un minuto y se vuelve a intentar', async () => {
    let fail = true;
    const { clock, images, service } = setup(async () => {
      if (fail) throw new AppError('UNAVAILABLE', 'No pudimos consultar el uso de Cloudinary');
      return OK;
    });
    expect((await service.get()).available).toBe(false);
    expect((await service.get()).available).toBe(false);
    expect(images.usage).toHaveBeenCalledTimes(1);
    fail = false;
    clock.advance(61_000);
    expect((await service.get()).available).toBe(true);
    expect(images.usage).toHaveBeenCalledTimes(2);
  });
});
