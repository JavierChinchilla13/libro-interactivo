import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useSession } from '../../features/auth/session';
import { Button } from '../../shared/ui/controls';

const link = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-token px-3 text-sm font-medium ${
    isActive ? 'bg-surface-alt text-text' : 'text-muted hover:bg-surface-alt hover:text-text'
  }`;

/** Secciones que ya existen y las que llegan en fases siguientes (se muestran apagadas, sin enlace). */
const CONTENT = [
  { to: '/admin/libros', label: 'Libros' },
  { to: '/admin/quizzes', label: 'Quizzes' },
  { to: '/admin/wiki', label: 'Wiki' },
] as const;
const COMING_CONTENT = ['Actualizaciones', 'Fan arts', 'Reseñas', 'Capítulos extra'] as const;
const COMING_ADMIN = [
  'Códigos QR',
  'Usuarios',
  'Mensajes de contacto',
  'Ajustes del sitio',
] as const;

function Soon({ label }: { label: string }) {
  return (
    <span
      aria-disabled="true"
      className="flex min-h-11 items-center justify-between px-3 text-sm text-muted opacity-60"
    >
      {label}
      <span className="text-xs">pronto</span>
    </span>
  );
}

/** Marco del panel de administración: menú lateral en escritorio, desplegable en móvil. */
export function AdminLayout() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const user = session.data;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-border bg-surface lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link to="/admin" className="font-display text-lg font-bold">
            Panel
          </Link>
          <button
            type="button"
            className="min-h-11 rounded-token border border-border px-3 text-sm lg:hidden"
            aria-expanded={open}
            aria-controls="admin-menu"
            onClick={() => setOpen((value) => !value)}
          >
            Menú
          </button>
        </div>
        <nav
          id="admin-menu"
          aria-label="Administración"
          className={`${open ? 'flex' : 'hidden'} flex-col gap-1 px-3 pb-4 lg:flex`}
          onClick={() => setOpen(false)}
        >
          <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Contenido
          </p>
          {CONTENT.map((item) => (
            <NavLink key={item.to} to={item.to} className={link}>
              {item.label}
            </NavLink>
          ))}
          {COMING_CONTENT.map((label) => (
            <Soon key={label} label={label} />
          ))}
          {isAdmin ? (
            <>
              <p className="px-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                Solo administradores
              </p>
              {COMING_ADMIN.map((label) => (
                <Soon key={label} label={label} />
              ))}
            </>
          ) : null}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
          <p className="text-sm text-muted">
            {user?.name} · {isAdmin ? 'Administradora' : 'Editora'}
          </p>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm underline">
              Ver sitio
            </Link>
            <Button
              variant="secondary"
              loading={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSettled: () => void navigate('/ingresar', { replace: true }),
                })
              }
            >
              Salir
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
