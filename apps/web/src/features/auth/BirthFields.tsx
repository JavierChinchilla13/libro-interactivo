import { ageBand, checkBirth, type AgeBand } from '@libro/shared';
import { SelectField } from '../../shared/ui/controls';

/**
 * Mes y año de nacimiento: los mismos campos y la misma validación para el registro (`ConsentFields`) y para quien
 * declara su fecha al apuntarse a las novedades (`NewsletterBirthForm`). Solo se pide el mes y el año, nunca el día; la
 * edad la decide el servidor (esto es solo la ayuda del formulario).
 */
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const MONTH_OPTIONS = MONTHS.map((label, index) => ({ value: String(index + 1), label }));

/** De este año hacia atrás, 100 años. */
function yearOptions(now: Date) {
  const current = now.getUTCFullYear();
  return Array.from({ length: 101 }, (_, i) => {
    const year = String(current - i);
    return { value: year, label: year };
  });
}

/** Qué se sabe de la fecha elegida: nada todavía, una fecha imposible, o la franja de edad en que cae. */
export type BirthBand = { kind: 'empty' } | { kind: 'invalid' } | { kind: AgeBand };

export function birthBand(month: string, year: string, now: Date): BirthBand {
  if (!month || !year) return { kind: 'empty' };
  const check = checkBirth({ year: Number(year), month: Number(month) }, now);
  if (!check.valid) return { kind: 'invalid' };
  return { kind: ageBand(check.age) };
}

export function BirthFields({
  month,
  year,
  onChange,
  error,
  now = new Date(),
}: {
  month: string;
  year: string;
  onChange: (next: { month: string; year: string }) => void;
  /** Un error propio de la fecha (el formulario decide cuándo mostrarlo). */
  error?: string | undefined;
  now?: Date;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Fecha de nacimiento</legend>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Mes"
          required
          placeholder="Mes"
          options={MONTH_OPTIONS}
          value={month}
          onChange={(event) => onChange({ month: event.target.value, year })}
        />
        <SelectField
          label="Año"
          required
          placeholder="Año"
          options={yearOptions(now)}
          value={year}
          onChange={(event) => onChange({ month, year: event.target.value })}
        />
      </div>
      <p className="text-xs text-muted">Solo guardamos el mes y el año, no el día.</p>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
