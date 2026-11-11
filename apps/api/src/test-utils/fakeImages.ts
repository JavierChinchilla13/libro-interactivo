import { vi } from 'vitest';
import { AppError } from '../lib/errors.js';
import type { AssetInfo, ImageProvider } from '../providers/images/ImageProvider.js';

/** Proveedor de imágenes falso: `assets` es lo que «hay» en Cloudinary; lo demás no existe. */
export function fakeImages(assets: AssetInfo[] = []) {
  const store = new Map(assets.map((asset) => [`${asset.resource}:${asset.publicId}`, asset]));
  const destroyed: string[] = [];
  const provider: ImageProvider = {
    signUpload: () => {
      throw new AppError('UNAVAILABLE', 'no usado en esta prueba');
    },
    // Firma de mentira con la misma forma que la real: la prueba revisa el `public_id` que genera el servidor.
    signCardUpload: ({ publicId, timestamp }) => ({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      cloudName: 'demo',
      apiKey: 'clave-de-prueba',
      signature: 'firma-de-prueba',
      params: {
        allowed_formats: 'jpg,jpeg,png,webp',
        public_id: publicId,
        timestamp: String(timestamp),
      },
      maxBytes: 8 * 1024 * 1024,
    }),
    inspect: vi.fn(async ({ publicId, resource }) => store.get(`${resource}:${publicId}`) ?? null),
    list: vi.fn(async ({ prefix, resource }) =>
      [...store.values()].filter((a) => a.resource === resource && a.publicId.startsWith(prefix)),
    ),
    destroy: vi.fn(async ({ publicId, resource }) => {
      destroyed.push(`${resource}:${publicId}`);
      store.delete(`${resource}:${publicId}`);
    }),
  };
  return {
    provider,
    destroyed,
    set: (asset: AssetInfo) => store.set(`${asset.resource}:${asset.publicId}`, asset),
  };
}

/** Un video de fondo «ya subido»: por defecto cumple todos los límites. */
export function videoAsset(publicId: string, over: Partial<AssetInfo> = {}): AssetInfo {
  return {
    publicId,
    resource: 'video',
    bytes: 3_000_000,
    format: 'mp4',
    width: 1280,
    height: 720,
    durationSeconds: 8.2,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

/** Una imagen de carta «ya subida»: por defecto cumple todos los límites. */
export function cardImageAsset(publicId: string, over: Partial<AssetInfo> = {}): AssetInfo {
  return {
    publicId,
    resource: 'image',
    bytes: 1_200_000,
    format: 'jpg',
    width: 1200,
    height: 1800,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}
