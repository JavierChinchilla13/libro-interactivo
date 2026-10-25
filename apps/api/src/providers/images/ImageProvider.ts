import { createHash } from 'node:crypto';
import {
  QUIZ_VIDEO_LIMITS,
  type ImageSignatureResponse,
  type UPLOAD_PURPOSES,
} from '@libro/shared';
import { AppError } from '../../lib/errors.js';

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
export type UploadResource = 'image' | 'video';

export interface SignUploadInput {
  purpose: UploadPurpose;
  resource: UploadResource;
  /** Segundos desde 1970 (inyectable para pruebas). */
  timestamp: number;
}

/** Lo que el servidor sabe de un archivo ya subido (lo dice Cloudinary, no el navegador). */
export interface AssetInfo {
  publicId: string;
  resource: UploadResource;
  bytes: number;
  format: string;
  width: number;
  height: number;
  /** Solo en video. */
  durationSeconds?: number | undefined;
  /** ISO 8601. */
  createdAt: string;
}

/**
 * Proveedor de imágenes y videos (Cloudinary). El servidor FIRMA la subida (el navegador sube directo al proveedor y
 * luego guarda el `ImageRef`) y, para lo que no puede confiar al navegador, consulta el archivo con la API de
 * administración (`inspect`). Intercambiable detrás de esta interfaz.
 */
export interface ImageProvider {
  signUpload(input: SignUploadInput): ImageSignatureResponse;
  /** Datos reales de un archivo subido; `null` si no existe. Responde 503 si el proveedor no está configurado. */
  inspect(input: { publicId: string; resource: UploadResource }): Promise<AssetInfo | null>;
  /** Todos los archivos bajo un prefijo (con paginación). Solo para mantenimiento. */
  list(input: { prefix: string; resource: UploadResource }): Promise<AssetInfo[]>;
  /** Borra un archivo. Solo para mantenimiento manual: el API nunca lo llama al editar contenido. */
  destroy(input: { publicId: string; resource: UploadResource }): Promise<void>;
}

const LIMITS: Record<UploadResource, { maxBytes: number; formats: string }> = {
  image: { maxBytes: 10 * 1024 * 1024, formats: 'jpg,jpeg,png,webp,gif' },
  // Clips cortos y mudos (≤ 10 s, ≤ 5 MB) para resultados de quiz y fondos de quiz.
  video: { maxBytes: QUIZ_VIDEO_LIMITS.maxBytes, formats: QUIZ_VIDEO_LIMITS.formats.join(',') },
};

/** Propósitos que admiten video: el resultado de un quiz y el fondo de un quiz. */
const VIDEO_PURPOSES: readonly UploadPurpose[] = ['quiz', 'quiz-bg'];

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface AdminAsset {
  public_id?: string;
  resource_type?: string;
  bytes?: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  created_at?: string;
}

const ADMIN_TIMEOUT_MS = 8000;

export class CloudinaryImageProvider implements ImageProvider {
  constructor(
    private readonly credentials: CloudinaryCredentials,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  signUpload({ purpose, resource, timestamp }: SignUploadInput): ImageSignatureResponse {
    if (resource === 'video' && !VIDEO_PURPOSES.includes(purpose)) {
      throw new AppError(
        'VALIDATION',
        'El video solo se admite en los resultados y en los fondos de los quizzes',
      );
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

  private get base(): string {
    return `https://api.cloudinary.com/v1_1/${this.credentials.cloudName}`;
  }

  private async admin(path: string, init: RequestInit = {}): Promise<Response> {
    const token = Buffer.from(`${this.credentials.apiKey}:${this.credentials.apiSecret}`).toString(
      'base64',
    );
    try {
      return await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        headers: { Authorization: `Basic ${token}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
      });
    } catch {
      throw new AppError(
        'UNAVAILABLE',
        'No pudimos consultar Cloudinary. Intenta de nuevo en un momento',
      );
    }
  }

  private toInfo(asset: AdminAsset, resource: UploadResource): AssetInfo {
    return {
      publicId: asset.public_id ?? '',
      resource,
      bytes: asset.bytes ?? 0,
      format: (asset.format ?? '').toLowerCase(),
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      ...(typeof asset.duration === 'number' ? { durationSeconds: asset.duration } : {}),
      createdAt: asset.created_at ?? new Date(0).toISOString(),
    };
  }

  async inspect({ publicId, resource }: { publicId: string; resource: UploadResource }) {
    const response = await this.admin(`/resources/${resource}/upload/${publicId}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new AppError('UNAVAILABLE', 'No pudimos verificar el archivo en Cloudinary');
    }
    return this.toInfo((await response.json()) as AdminAsset, resource);
  }

  async list({ prefix, resource }: { prefix: string; resource: UploadResource }) {
    const found: AssetInfo[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ prefix, max_results: '500' });
      if (cursor) query.set('next_cursor', cursor);
      const response = await this.admin(`/resources/${resource}/upload?${query.toString()}`);
      if (!response.ok)
        throw new AppError('UNAVAILABLE', 'No pudimos listar los archivos de Cloudinary');
      const body = (await response.json()) as { resources?: AdminAsset[]; next_cursor?: string };
      for (const asset of body.resources ?? []) found.push(this.toInfo(asset, resource));
      cursor = body.next_cursor;
    } while (cursor);
    return found;
  }

  async destroy({ publicId, resource }: { publicId: string; resource: UploadResource }) {
    const query = new URLSearchParams();
    query.append('public_ids[]', publicId);
    const response = await this.admin(`/resources/${resource}/upload?${query.toString()}`, {
      method: 'DELETE',
    });
    if (!response.ok)
      throw new AppError('UNAVAILABLE', 'No pudimos borrar el archivo en Cloudinary');
  }
}

/** Cuando no hay credenciales: la subida responde 503 con un mensaje claro (el resto del panel sigue funcionando). */
export class DisabledImageProvider implements ImageProvider {
  signUpload(): ImageSignatureResponse {
    throw new AppError('UNAVAILABLE', 'La subida de imágenes no está configurada todavía');
  }
  inspect(): Promise<AssetInfo | null> {
    return Promise.reject(
      new AppError('UNAVAILABLE', 'Cloudinary no está configurado: no se puede verificar el video'),
    );
  }
  list(): Promise<AssetInfo[]> {
    return Promise.reject(new AppError('UNAVAILABLE', 'Cloudinary no está configurado'));
  }
  destroy(): Promise<void> {
    return Promise.reject(new AppError('UNAVAILABLE', 'Cloudinary no está configurado'));
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
