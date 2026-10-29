import { registerRequestSchema } from '@libro/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { fieldErrors } from '../../shared/api/messages';
import { Button, TextField } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { AuthShell, OrDivider, QR_TAGLINE } from './AuthShell';
import {
  ConsentFields,
  EMPTY_CONSENT,
  resolveConsent,
  type ConsentErrors,
  type ConsentValues,
} from './ConsentFields';
import { GOOGLE_CLIENT_ID, GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';
import { GoogleProfileStep } from './GoogleProfileStep';
import { homeFor, useRegister, useSession } from './session';
import { useGoogleAccess } from './useGoogleAccess';

/** Solo para revisar nombre, correo y contraseña cuando la edad aún no está resuelta: nunca se envía. */
const PLACEHOLDER_CONSENT = {
  birth: { year: 2000, month: 1 },
  ageDeclaration: 'adult',
  acceptTerms: true,
  acceptPrivacy: true,
} as const;

/**
 * Crear cuenta. Valida con la política del servidor mientras se escribe; el correo
 * ya registrado se responde con un mensaje genérico. Si la persona venía de un QR, vuelve a esa pantalla.
 */
export function RegisterPage() {
  const session = useSession();
  const register = useRegister();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const google = useGoogleAccess((user) => void navigate(from ?? homeFor(user), { replace: true }));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState<ConsentValues>(EMPTY_CONSENT);
  const [consentErrors, setConsentErrors] = useState<ConsentErrors>({});

  if (session.data) return <Navigate to={from ?? homeFor(session.data)} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    // La edad y los consentimientos se revisan junto con el resto: se muestran todos los avisos a la vez. Quien no
    // alcanza la edad no manda nada al servidor.
    const age = resolveConsent(consent, new Date());
    setConsentErrors(age.ok ? {} : age.errors);
    const parsed = registerRequestSchema.safeParse({
      name,
      email,
      password,
      ...(age.ok ? age.consent : PLACEHOLDER_CONSENT),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    if (!age.ok) {
      setErrors({});
      return;
    }
    setErrors({});
    register.mutate(parsed.data, {
      onSuccess: (data) => void navigate(from ?? homeFor(data.user), { replace: true }),
    });
  }

  const failure = register.error instanceof ApiClientError ? register.error : null;
  const message =
    failure?.code === 'AGE_RESTRICTED'
      ? failure.message
      : failure?.code === 'CONFLICT'
        ? 'No se pudo completar el registro. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.'
        : failure?.code === 'RATE_LIMITED'
          ? 'Demasiados intentos. Espera un rato e inténtalo de nuevo.'
          : failure?.code === 'VALIDATION'
            ? failure.message
            : failure
              ? 'No pudimos crear tu cuenta. Inténtalo de nuevo.'
              : null;

  // Persona nueva con Google: aún no existe cuenta; se piden la edad y los consentimientos.
  if (google.pending) {
    return (
      <AuthShell title="Un último paso">
        <GoogleProfileStep
          name={google.pending.name}
          email={google.pending.email}
          pending={google.isPending}
          error={google.error}
          onSubmit={google.submitProfile}
          onCancel={google.cancel}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crea tu cuenta" tagline={QR_TAGLINE}>
      {GOOGLE_CLIENT_ID ? (
        <>
          <GoogleButton disabled={google.isPending} onCredential={google.start} />
          <OrDivider />
        </>
      ) : null}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Nombre"
          required
          autoComplete="name"
          value={name}
          error={errors['name']}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          hint="No se podrá cambiar después."
          value={email}
          error={errors['email']}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          label="Contraseña"
          value={password}
          onChange={setPassword}
          error={errors['password']}
          context={{ name, email }}
          showMeter
        />
        <ConsentFields values={consent} onChange={setConsent} errors={consentErrors} />
        {message ? (
          <Alert tone={failure?.code === 'AGE_RESTRICTED' ? 'warning' : 'danger'}>{message}</Alert>
        ) : null}
        <Button type="submit" loading={register.isPending}>
          Crear cuenta
        </Button>
        <p className="text-center text-sm text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to="/ingresar" state={location.state} className="underline">
            Ingresa
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
