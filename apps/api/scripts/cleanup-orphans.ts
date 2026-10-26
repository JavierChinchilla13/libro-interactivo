/**
 * Limpia los fondos de quiz huérfanos de Cloudinary (carpeta `libro/quiz-bg` SOLAMENTE). Por defecto solo INFORMA:
 *   npm run cleanup:orphans -w apps/api
 *   npm run cleanup:orphans -w apps/api -- --apply     # borra los huérfanos (a mano, una persona)
 * Un archivo es huérfano si ninguna apariencia vigente ni ningún estado anterior de su historial lo referencia y tiene
 * más de 30 días. Nunca se borra nada desde el API de edición: revertir una apariencia siempre encuentra sus archivos.
 */
import { parseEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { systemClock } from '../src/lib/clock.js';
import {
  cleanupOrphanMedia,
  ORPHAN_GRACE_DAYS,
  ORPHAN_PREFIX,
} from '../src/maintenance/orphanMedia.js';
import { createImageProvider } from '../src/providers/images/ImageProvider.js';

const apply = process.argv.slice(2).includes('--apply');

try {
  const env = parseEnv();
  await connectDb(env.MONGODB_URI);
  const report = await cleanupOrphanMedia({
    images: createImageProvider(env),
    clock: systemClock,
    apply,
  });
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  console.log(
    `${apply ? 'APLICADO' : 'SIMULACIÓN (usa --apply para borrar)'} · carpeta ${ORPHAN_PREFIX} · archivos: ${report.scanned} · referenciados: ${report.referenced} · recientes (menos de ${ORPHAN_GRACE_DAYS} días): ${report.protectedByGrace} · huérfanos: ${report.orphans.length} (${mb(report.orphanBytes)} MB)`,
  );
  for (const asset of report.orphans) {
    console.log(
      `- ${asset.resource} ${asset.publicId} · ${mb(asset.bytes)} MB · ${asset.createdAt}${
        report.deleted.includes(asset) ? ' · BORRADO' : ''
      }`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
