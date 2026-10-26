import { LEGACY_ACCENT_HEX } from '@libro/shared';
import { Quiz } from '../models/Quiz.js';

export interface AccentMigrationReport {
  /** Quizzes revisados que tenían apariencia o historial. */
  scanned: number;
  /** Quizzes con algún acento con nombre (en la apariencia vigente o en un estado anterior del historial). */
  withNamedAccent: number;
  /** Cuántos acentos con nombre se encontraron en total. */
  namedAccents: number;
  /** Los acentos reescritos (vacío en simulación). */
  rewritten: number;
  applied: boolean;
}

const hexOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value in LEGACY_ACCENT_HEX
    ? LEGACY_ACCENT_HEX[value as keyof typeof LEGACY_ACCENT_HEX]
    : undefined;

/**
 * Reescribe como `#RRGGBB` los acentos que se guardaron con el nombre de un token (`primary`, `accent`, `success`,
 * `warning`), tanto en la apariencia vigente como en `appearanceHistory[].before`. Es idempotente y no toca nada más:
 * ni versiones de quiz ni revisiones. Por defecto solo informa (simulación). La lectura ya traduce los nombres al
 * parsear, así que correrla no es obligatorio: deja los datos guardados en la forma nueva.
 */
export async function migrateAccents(
  options: { apply?: boolean } = {},
): Promise<AccentMigrationReport> {
  const apply = options.apply ?? false;
  const report: AccentMigrationReport = {
    scanned: 0,
    withNamedAccent: 0,
    namedAccents: 0,
    rewritten: 0,
    applied: apply,
  };
  const quizzes = Quiz.find({
    $or: [{ appearance: { $exists: true } }, { 'appearanceHistory.0': { $exists: true } }],
  })
    .select('appearance appearanceHistory appearanceRev')
    .lean()
    .cursor();
  for await (const quiz of quizzes) {
    report.scanned += 1;
    const set: Record<string, string> = {};
    const current = hexOf((quiz.appearance as { accent?: unknown } | undefined)?.accent);
    if (current) set['appearance.accent'] = current;
    (quiz.appearanceHistory ?? []).forEach((entry, index) => {
      const before = hexOf((entry.before as { accent?: unknown } | null | undefined)?.accent);
      if (before) set[`appearanceHistory.${index}.before.accent`] = before;
    });
    const found = Object.keys(set).length;
    if (found === 0) continue;
    report.withNamedAccent += 1;
    report.namedAccents += found;
    if (apply) {
      // Se filtra por la revisión leída: si alguien guardó mientras tanto, los índices del historial se habrían movido.
      const result = await Quiz.collection.updateOne(
        { _id: quiz._id, appearanceRev: quiz.appearanceRev ?? 0 },
        { $set: set },
      );
      if (result.matchedCount === 1) report.rewritten += found;
    }
  }
  return report;
}
