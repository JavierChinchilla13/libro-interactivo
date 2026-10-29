import {
  ADULT_AGE,
  AGE_RESTRICTED_MESSAGE,
  MIN_ACCOUNT_AGE,
  ageBand,
  checkBirth,
  type Consent,
} from '@libro/shared';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { SelectField } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';

/** Lo que la persona escribe en el formulario de edad y consentimientos (todo en texto, como lo da el navegador). */
export interface ConsentValues {
  month: string;
  year: string;
  /** La casilla de edad: «tengo 18 o más» o la autorización de madre, padre o tutor (según la edad calculada). */
  ageCheck: boolean;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

export const EMPTY_CONSENT: ConsentValues = {
  month: '',
  year: '',
  ageCheck: false,
  acceptTerms: false,
  acceptPrivacy: false,
};

export type ConsentErrors = Partial<
  Record<'birth' | 'ageCheck' | 'acceptTerms' | 'acceptPrivacy', string>
>;

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

/** Qué se sabe de la fecha elegida: nada todavía, una menor de 16, o la franja de edad en que cae. */
export type BirthState =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'under' }
  | { kind: 'minor' }
  | { kind: 'adult' };

export function birthState(values: ConsentValues, now: Date): BirthState {
  if (!values.month || !values.year) return { kind: 'empty' };
  const check = checkBirth({ year: Number(values.year), month: Number(values.month) }, now);
  if (!check.valid) return { kind: 'invalid' };
  return { kind: ageBand(check.age) };
}

/**
 * Convierte lo escrito en el contrato del API, o dice qué falta. Para quien no alcanza la edad **no** devuelve datos
 * para enviar: el formulario no manda nada al servidor (el servidor, además, decide por su cuenta).
 */
export function resolveConsent(
  values: ConsentValues,
  now: Date,
): { ok: true; consent: Consent } | { ok: false; errors: ConsentErrors } {
  const state = birthState(values, now);
  const errors: ConsentErrors = {};
  if (state.kind === 'empty') errors.birth = 'Elige el mes y el año de tu nacimiento.';
  else if (state.kind === 'invalid') errors.birth = 'Revisa tu fecha de nacimiento.';
  else if (state.kind === 'under') errors.birth = AGE_RESTRICTED_MESSAGE;
  else if (!values.ageCheck) {
    errors.ageCheck =
      state.kind === 'minor'
        ? 'Marca la autorización de tu madre, padre o tutor para continuar.'
        : 'Marca la casilla para continuar.';
  }
  if (!values.acceptTerms) errors.acceptTerms = 'Acepta los términos de uso para continuar.';
  if (!values.acceptPrivacy) {
    errors.acceptPrivacy = 'Autoriza el tratamiento de tus datos para continuar.';
  }
  if (Object.keys(errors).length > 0 || state.kind === 'under' || state.kind === 'empty') {
    return { ok: false, errors };
  }
  return {
    ok: true,
    consent: {
      birth: { year: Number(values.year), month: Number(values.month) },
      ageDeclaration: state.kind === 'minor' ? 'minor_with_guardian' : 'adult',
      acceptTerms: true,
      acceptPrivacy: true,
    },
  };
}

function Check({
  checked,
  onChange,
  error,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string | undefined;
  children: ReactNode;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 size-5 shrink-0 accent-[var(--token-primary)]"
        />
        <label htmlFor={id} className="text-sm leading-snug">
          {children}
        </label>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="pl-8 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Los textos legales se abren en otra pestaña para no perder lo que ya se escribió en el formulario. */
function LegalLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </Link>
  );
}

/**
 * Edad y consentimientos del alta (registro y segundo paso de Google). **Son declaraciones:** el sitio no verifica la
 * edad ni quién autoriza. El mes y el año eligen la casilla que corresponde (adulta, o de 16 a 17 con autorización); a
 * quien no alcanza la edad se le dice con el mismo mensaje del servidor y no se le pide nada más.
 *
 * Los dos consentimientos van en casillas separadas (términos de uso, y tratamiento de datos personales).
 */
export function ConsentFields({
  values,
  onChange,
  errors,
  now = new Date(),
}: {
  values: ConsentValues;
  onChange: (next: ConsentValues) => void;
  errors: ConsentErrors;
  now?: Date;
}) {
  const state = birthState(values, now);
  const set = (change: Partial<ConsentValues>) => onChange({ ...values, ...change });
  const blocked = state.kind === 'under';
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Fecha de nacimiento</legend>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Mes"
            required
            placeholder="Mes"
            options={MONTH_OPTIONS}
            value={values.month}
            onChange={(event) => set({ month: event.target.value, ageCheck: false })}
          />
          <SelectField
            label="Año"
            required
            placeholder="Año"
            options={yearOptions(now)}
            value={values.year}
            onChange={(event) => set({ year: event.target.value, ageCheck: false })}
          />
        </div>
        <p className="text-xs text-muted">Solo guardamos el mes y el año, no el día.</p>
        {errors.birth && !blocked ? (
          <p role="alert" className="text-xs text-danger">
            {errors.birth}
          </p>
        ) : null}
      </fieldset>

      {blocked ? <Alert tone="warning">{AGE_RESTRICTED_MESSAGE}</Alert> : null}

      {state.kind === 'minor' || state.kind === 'adult' ? (
        <Check
          checked={values.ageCheck}
          onChange={(ageCheck) => set({ ageCheck })}
          error={errors.ageCheck}
        >
          {state.kind === 'minor'
            ? `Tengo ${MIN_ACCOUNT_AGE} años o más. Soy menor de ${ADULT_AGE} y mi madre, padre o tutor autoriza el uso de mi cuenta y de mis datos.`
            : `Tengo ${ADULT_AGE} años o más.`}
        </Check>
      ) : null}

      {blocked ? null : (
        <>
          <Check
            checked={values.acceptTerms}
            onChange={(acceptTerms) => set({ acceptTerms })}
            error={errors.acceptTerms}
          >
            Acepto los <LegalLink to="/terminos">términos de uso</LegalLink>.
          </Check>
          <Check
            checked={values.acceptPrivacy}
            onChange={(acceptPrivacy) => set({ acceptPrivacy })}
            error={errors.acceptPrivacy}
          >
            Autorizo el tratamiento de mis datos personales, incluido que se guarden con proveedores
            en otros países, según la <LegalLink to="/privacidad">política de privacidad</LegalLink>
            .
          </Check>
          <p className="text-xs text-muted">
            Los textos legales son un borrador pendiente de revisión legal. Lo que marcas es una
            declaración tuya: no verificamos tu edad.
          </p>
        </>
      )}
    </div>
  );
}
