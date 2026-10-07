/** Fecha `AAAA-MM-DD` (o ISO) en español, sin que la zona horaria del navegador la corra un día. */
export function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
