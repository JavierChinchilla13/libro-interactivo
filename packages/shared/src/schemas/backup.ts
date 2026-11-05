import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_PROBLEM_MESSAGES,
  checkPassword,
} from '../passwordPolicy.js';
import { objectIdSchema } from './common.js';

/** Largo mínimo de la contraseña del archivo de respaldo (más que la de las cuentas: protege toda la base). */
export const BACKUP_ARCHIVE_PASSWORD_MIN = 12;
/** Pasados estos días sin respaldo, el inicio del panel avisa (también si nunca hubo uno). */
export const BACKUP_STALE_DAYS = 7;
/** Tope del archivo de respaldo descargable desde el panel. */
export const BACKUP_MAX_BYTES = 200 * 1024 * 1024;
/** Descargas que se conservan en el registro. */
export const BACKUP_HISTORY_KEEP = 50;
/** Descargas que se muestran en la pantalla de respaldo. */
export const BACKUP_HISTORY_SHOWN = 10;

const ARCHIVE_TOO_SHORT = `La contraseña del archivo debe tener al menos ${BACKUP_ARCHIVE_PASSWORD_MIN} caracteres.`;

/**
 * Descargar un respaldo: la contraseña de la cuenta (confirmación) y la contraseña con la que se cifra el archivo,
 * escrita dos veces. El API vuelve a comprobar la del archivo con el nombre y el correo de la cuenta.
 */
export const createBackupRequestSchema = z
  .object({
    password: z.string().min(1, 'Escribe tu contraseña').max(PASSWORD_MAX_LENGTH),
    archivePassword: z
      .string()
      .max(PASSWORD_MAX_LENGTH, PASSWORD_PROBLEM_MESSAGES.TOO_LONG)
      .superRefine((value, ctx) => {
        if (value.length < BACKUP_ARCHIVE_PASSWORD_MIN) {
          ctx.addIssue({ code: 'custom', message: ARCHIVE_TOO_SHORT });
        }
        for (const problem of checkPassword(value)) {
          if (problem === 'TOO_SHORT') continue;
          ctx.addIssue({ code: 'custom', message: PASSWORD_PROBLEM_MESSAGES[problem] });
        }
      }),
    archivePasswordConfirm: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .superRefine((value, ctx) => {
    if (value.archivePassword !== value.archivePasswordConfirm) {
      ctx.addIssue({
        code: 'custom',
        path: ['archivePasswordConfirm'],
        message: 'Las contraseñas del archivo no coinciden',
      });
    }
    if (value.archivePassword !== '' && value.archivePassword === value.password) {
      ctx.addIssue({
        code: 'custom',
        path: ['archivePassword'],
        message: 'Usa una contraseña distinta de la de tu cuenta.',
      });
    }
  });
export type CreateBackupRequest = z.infer<typeof createBackupRequestSchema>;

/** Problemas de la contraseña del archivo (para avisar en el formulario antes de enviar). */
export function archivePasswordProblems(
  value: string,
  context: { name?: string; email?: string } = {},
): string[] {
  const messages: string[] = [];
  if (value.length < BACKUP_ARCHIVE_PASSWORD_MIN) messages.push(ARCHIVE_TOO_SHORT);
  for (const problem of checkPassword(value, context)) {
    if (problem !== 'TOO_SHORT') messages.push(PASSWORD_PROBLEM_MESSAGES[problem]);
  }
  return messages;
}

export const backupDownloadSchema = z.object({
  at: z.string(),
  /** `null` si la cuenta ya no existe. */
  by: z.object({ id: objectIdSchema, name: z.string() }).nullable(),
  /** `false` si la descarga se cortó antes de terminar. */
  ok: z.boolean(),
  bytes: z.number().int().nonnegative(),
});
export type BackupDownload = z.infer<typeof backupDownloadSchema>;

export const backupStatusResponseSchema = z.object({
  /** Último respaldo descargado completo desde el panel (`null` si nunca hubo uno). */
  lastAt: z.string().nullable(),
  daysAgo: z.number().int().nonnegative().nullable(),
  staleAfterDays: z.number().int().positive(),
  /** Las últimas descargas, de la más reciente a la más antigua. */
  downloads: z.array(backupDownloadSchema),
});
export type BackupStatusResponse = z.infer<typeof backupStatusResponseSchema>;

/** ¿Hay que avisar en el inicio del panel? Nunca hubo respaldo o pasaron `BACKUP_STALE_DAYS` días o más. */
export function isBackupStale(status: Pick<BackupStatusResponse, 'daysAgo'>): boolean {
  return status.daysAgo === null || status.daysAgo >= BACKUP_STALE_DAYS;
}
