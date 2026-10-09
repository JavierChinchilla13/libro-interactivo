import { Link } from 'react-router';
import { Card } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { DEFAULT_LOCK_TEXT } from './sections';

const linkButton = 'btn';

/**
 * Lo que se ve en lugar de un contenido bloqueado: el mensaje de la autora y a dónde ir. Nunca lleva datos de lo
 * bloqueado; el servidor ya respondió sin ellos.
 */
export function LockedNotice({ title, message }: { title: string; message?: string | undefined }) {
  const session = useSession();
  return (
    <Card className="flex max-w-xl flex-col items-start gap-3">
      <p className="text-sm font-medium text-muted">🔒 Bloqueado</p>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="text-muted">{message ?? DEFAULT_LOCK_TEXT}</p>
      {session.data ? (
        <Link to="/panel" className={`${linkButton} btn-primary`}>
          Ir a mi panel
        </Link>
      ) : (
        <Link to="/ingresar" className={`${linkButton} btn-primary`}>
          Ingresar
        </Link>
      )}
    </Card>
  );
}

/** Tarjeta de una entrada bloqueada: sin nombre ni imagen (el servidor no los envía). */
export function LockedCard() {
  return (
    <li className="rounded-token-lg border border-dashed border-border bg-surface-alt p-4 text-center">
      <p aria-hidden="true" className="text-2xl">
        🔒
      </p>
      <p className="mt-1 text-sm font-medium">Bloqueado</p>
      <p className="text-xs text-muted">{DEFAULT_LOCK_TEXT}</p>
    </li>
  );
}
