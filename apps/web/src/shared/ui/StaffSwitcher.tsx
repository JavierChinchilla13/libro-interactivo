import { Link, useLocation } from 'react-router';
import { isStaff, useSession } from '../../features/auth/session';

type Zone = 'site' | 'panel' | 'admin';

const ZONES: { zone: Zone; to: string; label: string }[] = [
  { zone: 'site', to: '/', label: 'Ver sitio' },
  { zone: 'panel', to: '/panel', label: 'Mi panel' },
  { zone: 'admin', to: '/admin', label: 'Admin' },
];

/** En qué zona está la persona según la ruta: el panel del lector, la administración o el sitio público. */
export function zoneOf(pathname: string): Zone {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/panel' || pathname.startsWith('/panel/')) return 'panel';
  return 'site';
}

/**
 * Selector de zona para administradoras y editoras: tres botones («Ver sitio», «Mi panel», «Admin») en el mismo
 * lugar de la cabecera del sitio, del panel y de la administración, con la zona actual marcada. Solo se pinta para
 * esas cuentas (las lectoras y quien no ha ingresado no lo ven); es comodidad: la seguridad sigue en el servidor.
 */
export function StaffSwitcher({ className = '' }: { className?: string }) {
  const session = useSession();
  const { pathname } = useLocation();
  if (!isStaff(session.data)) return null;
  const current = zoneOf(pathname);
  return (
    <nav aria-label="Cambiar de zona" className={`staff-switcher ${className}`}>
      {ZONES.map((item) => (
        <Link
          key={item.zone}
          to={item.to}
          aria-current={item.zone === current ? 'page' : undefined}
          data-active={item.zone === current || undefined}
          className="staff-switcher-link"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
