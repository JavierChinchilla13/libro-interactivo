import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useSession } from '../../features/auth/session';
import { Button } from '../../shared/ui/controls';
import { Brand } from '../../shared/ui/Brand';

const link = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-11 items-center rounded-xl px-3 text-sm font-medium transition ${
    isActive
      ? 'bg-primary/12 text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:shadow-glow'
      : 'text-muted hover:bg-surface-alt/70 hover:text-text'
  }`;

/** Secciones que ya existen y las que llegan en fases siguientes (se muestran apagadas, sin enlace). */
const CONTENT = [
  { to: '/admin/libros', label: 'Libros' },
  { to: '/admin/quizzes', label: 'Quizzes' },
  { to: '/admin/wiki', label: 'Wiki' },
  { to: '/admin/actualizaciones', label: 'Actualizaciones' },
  { to: '/admin/fan-arts', label: 'Fan arts' },
  { to: '/admin/resenas', label: 'Reseñas' },
  { to: '/admin/extras', label: 'Capítulos extra' },
  { to: '/admin/sitio', label: 'Portada y autora' },
  { to: '/admin/bienvenida', label: 'Mensaje de bienvenida' },
] as const;
const COMING_ADMIN = ['Usuarios', 'Mensajes de contacto', 'Ajustes del sitio'] as const;

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
      <aside className="border-b border-line bg-bg/70 backdrop-blur-xl lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Brand to="/admin" label="Panel" />
          <button
            type="button"
            className="btn btn-secondary !min-h-10 lg:hidden"
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
          {isAdmin ? (
            <>
              <p className="px-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                Solo administradores
              </p>
              <NavLink to="/admin/qr" className={link}>
                Códigos QR
              </NavLink>
              {COMING_ADMIN.map((label) => (
                <Soon key={label} label={label} />
              ))}
            </>
          ) : null}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg/75 px-4 py-2.5 backdrop-blur-xl">
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
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
