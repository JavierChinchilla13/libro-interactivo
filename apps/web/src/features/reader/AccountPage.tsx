import { changePasswordRequestSchema, nameSchema } from '@libro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage, fieldErrors } from '../../shared/api/messages';
import { Button, TextField } from '../../shared/ui/controls';
import { Alert, Card } from '../../shared/ui/layout';
import { accountApi } from '../auth/accountApi';
import { PasswordField } from '../auth/PasswordField';
import { SESSION_KEY, useLogout, useSession } from '../auth/session';

function NameForm() {
  const session = useSession();
  const client = useQueryClient();
  const [name, setName] = useState(session.data?.name ?? '');
  const [error, setError] = useState<string>();
  const save = useMutation({
    mutationFn: accountApi.updateName,
    onSuccess: (data) => client.setQueryData(SESSION_KEY, data.user),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    save.mutate(parsed.data);
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="font-semibold">Datos</h2>
        <TextField
          label="Nombre"
          value={name}
          error={error}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Correo electrónico"
          value={session.data?.email ?? ''}
          readOnly
          hint="No se puede cambiar."
        />
        {save.isSuccess ? <Alert tone="success" title="Nombre actualizado" /> : null}
        {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
        <Button type="submit" className="self-start" loading={save.isPending}>
          Guardar nombre
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const session = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: accountApi.changePassword,
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword: current,
      newPassword: next,
      newPasswordConfirm: confirm,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    change.mutate(parsed.data);
  }

  const wrongCurrent =
    change.error instanceof ApiClientError && /actual/i.test(change.error.message);

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="font-semibold">Cambiar contraseña</h2>
        <PasswordField
          label="Contraseña actual"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          error={
            errors['currentPassword'] ??
            (wrongCurrent ? 'La contraseña actual no es correcta.' : undefined)
          }
        />
        <PasswordField
          label="Nueva contraseña"
          value={next}
          onChange={setNext}
          error={errors['newPassword']}
          context={{ name: session.data?.name ?? '', email: session.data?.email ?? '' }}
          showMeter
        />
        <PasswordField
          label="Repite la nueva contraseña"
          value={confirm}
          onChange={setConfirm}
          error={errors['newPasswordConfirm']}
        />
        {change.isSuccess ? (
          <Alert tone="success" title="Tu contraseña se actualizó">
            Te enviamos un correo de confirmación y cerramos tus otras sesiones.
          </Alert>
        ) : null}
        {change.isError && !wrongCurrent ? <Alert>{errorMessage(change.error)}</Alert> : null}
        <Button type="submit" className="self-start" loading={change.isPending}>
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}

/** Mi cuenta: nombre editable, correo fijo, cambiar contraseña y salir. */
export function AccountPage() {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="font-display text-2xl font-bold">Mi cuenta</h1>
      <NameForm />
      <PasswordForm />
      <Button
        variant="secondary"
        className="self-start"
        loading={logout.isPending}
        onClick={() =>
          logout.mutate(undefined, {
            onSettled: () => void navigate('/ingresar', { replace: true }),
          })
        }
      >
        Cerrar sesión
      </Button>
    </div>
  );
}
