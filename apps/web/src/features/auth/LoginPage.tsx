import { loginRequestSchema, type Consent } from '@libro/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { Button, TextField } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { AuthShell, OrDivider, QR_TAGLINE } from './AuthShell';
import { GOOGLE_CLIENT_ID, GoogleButton } from './GoogleButton';
import { PasswordField } from '../../shared/ui/PasswordField';
import { GoogleProfileStep } from './GoogleProfileStep';
import { landingAfterLogin, useLogin, useSession } from './session';
import { useGoogleAccess } from './useGoogleAccess';

/**
 * Ingreso. Mensajes genéricos: nunca dice si el correo existe.
 * Las editoras y administradoras van al panel; el registro y la recuperación llegan con las pantallas del lector.
 */
export function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const google = useGoogleAccess(
    (user) => void navigate(landingAfterLogin(user, from), { replace: true }),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  // La contraseña fue correcta pero hay que volver a declarar la edad y los consentimientos (viven solo en memoria).
  const [retake, setRetake] = useState<{ name: string; email: string } | null>(null);

  if (session.data) return <Navigate to={landingAfterLogin(session.data, from)} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === 'email' || key === 'password') && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    login.mutate(parsed.data, {
      onSuccess: (data) => {
        if (data.status === 'ok')
          void navigate(landingAfterLogin(data.user, from), { replace: true });
        else setRetake({ name: data.name, email: data.email });
      },
    });
  }

  function submitRetake(profile: Consent) {
    login.mutate(
      { email, password, profile },
      {
        onSuccess: (data) => {
          if (data.status === 'ok')
            void navigate(landingAfterLogin(data.user, from), { replace: true });
        },
      },
    );
  }

  function cancelRetake() {
    setRetake(null);
    setPassword('');
    login.reset();
  }

  const error = login.error ?? google.error;
  const failure = error instanceof ApiClientError ? error : null;
  const message =
    failure?.code === 'AUTH_INVALID'
      ? 'Correo o contraseña incorrectos.'
      : failure?.code === 'RATE_LIMITED'
        ? 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
        : failure
          ? 'No pudimos iniciar sesión. Inténtalo de nuevo.'
          : null;

  // Cuenta cuya edad y consentimientos hay que volver a declarar antes de abrir sesión.
  if (retake) {
    return (
      <AuthShell title="Un último paso">
        <GoogleProfileStep
          name={retake.name}
          email={retake.email}
          pending={login.isPending}
          error={login.error}
          onSubmit={submitRetake}
          onCancel={cancelRetake}
          intro={
            <>
              Hola, <strong className="text-text">{retake.name}</strong>. Antes de entrar
              necesitamos que confirmes tu edad y des tu autorización de nuevo.
            </>
          }
          submitLabel="Continuar"
        />
      </AuthShell>
    );
  }

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
    <AuthShell title="Ingresar" tagline={QR_TAGLINE}>
      {GOOGLE_CLIENT_ID ? (
        <>
          <GoogleButton disabled={google.isPending} onCredential={google.start} />
          <OrDivider />
        </>
      ) : null}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Correo"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />
        <PasswordField
          label="Contraseña"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
        />
        {message ? <Alert>{message}</Alert> : null}
        <Button type="submit" loading={login.isPending}>
          Ingresar
        </Button>
        <div className="flex flex-col items-center gap-1 text-center text-sm">
          <Link to="/olvide-mi-contrasena" className="underline">
            ¿Olvidaste tu contraseña?
          </Link>
          <span className="text-muted">
            ¿No tienes cuenta?{' '}
            <Link to="/registro" state={location.state} className="underline">
              Crea una
            </Link>
          </span>
        </div>
      </form>
    </AuthShell>
  );
}
