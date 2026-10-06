import { createHash } from 'node:crypto';
import type { ImageSignatureResponse, UPLOAD_PURPOSES } from '@libro/shared';
import { AppError } from '../../lib/errors.js';

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
export type UploadResource = 'image' | 'video';

export interface SignUploadInput {
  purpose: UploadPurpose;
  resource: UploadResource;
  /** Segundos desde 1970 (inyectable para pruebas). */
  timestamp: number;
}

/**
 * Proveedor de imágenes y videos (Cloudinary). El servidor solo FIRMA la subida: el navegador sube directo
 * al proveedor y luego guarda el `ImageRef` resultante. Intercambiable detrás de esta interfaz.
 */
export interface ImageProvider {
  signUpload(input: SignUploadInput): ImageSignatureResponse;
}

const LIMITS: Record<UploadResource, { maxBytes: number; formats: string }> = {
  image: { maxBytes: 10 * 1024 * 1024, formats: 'jpg,jpeg,png,webp,gif' },
  // Clips cortos y mudos (≈ 5 s, ≤ 5 MB) solo para resultados de quiz.
  video: { maxBytes: 5 * 1024 * 1024, formats: 'mp4,webm' },
};

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export class CloudinaryImageProvider implements ImageProvider {
  constructor(private readonly credentials: CloudinaryCredentials) {}

  signUpload({ purpose, resource, timestamp }: SignUploadInput): ImageSignatureResponse {
    if (resource === 'video' && purpose !== 'quiz') {
      throw new AppError('VALIDATION', 'El video solo se admite en los resultados de los quizzes');
    }
    const limits = LIMITS[resource];
    const params: Record<string, string> = {
      allowed_formats: limits.formats,
      folder: `libro/${purpose}`,
      timestamp: String(timestamp),
    };
    // Firma de Cloudinary: parámetros ordenados `k=v` unidos con `&` + secreto, en SHA-1 hexadecimal.
    const toSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    const signature = createHash('sha1')
      .update(toSign + this.credentials.apiSecret)
      .digest('hex');
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.credentials.cloudName}/${resource}/upload`,
      cloudName: this.credentials.cloudName,
      apiKey: this.credentials.apiKey,
      signature,
      params,
      maxBytes: limits.maxBytes,
    };
  }
}

/** Cuando no hay credenciales: la subida responde 503 con un mensaje claro (el resto del panel sigue funcionando). */
export class DisabledImageProvider implements ImageProvider {
  signUpload(): ImageSignatureResponse {
    throw new AppError('UNAVAILABLE', 'La subida de imágenes no está configurada todavía');
  }
}

export function createImageProvider(env: {
  CLOUDINARY_CLOUD_NAME?: string | undefined;
  CLOUDINARY_API_KEY?: string | undefined;
  CLOUDINARY_API_SECRET?: string | undefined;
}): ImageProvider {
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return new CloudinaryImageProvider({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    });
  }
  return new DisabledImageProvider();
}
