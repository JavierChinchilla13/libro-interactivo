import { z } from 'zod';

/** Roles de la plataforma. EDITOR gestiona contenido; ADMIN además usuarios, QR y mensajes. */
export const ROLES = ['USER', 'EDITOR', 'ADMIN'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Identificador de MongoDB serializado (24 caracteres hexadecimales). */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador no válido');

/** Imagen guardada en Cloudinary. */
export const imageRefSchema = z.object({
  provider: z.literal('cloudinary'),
  publicId: z.string().min(1),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string(),
  deliveryType: z.enum(['upload', 'authenticated']).default('upload'),
});
export type ImageRef = z.infer<typeof imageRefSchema>;
/** Lo que se envía al API: `deliveryType` es opcional (por defecto `upload`). */
export type ImageRefInput = z.input<typeof imageRefSchema>;

/** Regla de desbloqueo anti-spoilers: se oculta hasta completar un quiz o el juego. */
export const unlockRuleSchema = z.object({
  kind: z.enum(['quiz', 'game']),
  refId: objectIdSchema,
});
export type UnlockRule = z.infer<typeof unlockRuleSchema>;

/** Enlace externo: solo `http(s)` (nunca `javascript:` ni `data:`), porque se muestra como `href`. */
export const httpUrlSchema = z
  .url({ error: 'Escribe un enlace completo (empieza con https://)' })
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), 'El enlace debe empezar con http:// o https://');
