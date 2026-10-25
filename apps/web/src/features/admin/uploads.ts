import {
  QUIZ_BG_FOLDER,
  QUIZ_VIDEO_LIMITS,
  videoPosterUrl,
  type BackgroundVideo,
  type ImageRef,
  type ImageSignatureResponse,
  type UPLOAD_PURPOSES,
  type VideoRef,
} from '@libro/shared';
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

/** Los fondos de quiz deben quedar en `libro/quiz-bg/<id>`: el servidor rechaza cualquier otra carpeta. */
function assertBackgroundFolder(publicId: string) {
  if (!publicId.startsWith(`${QUIZ_BG_FOLDER}/`)) {
    throw new ApiClientError(
      'VALIDATION',
      `El archivo se subió, pero no quedó en la carpeta ${QUIZ_BG_FOLDER} (quedó como «${publicId}»). Avisa a quien administra Cloudinary.`,
    );
  }
}

export async function uploadImage(file: File, purpose: Purpose, alt: string): Promise<ImageRef> {
  const result = await upload(file, await uploadsApi.sign(purpose, 'image'));
  if (purpose === 'quiz-bg') assertBackgroundFolder(result.public_id);
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

/** Duración de un video leyendo solo sus metadatos en el navegador (no se descarga todo). `undefined` si no se puede leer. */
export function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);
    video.onerror = () => done(undefined);
    video.src = url;
  });
}

/** Mensaje claro cuando un video no cumple los límites (peso, formato o duración). Texto vacío si cumple. */
export function videoProblem(
  file: { size: number; type: string },
  seconds?: number,
): string | null {
  const max = QUIZ_VIDEO_LIMITS.maxBytes;
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',');
  if (!/^video\/(mp4|webm)$/.test(file.type)) return 'El video debe ser MP4 o WebM.';
  if (file.size > max)
    return `El video pesa ${mb(file.size)} MB y el máximo es ${mb(max)} MB. Comprímelo o recórtalo y vuelve a subirlo.`;
  const longest = QUIZ_VIDEO_LIMITS.maxDurationSeconds + QUIZ_VIDEO_LIMITS.toleranceSeconds;
  if (seconds !== undefined && seconds > longest)
    return `El video dura ${Math.round(seconds)} s y el máximo es ${QUIZ_VIDEO_LIMITS.maxDurationSeconds} s. Recórtalo y vuelve a subirlo.`;
  return null;
}

/**
 * Video corto de fondo de un quiz. Antes de subir se revisa peso, formato y duración (así no se sube nada que el
 * servidor va a rechazar); el póster es el primer fotograma, que genera Cloudinary del mismo `publicId`. Después de
 * subir se confirma la carpeta `libro/quiz-bg/`. El servidor vuelve a verificar todo al guardar.
 */
export async function uploadBackgroundVideo(file: File, alt: string): Promise<BackgroundVideo> {
  const before = videoProblem(file, await readVideoDuration(file));
  if (before) throw new ApiClientError('VALIDATION', before);
  const result = await upload(file, await uploadsApi.sign('quiz-bg', 'video'));
  assertBackgroundFolder(result.public_id);
  const after = videoProblem({ size: 0, type: file.type }, result.duration);
  if (after) throw new ApiClientError('VALIDATION', after);
  return {
    provider: 'cloudinary',
    publicId: result.public_id,
    url: result.secure_url,
    width: result.width,
    height: result.height,
    durationSeconds: result.duration ?? 1,
    posterUrl: videoPosterUrl(result.secure_url),
    alt,
  };
}
