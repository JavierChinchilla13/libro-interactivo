import { loginRequestSchema } from '@libro/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { Button, TextField } from '../../shared/ui/controls';
import { Alert, Card } from '../../shared/ui/layout';
import { homeFor, useLogin, useSession } from './session';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  if (session.data) return <Navigate to={from ?? homeFor(session.data)} replace />;

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
      onSuccess: (data) => void navigate(from ?? homeFor(data.user), { replace: true }),
    });
  }

  const failure = login.error instanceof ApiClientError ? login.error : null;
  const message =
    failure?.code === 'AUTH_INVALID'
      ? 'Correo o contraseña incorrectos.'
      : failure?.code === 'RATE_LIMITED'
        ? 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
        : failure
          ? 'No pudimos iniciar sesión. Inténtalo de nuevo.'
          : null;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-4 font-display text-2xl font-bold">Ingresar</h1>
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
          <TextField
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            required
          />
          {message ? <Alert>{message}</Alert> : null}
          <Button type="submit" loading={login.isPending}>
            Ingresar
          </Button>
          <div className="flex flex-col gap-1 text-sm">
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
      </Card>
    </div>
  );
}
