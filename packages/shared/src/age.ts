import { ADULT_AGE, MIN_ACCOUNT_AGE } from './legal.js';

/** Año y mes de nacimiento (lo único que se pide: nunca el día). */
export interface BirthMonth {
  year: number;
  month: number;
}

/** Nadie vive más que esto: una fecha más antigua es un error de dedo o un intento de burlar la regla. */
export const MAX_AGE_YEARS = 120;

/**
 * Edad conservadora con solo año y mes. Una persona cumple N años **al terminar su mes de nacimiento**: antes de eso
 * se cuenta como un año menos. Ejemplo: nacida en 03/2010 cuenta 15 durante todo marzo de 2026 y 16 desde abril de
 * 2026. Se calcula con el mes UTC, igual en el servidor y en el navegador (el servidor es quien decide).
 */
export function ageFromBirth(birth: BirthMonth, now: Date): number {
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  return nowYear - birth.year - (nowMonth <= birth.month ? 1 : 0);
}

export type BirthCheck = { valid: false } | { valid: true; age: number };

/**
 * Una fecha posible: mes de 1 a 12, año entero, no en el futuro (ni el mes que viene) y no más de 120 años atrás. No
 * dice nada sobre si la edad alcanza: eso es `ageBand`.
 */
export function checkBirth(birth: BirthMonth, now: Date): BirthCheck {
  if (!Number.isInteger(birth.year) || !Number.isInteger(birth.month)) return { valid: false };
  if (birth.month < 1 || birth.month > 12) return { valid: false };
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const inFuture = birth.year > nowYear || (birth.year === nowYear && birth.month > nowMonth);
  if (inFuture) return { valid: false };
  const age = ageFromBirth(birth, now);
  if (age > MAX_AGE_YEARS) return { valid: false };
  return { valid: true, age };
}

/** `under`: menor de 16 (no puede tener cuenta); `minor`: de 16 a 17 (con autorización); `adult`: 18 o más. */
export type AgeBand = 'under' | 'minor' | 'adult';

export function ageBand(age: number): AgeBand {
  if (age < MIN_ACCOUNT_AGE) return 'under';
  return age < ADULT_AGE ? 'minor' : 'adult';
}

/** Lo que la persona debe declarar según su edad calculada (una barrera honesta, no una verificación). */
export function expectedDeclaration(
  band: Exclude<AgeBand, 'under'>,
): 'adult' | 'minor_with_guardian' {
  return band === 'adult' ? 'adult' : 'minor_with_guardian';
}

/** Mensaje único y amable para quien no alcanza la edad: es el mismo en el servidor y en el formulario. */
export const AGE_RESTRICTED_MESSAGE =
  'Este libro es para personas de 16 años o más. Cuando cumplas 16 te esperamos.';
