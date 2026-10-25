import { AppError } from './errors.js';

const CLOUDINARY_HOST = 'res.cloudinary.com';
/** Cuenta pública de demostración de Cloudinary: la usan las semillas y las pruebas E2E, nunca producción. */
const DEMO_CLOUD = 'demo';

interface CloudinaryAccount {
  /** Nuestra cuenta (`CLOUDINARY_CLOUD_NAME`). Sin ella solo se comprueba el servidor. */
  cloudName: string | undefined;
  /** Fuera de producción también vale la cuenta `demo` (semillas y E2E). */
  allowDemo: boolean;
}

let account: CloudinaryAccount = { cloudName: undefined, allowDemo: true };

/**
 * Fija la cuenta de Cloudinary contra la que se validan las URLs de contenido. Se llama al armar la aplicación. Con
 * `cloudName` solo valen las URLs `https://res.cloudinary.com/<cloudName>/…` (y `demo` fuera de producción); sin él
 * (desarrollo sin credenciales) basta con que sean de Cloudinary.
 */
export function configureCloudinaryAccount(config: {
  cloudName?: string | undefined;
  production: boolean;
}): void {
  account = { cloudName: config.cloudName, allowDemo: !config.production };
}

/** Nombre de la cuenta (primer segmento de la ruta) de una URL de Cloudinary, o `undefined` si no es válida. */
export function cloudNameOf(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== CLOUDINARY_HOST) return undefined;
    const first = url.pathname.split('/')[1];
    return first ? decodeURIComponent(first) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Las imágenes y videos de contenido solo pueden ser de NUESTRA cuenta de Cloudinary (la subida es firmada desde el
 * panel). Se rechaza cualquier otra URL para que no entren enlaces externos arbitrarios ni medios de otra cuenta.
 */
export function assertCloudinaryUrls(urls: readonly (string | undefined)[]): void {
  for (const raw of urls) {
    if (raw === undefined) continue;
    const cloud = cloudNameOf(raw);
    const ours =
      cloud !== undefined &&
      (account.cloudName === undefined ||
        cloud === account.cloudName ||
        (account.allowDemo && cloud === DEMO_CLOUD));
    if (!ours) {
      throw new AppError(
        'VALIDATION',
        'Las imágenes y videos deben subirse con el panel (Cloudinary)',
      );
    }
  }
}
