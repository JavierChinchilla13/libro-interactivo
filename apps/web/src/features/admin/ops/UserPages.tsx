import {
  createStaffUserRequestSchema,
  type AdminUser,
  type CreateStaffUserRequest,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatDateTime, formatShortDate } from '../../../shared/lib/dates';
import { Button, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { useSession } from '../../auth/session';
import { keys, usersApi } from '../api';
import { errorMessage, fieldErrors } from '../errors';

const ROLE_LABEL: Record<AdminUser['role'], string> = {
  USER: 'Lectora',
  EDITOR: 'Editora',
  ADMIN: 'Administradora',
};

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  return <Badge tone={role === 'USER' ? 'neutral' : 'success'}>{ROLE_LABEL[role]}</Badge>;
}

function StatusBadge({ status }: { status: AdminUser['status'] }) {
  return (
    <Badge tone={status === 'active' ? 'success' : 'warning'}>
      {status === 'active' ? 'Activa' : 'Desactivada'}
    </Badge>
  );
}

function CreateStaffForm({ onDone }: { onDone: () => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState<CreateStaffUserRequest>({ name: '', email: '', role: 'EDITOR' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: usersApi.create,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.users });
      onDone();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createStaffUserRequestSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="font-semibold">Nueva cuenta de administración</h2>
        <p className="text-sm text-muted">
          La persona recibe un correo con un enlace para elegir su propia contraseña. Tú nunca la
          conoces.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Nombre"
            value={form.name}
            error={errors['name']}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <TextField
            label="Correo electrónico"
            type="email"
            value={form.email}
            error={errors['email']}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <SelectField
            label="Rol"
            value={form.role}
            options={[
              { value: 'EDITOR', label: 'Editora (contenido)' },
              { value: 'ADMIN', label: 'Administradora (todo)' },
            ]}
            onChange={(event) =>
              setForm({ ...form, role: event.target.value as CreateStaffUserRequest['role'] })
            }
          />
        </div>
        {create.isError ? <Alert>{errorMessage(create.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending}>
            Crear y enviar invitación
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Usuarios (solo administradoras): búsqueda, filtros y alta de editoras. */
export function UserListPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const users = useQuery({
    queryKey: [...keys.users, { search, role, status, page }],
    queryFn: () =>
      usersApi.list({
        ...(search ? { q: search } : {}),
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        page: String(page),
      }),
    placeholderData: (previous) => previous,
  });
  const data = users.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Lectoras, editoras y administradoras. Los intentos de prueba no cuentan."
        actions={<Button onClick={() => setCreating(true)}>Nueva cuenta de administración</Button>}
      />
      <div className="flex flex-col gap-5">
        {creating ? <CreateStaffForm onDone={() => setCreating(false)} /> : null}
        <form
          role="search"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(q.trim());
          }}
        >
          <TextField
            label="Buscar por nombre o correo"
            wrapperClassName="min-w-64 flex-1"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <SelectField
            label="Rol"
            value={role}
            placeholder="Todos"
            options={[
              { value: 'USER', label: 'Lectoras' },
              { value: 'EDITOR', label: 'Editoras' },
              { value: 'ADMIN', label: 'Administradoras' },
            ]}
            onChange={(event) => {
              setPage(1);
              setRole(event.target.value);
            }}
          />
          <SelectField
            label="Estado"
            value={status}
            placeholder="Todos"
            options={[
              { value: 'active', label: 'Activas' },
              { value: 'disabled', label: 'Desactivadas' },
            ]}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>

        {users.isPending ? <Loading /> : null}
        {users.isError ? <Alert>{errorMessage(users.error)}</Alert> : null}
        {data && data.users.length === 0 ? (
          <EmptyState title="No hay personas con ese filtro" />
        ) : null}
        {data && data.users.length > 0 ? (
          <div className="glass overflow-x-auto rounded-token-lg">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Usuarios</caption>
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="p-3">
                    Persona
                  </th>
                  <th scope="col" className="p-3">
                    Rol
                  </th>
                  <th scope="col" className="p-3">
                    Estado
                  </th>
                  <th scope="col" className="p-3">
                    Quizzes
                  </th>
                  <th scope="col" className="p-3">
                    Registro
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-t border-line">
                    <td className="p-3">
                      <Link to={`/admin/usuarios/${user.id}`} className="font-medium underline">
                        {user.name}
                      </Link>
                      <span className="block text-xs text-muted">{user.email}</span>
                    </td>
                    <td className="p-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="p-3">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="p-3">
                      {user.completedQuizzes} de {data.totalQuizzes}
                    </td>
                    <td className="p-3">{formatShortDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data && pages > 1 ? (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <p className="text-sm text-muted">
              Página {page} de {pages} · {data.total} personas
            </p>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </nav>
        ) : null}
      </div>
    </>
  );
}

const QUIZ_STATUS: Record<
  'completed' | 'unlocked' | 'none',
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  completed: { label: 'Completado', tone: 'success' },
  unlocked: { label: 'Desbloqueado', tone: 'warning' },
  none: { label: 'Sin empezar', tone: 'neutral' },
};

/** Detalle de una persona: progreso por libro y quiz, y las acciones de cuenta (rol, estado, eliminar). */
export function UserDetailPage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useSession();
  const detail = useQuery({
    queryKey: keys.user(userId),
    queryFn: () => usersApi.get(userId),
    staleTime: 0,
  });
  const update = useMutation({
    mutationFn: (body: Parameters<typeof usersApi.update>[1]) => usersApi.update(userId, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.users });
    },
  });
  const remove = useMutation({
    mutationFn: () => usersApi.remove(userId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.users });
      void navigate('/admin/usuarios', { replace: true });
    },
  });

  if (detail.isError) return <Alert>{errorMessage(detail.error)}</Alert>;
  if (!detail.data) return <Loading />;
  const { user, books } = detail.data;
  const isSelf = session.data?.id === user.id;
  const error = update.error ?? remove.error;

  return (
    <>
      <PageHeader
        title={user.name}
        subtitle={user.email}
        actions={
          <Link to="/admin/usuarios" className="btn btn-secondary">
            Volver a usuarios
          </Link>
        }
      />
      <div className="flex max-w-3xl flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Cuenta</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <RoleBadge role={user.role} />
            <StatusBadge status={user.status} />
            <span className="text-muted">Registro: {formatDateTime(user.createdAt)}</span>
            {user.lastLoginAt ? (
              <span className="text-muted">
                · Último ingreso: {formatDateTime(user.lastLoginAt)}
              </span>
            ) : null}
          </p>
          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          {isSelf ? (
            <p className="text-sm text-muted">
              Es tu cuenta: no puedes cambiar tu propio rol ni desactivarla.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <SelectField
                label="Rol"
                value={user.role}
                options={[
                  { value: 'USER', label: 'Lectora' },
                  { value: 'EDITOR', label: 'Editora' },
                  { value: 'ADMIN', label: 'Administradora' },
                ]}
                onChange={(event) =>
                  update.mutate({ role: event.target.value as AdminUser['role'] })
                }
              />
              <Button
                variant="secondary"
                loading={update.isPending && update.variables?.status !== undefined}
                onClick={() => {
                  const next = user.status === 'active' ? 'disabled' : 'active';
                  if (
                    next === 'active' ||
                    window.confirm(
                      'La persona no podrá ingresar y se cerrarán sus sesiones abiertas. ¿Desactivar la cuenta?',
                    )
                  )
                    update.mutate({ status: next });
                }}
              >
                {user.status === 'active' ? 'Desactivar cuenta' : 'Reactivar cuenta'}
              </Button>
              {user.role === 'USER' ? (
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Se borran su cuenta y su progreso para siempre. Sus resultados quedan solo como estadística anónima. ¿Eliminar?',
                      )
                    )
                      remove.mutate();
                  }}
                >
                  Eliminar cuenta
                </Button>
              ) : (
                <p className="text-sm text-muted">
                  Las cuentas de administración no se eliminan: se desactivan.
                </p>
              )}
            </div>
          )}
        </Card>

        {books.length === 0 ? <EmptyState title="Todavía no hay libros publicados" /> : null}
        {books.map((book) => (
          <Card key={book.bookId} className="flex flex-col gap-3">
            <h2 className="font-semibold">
              {book.title}
              {book.bookCompletedAt ? (
                <span className="ml-2 align-middle">
                  <Badge tone="success">Libro completado</Badge>
                </span>
              ) : null}
            </h2>
            {book.quizzes.length === 0 ? (
              <p className="text-sm text-muted">Este libro no tiene quizzes publicados.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {book.quizzes.map((quiz) => (
                  <li
                    key={quiz.quizId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                  >
                    <span className="font-medium">
                      Quiz {quiz.order} · {quiz.title}
                    </span>
                    <Badge tone={QUIZ_STATUS[quiz.status].tone}>
                      {QUIZ_STATUS[quiz.status].label}
                    </Badge>
                    <span className="text-sm text-muted">
                      {quiz.resultTitle ? `Resultado: ${quiz.resultTitle} · ` : ''}
                      {quiz.completedAt ? `${formatShortDate(quiz.completedAt)} · ` : ''}
                      {quiz.attempts} {quiz.attempts === 1 ? 'intento' : 'intentos'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
