import type { ImageRef, ImageSignatureResponse, UPLOAD_PURPOSES, VideoRef } from '@libro/shared';
import { z } from 'zod';
import { ApiClientError } from '../../shared/api/client';
import { uploadsApi } from './api';

type Purpose = (typeof UPLOAD_PURPOSES)[number];

/** Lo que devuelve Cloudinary al subir (solo lo que usamos). */
const cloudinaryResultSchema = z.object({
  public_id: z.string(),
  secure_url: z.string().url(),
  width: z.number(),
  height: z.number(),
  duration: z.number().optional(),
});

/** Sube el archivo directo a Cloudinary con la firma del servidor (el secreto nunca llega al navegador). */
async function upload(file: File, signature: ImageSignatureResponse) {
  if (file.size > signature.maxBytes) {
    const mb = Math.round(signature.maxBytes / 1024 / 1024);
    throw new ApiClientError('VALIDATION', `El archivo pesa demasiado (máximo ${mb} MB)`);
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(signature.params)) form.append(key, value);
  form.append('api_key', signature.apiKey);
  form.append('signature', signature.signature);
  form.append('file', file);

  let response: Response;
  try {
    response = await fetch(signature.uploadUrl, { method: 'POST', body: form });
  } catch {
    throw new ApiClientError('NETWORK', 'No se pudo subir el archivo. Revisa tu conexión.');
  }
  const payload: unknown = await response.json().catch(() => null);
  const parsed = cloudinaryResultSchema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new ApiClientError(
      'VALIDATION',
      'No se pudo subir el archivo. Revisa el formato y el tamaño.',
    );
  }
  return parsed.data;
}

export async function uploadImage(file: File, purpose: Purpose, alt: string): Promise<ImageRef> {
  const result = await upload(file, await uploadsApi.sign(purpose, 'image'));
  return {
    provider: 'cloudinary',
    publicId: result.public_id,
    url: result.secure_url,
    width: result.width,
    height: result.height,
    alt,
    deliveryType: 'upload',
  };
}

/** Video corto (solo resultados de quiz). La imagen de respaldo la genera Cloudinary a partir del mismo `publicId`. */
export async function uploadVideo(file: File, alt: string): Promise<VideoRef> {
  const result = await upload(file, await uploadsApi.sign('quiz', 'video'));
  return {
    provider: 'cloudinary',
    publicId: result.public_id,
    url: result.secure_url,
    width: result.width,
    height: result.height,
    durationSeconds: result.duration ?? 1,
    posterUrl: result.secure_url.replace(/\.[a-z0-9]+$/i, '.jpg'),
    alt,
  };
}
