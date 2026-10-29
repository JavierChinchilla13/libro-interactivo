import { useState, type FormEvent } from 'react';
import { ApiClientError } from '../../shared/api/client';
import { Button } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import {
  ConsentFields,
  EMPTY_CONSENT,
  resolveConsent,
  type ConsentErrors,
  type ConsentValues,
} from './ConsentFields';
import type { Consent } from '@libro/shared';

/**
 * Segundo paso de «Continuar con Google» para una persona nueva: aún no existe cuenta. Se muestran el nombre y el
 * correo que Google ya verificó y se piden la edad y los consentimientos. Al confirmar, la web reenvía la misma
 * credencial con esos datos; mientras tanto no se ha guardado nada en el servidor.
 */
export function GoogleProfileStep({
  name,
  email,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  name: string;
  email: string;
  pending: boolean;
  error: unknown;
  onSubmit: (consent: Consent) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ConsentValues>(EMPTY_CONSENT);
  const [errors, setErrors] = useState<ConsentErrors>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = resolveConsent(values, new Date());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.consent);
  }

  const failure = error instanceof ApiClientError ? error : null;
  const message =
    failure?.code === 'AGE_RESTRICTED'
      ? failure.message
      : failure?.code === 'VALIDATION'
        ? failure.message
        : failure
          ? 'No pudimos crear tu cuenta. Inténtalo de nuevo.'
          : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Entraste con Google como <strong className="text-text">{name}</strong> ({email}). Para crear
        tu cuenta necesitamos tu edad y tu autorización.
      </p>
      <ConsentFields values={values} onChange={setValues} errors={errors} />
      {message ? (
        <Alert tone={failure?.code === 'AGE_RESTRICTED' ? 'warning' : 'danger'}>{message}</Alert>
      ) : null}
      <Button type="submit" loading={pending}>
        Crear mi cuenta
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  );
}
