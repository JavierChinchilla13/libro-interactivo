import type { Role } from '@libro/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../features/auth/session';
import { Alert, Loading } from '../shared/ui/layout';

/**
 * Guards de ruta. **Solo mejoran la experiencia**: la seguridad real es siempre del API
 * (ocultar una pantalla no protege nada).
 */

/** Exige sesión; si no hay, manda a `/ingresar` y recuerda a dónde volver. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <Loading label="Comprobando tu sesión…" />;
  if (session.isError) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert title="No pudimos comprobar tu sesión">
          Revisa tu conexión e inténtalo de nuevo.
        </Alert>
      </div>
    );
  }
  if (!session.data) {
    return (
      <Navigate to="/ingresar" replace state={{ from: location.pathname + location.search }} />
    );
  }
  return <Outlet />;
}

/** Exige uno de los roles indicados (después de `RequireAuth`). */
export function RequireRole({ roles }: { roles: readonly Role[] }) {
  const session = useSession();
  if (!session.data || !roles.includes(session.data.role)) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert title="No tienes permiso para ver esta página">
          Si crees que es un error, avisa a la administradora.
        </Alert>
      </div>
    );
  }
  return <Outlet />;
}
