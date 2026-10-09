/** Fecha `AAAA-MM-DD` (o ISO) en español, sin que la zona horaria del navegador la corra un día. */
export function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/**
 * Las horas de los eventos son de Costa Rica (UTC−6, sin horario de verano): así la autora escribe «4:00 p. m.» y
 * todos ven lo mismo sin importar dónde estén. `datetime-local` ↔ ISO se convierte con este desfase fijo.
 */
const SITE_TIME_ZONE = 'America/Costa_Rica';
const SITE_UTC_OFFSET = '-06:00';

/** `2027-03-20T16:00` (hora de Costa Rica) → ISO en UTC. Vacío o inválido → `undefined`. */
export function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  // `datetime-local` entrega «AAAA-MM-DDThh:mm» (a veces con segundos).
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const date = new Date(`${withSeconds}${SITE_UTC_OFFSET}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** ISO → valor de `datetime-local` en hora de Costa Rica (para llenar el formulario). */
export function isoToLocal(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SITE_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
}

/** Fecha y hora para mostrar al público, siempre en hora de Costa Rica. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: SITE_TIME_ZONE,
  }).format(date);
}

/** Fecha corta (sin hora) para tarjetas y encabezados, en hora de Costa Rica. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeZone: SITE_TIME_ZONE }).format(
    date,
  );
}
