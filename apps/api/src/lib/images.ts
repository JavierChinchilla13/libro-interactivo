import { AppError } from './errors.js';

const CLOUDINARY_HOST = 'res.cloudinary.com';

/**
 * Las imágenes y videos de contenido solo pueden ser de Cloudinary (la subida es firmada desde el panel).
 * Se rechaza cualquier otra URL para que no entren enlaces externos arbitrarios al sitio.
 */
export function assertCloudinaryUrls(urls: readonly (string | undefined)[]): void {
  for (const raw of urls) {
    if (raw === undefined) continue;
    let host = '';
    let protocol = '';
    try {
      const url = new URL(raw);
      host = url.hostname;
      protocol = url.protocol;
    } catch {
      /* se rechaza abajo */
    }
    if (protocol !== 'https:' || host !== CLOUDINARY_HOST) {
      throw new AppError(
        'VALIDATION',
        'Las imágenes y videos deben subirse con el panel (Cloudinary)',
      );
    }
  }
}
