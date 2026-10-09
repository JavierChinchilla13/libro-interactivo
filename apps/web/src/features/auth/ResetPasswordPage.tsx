import { resetPasswordRequestSchema } from '@libro/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage, fieldErrors } from '../../shared/api/messages';
import { Button } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { accountApi } from './accountApi';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';

/**
 * Página a la que llega el enlace del correo (`/restablecer/:token`). Si la contraseña es débil el enlace NO se gasta;
 * un enlace inválido, usado o caducado siempre dice lo mismo.
 */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reset = useMutation({ mutationFn: accountApi.resetPassword });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = resetPasswordRequestSchema.safeParse({
      token,
      newPassword: password,
      newPasswordConfirm: confirm,
    });
    if (!parsed.success) {
      const found = fieldErrors(parsed.error.issues);
      setErrors({
        password: found['newPassword'] ?? '',
        confirm: found['newPasswordConfirm'] ?? '',
      });
      return;
    }
    setErrors({});
    reset.mutate(parsed.data);
  }

  if (reset.isSuccess) {
    return (
      <AuthShell title="Contraseña actualizada">
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="¡Listo!">
            Tu contraseña se actualizó. Ya puedes iniciar sesión.
          </Alert>
          <Link to="/ingresar" className="btn btn-primary">
            Ir a ingresar
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (reset.error instanceof ApiClientError && reset.error.code === 'TOKEN_INVALID') {
    return (
      <AuthShell title="Enlace no válido">
        <div className="flex flex-col gap-4">
          <Alert>El enlace no es válido o ya caducó. Solicita uno nuevo.</Alert>
          <Link to="/olvide-mi-contrasena" className="underline">
            Pedir otro enlace
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Elige una nueva contraseña">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <PasswordField
          label="Nueva contraseña"
          value={password}
          onChange={setPassword}
          error={errors['password'] || undefined}
          showMeter
        />
        <PasswordField
          label="Repite la nueva contraseña"
          value={confirm}
          onChange={setConfirm}
          error={errors['confirm'] || undefined}
        />
        {reset.isError ? <Alert>{errorMessage(reset.error)}</Alert> : null}
        <Button type="submit" loading={reset.isPending}>
          Guardar contraseña
        </Button>
      </form>
    </AuthShell>
  );
}
