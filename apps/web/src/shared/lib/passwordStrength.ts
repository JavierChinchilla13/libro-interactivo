import { PASSWORD_PROBLEM_MESSAGES, checkPassword } from '@libro/shared';

export interface PasswordStrength {
  /** 0 = vacía, 1 = no cumple las reglas, 2 = cumple lo mínimo, 3 = buena, 4 = muy buena. */
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Mensajes (los mismos que da el servidor) de lo que todavía no cumple. */
  problems: string[];
}

const LABELS = ['', 'No cumple las reglas', 'Aceptable', 'Buena', 'Muy buena'] as const;

/**
 * Indicador orientativo (NO sustituye las reglas, que impone el servidor): usa la misma política compartida y,
 * si la cumple, sube de nivel con la longitud.
 */
export function passwordStrength(
  password: string,
  context?: { name?: string; email?: string },
): PasswordStrength {
  if (password === '') return { level: 0, label: LABELS[0], problems: [] };
  const problems = checkPassword(password, context).map(
    (problem) => PASSWORD_PROBLEM_MESSAGES[problem],
  );
  if (problems.length > 0) return { level: 1, label: LABELS[1], problems };
  const level = password.length >= 16 ? 4 : password.length >= 13 ? 3 : 2;
  return { level, label: LABELS[level], problems: [] };
}
