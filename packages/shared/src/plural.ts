/**
 * Concordancia de número en los textos con un contador («1 lector», «3 lectores», «0 nuevos»). Es la ÚNICA función de
 * plural del proyecto (web y API): no se escriben `${n} lectores` ni `(s)` a mano. Solo el 1 va en singular.
 *
 * - `pluralWord(n, 'lector', 'lectores')` → la palabra que concuerda, sin el número: para concordar también un verbo o un
 *   adjetivo («Lo recibiría 1 lector»; «3 enviados» → `pluralWord(n, 'enviado', 'enviados')`).
 * - `plural(n, 'lector', 'lectores')` → el número y la palabra: `«1 lector»`, `«3 lectores»`.
 */
export function pluralWord(
  n: number | bigint | null | undefined,
  one: string,
  many: string,
): string {
  return Number(n ?? 0) === 1 ? one : many;
}

export function plural(n: number | bigint | null | undefined, one: string, many: string): string {
  return `${String(n ?? 0)} ${pluralWord(n, one, many)}`;
}
