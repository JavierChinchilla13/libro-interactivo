import { QUIZ_BG_FOLDER } from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { Quiz } from '../models/Quiz.js';
import type { AssetInfo, ImageProvider } from '../providers/images/ImageProvider.js';

/** Solo se toca esta carpeta de Cloudinary (los fondos de quiz): nunca portadas, wiki, publicaciones ni resultados. */
export const ORPHAN_PREFIX = `${QUIZ_BG_FOLDER}/`;
/** Margen para subidas que todavía no se guardaron en ninguna apariencia. */
export const ORPHAN_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrphanReport {
  /** Archivos de la carpeta de fondos que hay en Cloudinary. */
  scanned: number;
  /** Los que siguen referenciados (apariencia vigente o cualquier estado anterior del historial). */
  referenced: number;
  /** Sin referencia pero más recientes que el margen: no se tocan todavía. */
  protectedByGrace: number;
  /** Sin referencia y con más de 30 días: lo que `--apply` borraría. */
  orphans: AssetInfo[];
  orphanBytes: number;
  /** Los que se borraron (vacío en simulación). */
  deleted: AssetInfo[];
  applied: boolean;
}

/**
 * Texto con todo lo que referencian las apariencias: el bloque vigente y TODOS los estados anteriores del historial
 * (revertir apuntaría a ellos). Un archivo está referenciado si su `publicId` aparece en ese texto.
 */
async function referencedText(): Promise<string> {
  const quizzes = Quiz.find({
    $or: [{ appearance: { $exists: true } }, { 'appearanceHistory.0': { $exists: true } }],
  })
    .select('appearance appearanceHistory.before')
    .lean()
    .cursor();
  const parts: string[] = [];
  for await (const quiz of quizzes) {
    parts.push(JSON.stringify(quiz.appearance ?? null));
    for (const entry of quiz.appearanceHistory ?? [])
      parts.push(JSON.stringify(entry.before ?? null));
  }
  return parts.join('\n');
}

/**
 * Limpieza manual de fondos de quiz huérfanos en Cloudinary. Por defecto solo INFORMA. Con `apply` borra únicamente los
 * archivos de `libro/quiz-bg/` que ninguna apariencia ni su historial referencia y que tienen más de 30 días. El API de
 * edición nunca borra nada: esta es la única vía, y la ejecuta una persona.
 */
export async function cleanupOrphanMedia(options: {
  images: ImageProvider;
  clock: Clock;
  apply?: boolean;
}): Promise<OrphanReport> {
  const { images, clock, apply = false } = options;
  const [pictures, videos, text] = await Promise.all([
    images.list({ prefix: ORPHAN_PREFIX, resource: 'image' }),
    images.list({ prefix: ORPHAN_PREFIX, resource: 'video' }),
    referencedText(),
  ]);
  const assets = [...pictures, ...videos].filter((asset) =>
    asset.publicId.startsWith(ORPHAN_PREFIX),
  );
  const limit = clock().getTime() - ORPHAN_GRACE_DAYS * DAY_MS;

  const orphans: AssetInfo[] = [];
  let referenced = 0;
  let protectedByGrace = 0;
  for (const asset of assets) {
    if (text.includes(asset.publicId)) referenced += 1;
    else if (new Date(asset.createdAt).getTime() > limit) protectedByGrace += 1;
    else orphans.push(asset);
  }

  const deleted: AssetInfo[] = [];
  if (apply) {
    for (const asset of orphans) {
      // Doble comprobación: nunca se borra nada fuera de la carpeta de fondos.
      if (!asset.publicId.startsWith(ORPHAN_PREFIX)) continue;
      await images.destroy({ publicId: asset.publicId, resource: asset.resource });
      deleted.push(asset);
    }
  }
  return {
    scanned: assets.length,
    referenced,
    protectedByGrace,
    orphans,
    orphanBytes: orphans.reduce((sum, asset) => sum + asset.bytes, 0),
    deleted,
    applied: apply,
  };
}
