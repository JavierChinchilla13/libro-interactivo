import { z } from 'zod';

/** Para qué se sube un archivo (decide la carpeta de Cloudinary). */
export const UPLOAD_PURPOSES = ['cover', 'quiz', 'wiki', 'theme', 'post', 'misc'] as const;
export const uploadPurposeSchema = z.enum(UPLOAD_PURPOSES);

export const imageSignatureRequestSchema = z.object({
  purpose: uploadPurposeSchema,
  /** `video` solo se admite para resultados de quiz. */
  resource: z.enum(['image', 'video']).default('image'),
});
export type ImageSignatureRequest = z.input<typeof imageSignatureRequestSchema>;

/**
 * Datos para que el navegador suba directo a Cloudinary: debe enviar exactamente `params` más `file`,
 * `api_key` y `signature` a `uploadUrl`.
 */
export const imageSignatureResponseSchema = z.object({
  uploadUrl: z.string(),
  cloudName: z.string(),
  apiKey: z.string(),
  signature: z.string(),
  params: z.record(z.string(), z.string()),
  /** Tamaño máximo recomendado, en bytes (la validación final es de Cloudinary). */
  maxBytes: z.number().int().positive(),
});
export type ImageSignatureResponse = z.infer<typeof imageSignatureResponseSchema>;
