/** Las fechas de salida se piensan en hora de Costa Rica (UTC−6, sin horario de verano), igual que los eventos. */
const SITE_UTC_OFFSET = '-06:00';

/**
 * Momento exacto de la salida. Una fecha sola (`AAAA-MM-DD`) significa la medianoche de ese día en Costa Rica; si la
 * autora agrega la hora (ISO completo) se respeta tal cual. Inválido → `undefined`.
 */
export function releaseTarget(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value.length === 10 ? `${value}T00:00:00${SITE_UTC_OFFSET}` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export interface RemainingParts {
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function remainingParts(now: number, target: Date): RemainingParts {
  const total = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  return {
    done: total === 0,
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Frase para lectores de pantalla (se actualiza cada minuto, no cada segundo). */
export function describeRemaining(parts: RemainingParts): string {
  const pieces = [
    parts.days > 0 ? plural(parts.days, 'día', 'días') : '',
    parts.days > 0 || parts.hours > 0 ? plural(parts.hours, 'hora', 'horas') : '',
    plural(parts.minutes, 'minuto', 'minutos'),
  ].filter(Boolean);
  return `Faltan ${pieces.join(', ')}.`;
}
