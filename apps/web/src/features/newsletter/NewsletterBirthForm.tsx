import { NEWSLETTER_MINOR_MESSAGE, NEWSLETTER_NEEDS_BIRTH_MESSAGE } from '@libro/shared';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../shared/ui/layout';
import { BirthFields, birthBand } from '../auth/BirthFields';

/**
 * Se muestra cuando una cuenta SIN fecha de nacimiento (anterior al paso de edad) quiere apuntarse a las novedades: se le
 * piden el mes y el año, con los mismos campos y la misma validación del registro. Nada se manda hasta que la fecha
 * alcanza los 18: a quien no llega se le dice claro que las novedades son solo para mayores de 18 y no se envía (ni el
 * servidor guarda) nada. El servidor decide por su cuenta.
 */
export function NewsletterBirthForm({
  onSubmit,
  onCancel,
  pending,
  serverError,
  now = new Date(),
}: {
  onSubmit: (birth: { year: number; month: number }) => void;
  onCancel: () => void;
  pending: boolean;
  /** Lo que respondió el servidor si rechazó la fecha. */
  serverError?: string | undefined;
  now?: Date;
}) {
  const [value, setValue] = useState({ month: '', year: '' });
  const [tried, setTried] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // El botón que abrió este paso desaparece: el foco pasa aquí para no perderse (y se anuncia).
  useEffect(() => ref.current?.focus(), []);

  const band = birthBand(value.month, value.year, now);
  const tooYoung = band.kind === 'under' || band.kind === 'minor';
  const problem =
    band.kind === 'empty'
      ? 'Elige el mes y el año de tu nacimiento.'
      : band.kind === 'invalid'
        ? 'Revisa tu fecha de nacimiento.'
        : undefined;

  const submit = () => {
    if (pending) return;
    setTried(true);
    if (band.kind !== 'adult') return;
    onSubmit({ year: Number(value.year), month: Number(value.month) });
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby="newsletter-birth-title"
      tabIndex={-1}
      className="flex flex-col gap-3 outline-none"
    >
      <p id="newsletter-birth-title" className="text-sm text-pretty">
        {NEWSLETTER_NEEDS_BIRTH_MESSAGE}
      </p>
      <BirthFields
        month={value.month}
        year={value.year}
        now={now}
        onChange={setValue}
        error={tried ? problem : undefined}
      />
      {tooYoung ? <Alert tone="warning">{NEWSLETTER_MINOR_MESSAGE}</Alert> : null}
      {serverError && !tooYoung ? <Alert>{serverError}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={`btn btn-primary flex-1 sm:flex-none ${pending || tooYoung ? 'opacity-60' : ''}`}
          aria-disabled={pending || tooYoung}
          onClick={submit}
        >
          Guardar y apuntarme
        </button>
        <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
