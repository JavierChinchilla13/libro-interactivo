import { registerRequestSchema } from '@libro/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { fieldErrors } from '../../shared/api/messages';
import { Button, TextField } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';
import { homeFor, useRegister, useSession } from './session';

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (session.data) return <Navigate to={from ?? homeFor(session.data)} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = registerRequestSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    register.mutate(parsed.data, {
      onSuccess: (data) => void navigate(from ?? homeFor(data.user), { replace: true }),
    });
  }

  const failure = register.error instanceof ApiClientError ? register.error : null;
  const message =
    failure?.code === 'CONFLICT'
      ? 'No se pudo completar el registro. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.'
      : failure?.code === 'RATE_LIMITED'
        ? 'Demasiados intentos. Espera un rato e inténtalo de nuevo.'
        : failure?.code === 'VALIDATION'
          ? failure.message
          : failure
            ? 'No pudimos crear tu cuenta. Inténtalo de nuevo.'
            : null;

  return (
    <AuthShell title="Crea tu cuenta">
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
        {message ? <Alert>{message}</Alert> : null}
        <Button type="submit" loading={register.isPending}>
          Crear cuenta
        </Button>
        <p className="text-sm text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to="/ingresar" state={location.state} className="underline">
            Ingresa
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
