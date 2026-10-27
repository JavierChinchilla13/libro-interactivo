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
import { Alert, Badge, Card, EmptyState, PageHeader } from '../../../shared/ui/layout';
import { useSession } from '../../auth/session';
import { keys, usersApi } from '../api';
import { useCrumbLeaf } from '../components/Breadcrumbs';
import { useConfirm } from '../components/ConfirmDialog';
import { FormSection } from '../components/FormSection';
import { SkeletonRows } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { DataList, type Column } from '../components/DataList';
import { ListPage } from '../components/ListPage';
import { StatusBadge } from '../components/StatusBadge';
import { errorMessage, fieldErrors } from '../errors';

const ROLE_LABEL: Record<AdminUser['role'], string> = {
  USER: 'Lectora',
  EDITOR: 'Editora',
  ADMIN: 'Administradora',
};

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  return <Badge tone={role === 'USER' ? 'neutral' : 'success'}>{ROLE_LABEL[role]}</Badge>;
}

function AccountStatus({ status }: { status: AdminUser['status'] }) {
  return <StatusBadge status={status === 'active' ? 'active' : 'inactive'} />;
}

function CreateStaffForm({ onDone }: { onDone: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<CreateStaffUserRequest>({ name: '', email: '', role: 'EDITOR' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: usersApi.create,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.users });
      toast.success('Invitación enviada');
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
    <form onSubmit={submit} noValidate>
      <FormSection
        title="Nueva cuenta del equipo"
        help="La persona recibe un correo con un enlace para elegir su propia contraseña. Tú nunca la conoces."
      >
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
      </FormSection>
    </form>
  );
}

/** Usuarios (solo administradoras): búsqueda, filtros y alta de cuentas del equipo. */
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

  const columns: Column<AdminUser>[] = [
    {
      id: 'person',
      header: 'Persona',
      role: 'title',
      cell: (user) => (
        <>
          <Link to={`/admin/usuarios/${user.id}`} className="admin-cell-title underline">
            {user.name}
          </Link>
          <span className="admin-cell-sub">{user.email}</span>
        </>
      ),
    },
    { id: 'role', header: 'Rol', role: 'status', cell: (user) => <RoleBadge role={user.role} /> },
    {
      id: 'status',
      header: 'Estado',
      role: 'status',
      cell: (user) => <AccountStatus status={user.status} />,
    },
    {
      id: 'quizzes',
      header: 'Quizzes',
      role: 'meta',
      cell: (user) => `${user.completedQuizzes} de ${data?.totalQuizzes ?? '—'}`,
    },
    {
      id: 'created',
      header: 'Registro',
      role: 'meta',
      cell: (user) => formatShortDate(user.createdAt),
    },
  ];

  return (
    <ListPage
      title="Usuarios"
      subtitle="Lectoras, editoras y administradoras. Los intentos de prueba no cuentan."
      primaryAction={<Button onClick={() => setCreating(true)}>Nueva cuenta del equipo</Button>}
      tabs={creating ? <CreateStaffForm onDone={() => setCreating(false)} /> : null}
      toolbar={
        <form
          role="search"
          className="contents"
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
      }
      state={users}
      count={data?.users.length}
      filtersActive={Boolean(search || role || status)}
      onClearFilters={() => {
        setQ('');
        setSearch('');
        setRole('');
        setStatus('');
        setPage(1);
      }}
      noResults="No hay personas con ese filtro"
      empty={{
        icon: 'users',
        title: 'Todavía no hay personas',
        text: 'Las lectoras aparecen aquí cuando se registran.',
      }}
      footer={
        data && pages > 1 ? (
          <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3">
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
        ) : null
      }
    >
      <DataList
        label="Usuarios"
        rows={data?.users ?? []}
        rowKey={(user) => user.id}
        columns={columns}
        pageSize={500}
      />
    </ListPage>
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
  const toast = useToast();
  const detail = useQuery({
    queryKey: keys.user(userId),
    queryFn: () => usersApi.get(userId),
    staleTime: 0,
  });
  const update = useMutation({
    mutationFn: (body: Parameters<typeof usersApi.update>[1]) => usersApi.update(userId, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.users });
      toast.success('Guardado');
    },
  });
  const confirm = useConfirm();
  const remove = useMutation({
    mutationFn: () => usersApi.remove(userId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.users });
      toast.success('Cuenta eliminada');
      void navigate('/admin/usuarios', { replace: true });
    },
  });

  useCrumbLeaf(detail.data?.user.name);
  if (detail.isError) return <Alert>{errorMessage(detail.error)}</Alert>;
  if (!detail.data) return <SkeletonRows rows={3} />;
  const { user, books } = detail.data;

  const isSelf = session.data?.id === user.id;
  const error = update.error ?? remove.error;

  return (
    <>
      <PageHeader title={user.name} subtitle={user.email} />
      <div className="flex max-w-3xl flex-col gap-5">
        <FormSection title="Cuenta" help="Rol, estado y acciones de esta persona.">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <RoleBadge role={user.role} />
            <AccountStatus status={user.status} />
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
                onClick={async () => {
                  const next = user.status === 'active' ? 'disabled' : 'active';
                  if (next === 'disabled') {
                    const ok = await confirm({
                      title: '¿Desactivar la cuenta?',
                      message:
                        'No podrá ingresar y se cerrarán sus sesiones abiertas. Puedes reactivarla cuando quieras.',
                      confirmLabel: 'Desactivar cuenta',
                      tone: 'danger',
                    });
                    if (!ok) return;
                  }
                  update.mutate({ status: next });
                }}
              >
                {user.status === 'active' ? 'Desactivar cuenta' : 'Reactivar cuenta'}
              </Button>
              {user.role === 'USER' ? (
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: '¿Eliminar la cuenta?',
                      message:
                        'Se borran su cuenta, su progreso y sus intentos en curso, para siempre. Los quizzes que ya terminó se conservan sin su nombre, solo para las estadísticas.',
                      confirmLabel: 'Eliminar cuenta',
                      tone: 'danger',
                    });
                    if (ok) remove.mutate();
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
        </FormSection>

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
