/** Reloj inyectable: permite probar caducidades y bloqueos sin esperar. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return addSeconds(date, minutes * 60);
}

export function addDays(date: Date, days: number): Date {
  return addSeconds(date, days * 86_400);
}
