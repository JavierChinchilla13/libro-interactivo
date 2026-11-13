import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

/**
 * Ciclo de vida del contenido del panel (actualizaciones, cartas, extras, fan arts, reseñas y entradas de la wiki):
 *
 * - **Archivar** es reversible y lo oculta del público (`POST …/archive`). **Restaurar** (`POST …/restore`) lo devuelve a
 *   «borrador» (a «publicada» en lo que no tiene borrador, como las cartas y las reseñas): nada reaparece en público sin
 *   que alguien lo vuelva a publicar a propósito.
 * - **Eliminar definitivamente** (`DELETE …`, solo ADMIN) solo se permite con lo archivado o en borrador, nunca con lo
 *   publicado, y se bloquea con un mensaje claro si hay algo que depende de ello (un aviso ya enviado por correo, una carta
 *   ya abierta por lectores…). **Nunca** borra imágenes de Cloudinary: de eso se encarga solo `cleanup:orphans`.
 */
export interface Noun {
  /** «actualización», «carta», «extra»… */
  name: string;
  /** Género gramatical, para concordar los mensajes («la actualización … archivada»). */
  feminine: boolean;
}

const article = (noun: Noun) => (noun.feminine ? 'la' : 'el');

/** El estado «archivado» en el género del sustantivo. */
const archived = (noun: Noun) => (noun.feminine ? 'archivada' : 'archivado');

/** Lo publicado (o visible) no se elimina: primero se archiva. */
export function notDeletableError(noun: Noun, draftToo = true): AppError {
  const states = draftToo ? `${archived(noun)} o en borrador` : archived(noun);
  const archive = noun.feminine ? 'Archívala' : 'Archívalo';
  return new AppError(
    'CONFLICT',
    `Solo se puede eliminar ${article(noun)} ${noun.name} si está ${states}. ${archive} primero.`,
  );
}

/** Restaurar solo tiene sentido con lo archivado. */
export function notArchivedError(noun: Noun): AppError {
  return new AppError(
    'CONFLICT',
    `${noun.feminine ? 'Esta' : 'Este'} ${noun.name} no está ${archived(noun)}: no hay nada que restaurar.`,
  );
}

/** Algo depende de lo que se quiere borrar: se explica qué y se sugiere archivar. */
export function blockedError(message: string): AppError {
  return new AppError('CONFLICT', message);
}

/**
 * Quién borró qué y cuándo. No hay un registro de auditoría general en la aplicación (solo el historial de la apariencia
 * de un quiz), así que queda en el registro del servidor (pino) con el identificador de quien lo pidió y el de lo
 * eliminado; el registro de hora lo pone el logger. Nunca lleva correos ni contenido personal.
 */
export function auditDeletion(
  logger: Logger | undefined,
  entry: { entity: string; id: string; title?: string | undefined; actorId: string },
): void {
  logger?.info(
    {
      audit: 'delete',
      entity: entry.entity,
      id: entry.id,
      actorId: entry.actorId,
      ...(entry.title ? { title: entry.title } : {}),
    },
    'Contenido eliminado definitivamente',
  );
}
