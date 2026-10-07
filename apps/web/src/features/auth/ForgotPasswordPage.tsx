import { forgotPasswordRequestSchema } from '@libro/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage, fieldErrors } from '../../shared/api/messages';
import { Button, TextField } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { accountApi } from './accountApi';
import { AuthShell } from './AuthShell';

/** «Olvidé mi contraseña»: la respuesta es SIEMPRE la misma, exista o no la cuenta (no se revela quién está registrado). */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const send = useMutation({ mutationFn: accountApi.forgotPassword });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    send.mutate(parsed.data);
  }

  return (
    <AuthShell title="Recupera tu contraseña">
      {send.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Revisa tu correo">
            Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.
            Funciona una sola vez y caduca en 30 minutos.
          </Alert>
          <Link to="/ingresar" className="underline">
            Volver a ingresar
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.
          </p>
          <TextField
            label="Correo electrónico"
            type="email"
            required
            autoComplete="email"
            value={email}
            error={errors['email']}
            onChange={(event) => setEmail(event.target.value)}
          />
          {send.isError ? <Alert>{errorMessage(send.error)}</Alert> : null}
          <Button type="submit" loading={send.isPending}>
            Enviar enlace
          </Button>
          <Link to="/ingresar" className="text-sm underline">
            Volver a ingresar
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
