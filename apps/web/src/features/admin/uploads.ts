import {
  CARD_PUBLIC_ID_PATTERN,
  QUIZ_BG_FOLDER,
  QUIZ_VIDEO_LIMITS,
  formatDecimal,
  videoPosterUrl,
  type BackgroundVideo,
  type ImageRef,
  type ImageSignatureResponse,
  type UPLOAD_PURPOSES,
  type VideoRef,
} from '@libro/shared';
import { z } from 'zod';
import { ApiClientError } from '../../shared/api/client';
import { cardsApi, uploadsApi } from './api';

type Purpose = (typeof UPLOAD_PURPOSES)[number];

/** Lo que devuelve Cloudinary al subir (solo lo que usamos). */
const cloudinaryResultSchema = z.object({
  public_id: z.string(),
  secure_url: z.string().url(),
  width: z.number(),
  height: z.number(),
  duration: z.number().optional(),
});

const MB = 1024 * 1024;

/** «10» si es redondo y «7,5» si no (coma decimal). */
function megabytes(bytes: number): string {
  const value = bytes / MB;
  return Number.isInteger(value) ? String(value) : formatDecimal(value);
}

/**
 * Si Cloudinary rechazó el archivo por su peso, un mensaje claro en español; `null` si el fallo fue otro. Cloudinary
 * responde `{ error: { message: "File size too large. Got 12345678. Maximum is 10485760." } }` (o 413): si el máximo
 * se lee, se dice cuál es; si no, solo que el archivo es demasiado pesado para el plan.
 */
export function cloudinarySizeRejection(status: number, payload: unknown): string | null {
  const message =
    typeof payload === 'object' && payload !== null && 'error' in payload
      ? (payload as { error?: { message?: unknown } }).error?.message
      : undefined;
  const text = typeof message === 'string' ? message : '';
  if (!/file size too large|too large|exceeds/i.test(text) && status !== 413) return null;
  const max = /maximum is\s+(\d+)/i.exec(text)?.[1];
  if (max && Number(max) > 0) {
    return `Cloudinary no acepta archivos de este peso en el plan actual (máximo ${megabytes(Number(max))} MB). Reduce el archivo o amplía el plan.`;
  }
  return 'El archivo es demasiado pesado para el plan actual de Cloudinary. Reduce el archivo o amplía el plan.';
}

/** A partir de este peso se avisa (sin impedir la subida): una imagen o un video muy pesados ocupan espacio y cargan lento. */
export const HEAVY_IMAGE_BYTES = 10 * MB;
export const HEAVY_VIDEO_BYTES = 20 * MB;

/**
 * Aviso NO bloqueante para un archivo pesado (imagen de más de 10 MB, video de más de 20 MB); `null` si no lo es.
 * Con `name` (varios archivos a la vez) el aviso dice de cuál se trata.
 */
export function heavyFileNotice(file: {
  size: number;
  type: string;
  name?: string;
}): string | null {
  const limit = file.type.startsWith('video/') ? HEAVY_VIDEO_BYTES : HEAVY_IMAGE_BYTES;
  if (file.size <= limit) return null;
  const size = formatDecimal(file.size / MB);
  const lead = file.name ? `«${file.name}» pesa ${size} MB` : `Este archivo pesa ${size} MB`;
  return `${lead}: ocupa más espacio y puede tardar en cargar en el celular.`;
}

/** Sube el archivo directo a Cloudinary con la firma del servidor (el secreto nunca llega al navegador). */
async function upload(file: File, signature: ImageSignatureResponse) {
  // Sin tope de peso propio: el único límite es el del plan de Cloudinary, que si rechaza el archivo se explica abajo.
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
    const tooBig = cloudinarySizeRejection(response.status, payload);
    throw new ApiClientError(
      'VALIDATION',
      tooBig ?? 'No se pudo subir el archivo. Revisa el formato y vuelve a intentarlo.',
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

/** Mensaje claro cuando un video no cumple los límites (formato o duración; el peso ya no se limita). `null` si cumple. */
export function videoProblem(file: { type: string }, seconds?: number): string | null {
  if (!/^video\/(mp4|webm)$/.test(file.type)) return 'El video debe ser MP4 o WebM.';
  const longest = QUIZ_VIDEO_LIMITS.maxDurationSeconds + QUIZ_VIDEO_LIMITS.toleranceSeconds;
  if (seconds !== undefined && seconds > longest)
    return `El video dura ${formatDecimal(seconds)} s y el máximo es ${QUIZ_VIDEO_LIMITS.maxDurationSeconds} s. Recórtalo y vuelve a subirlo.`;
  return null;
}

/**
 * Video corto de fondo de un quiz. Antes de subir se revisa formato y duración (así no se sube nada que el
 * servidor va a rechazar); el póster es el primer fotograma, que genera Cloudinary del mismo `publicId`. Después de
 * subir se confirma la carpeta `libro/quiz-bg/`. El servidor vuelve a verificar todo al guardar.
 */
export async function uploadBackgroundVideo(file: File, alt: string): Promise<BackgroundVideo> {
  const before = videoProblem(file, await readVideoDuration(file));
  if (before) throw new ApiClientError('VALIDATION', before);
  const result = await upload(file, await uploadsApi.sign('quiz-bg', 'video'));
  assertBackgroundFolder(result.public_id);
  const after = videoProblem({ type: file.type }, result.duration);
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

/** Lo que muestra el formulario de una carta de una imagen recién subida. */
export interface UploadedCardImage {
  publicId: string;
  width: number;
  height: number;
  /** Miniatura para mostrarla en el formulario (la URL de entrega acotada en ancho). */
  previewUrl: string;
}

/** Revisa la imagen ANTES de subirla (así no se sube nada que el servidor va a rechazar). `null` si cumple. */
export function cardImageProblem(file: { type: string; name?: string }): string | null {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return `«${file.name ?? 'El archivo'}» no es JPG, PNG ni WebP.`;
  }
  return null;
}

/**
 * Sube UNA imagen de carta con su propia firma (el servidor elige el nombre, público e impredecible). El servidor
 * vuelve a verificar todo con Cloudinary al guardar la carta.
 */
export async function uploadCardImage(file: File, bookId: string): Promise<UploadedCardImage> {
  const before = cardImageProblem(file);
  if (before) throw new ApiClientError('VALIDATION', before);
  const result = await upload(file, await cardsApi.sign(bookId));
  if (!CARD_PUBLIC_ID_PATTERN.test(result.public_id)) {
    throw new ApiClientError(
      'VALIDATION',
      'La imagen se subió, pero no quedó con el nombre que eligió el servidor. Avisa a quien administra Cloudinary.',
    );
  }
  return {
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    previewUrl: result.secure_url.replace('/upload/', '/upload/f_auto,q_auto,c_limit,w_480/'),
  };
}
