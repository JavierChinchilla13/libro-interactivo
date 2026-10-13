import { Link } from 'react-router';
import { Card } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { DEFAULT_LOCK_TEXT } from './sections';
import { LockIcon } from '../../shared/ui/icons';

const linkButton = 'btn';

/**
 * Lo que se ve en lugar de un contenido bloqueado: el mensaje de la autora y a dónde ir. Nunca lleva datos de lo
 * bloqueado; el servidor ya respondió sin ellos.
 */
export function LockedNotice({ title, message }: { title: string; message?: string | undefined }) {
  const session = useSession();
  return (
    <Card className="flex max-w-xl flex-col items-start gap-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
        <LockIcon className="size-4" />
        Bloqueado
      </p>
      <h2 className="text-xl font-semibold">{title}</h2>
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
    <li className="rounded-token-md bg-surface p-4 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full border-2 border-unlit text-muted">
        <LockIcon className="size-5" />
      </span>
      <p className="mt-1 text-sm font-medium">Bloqueado</p>
      <p className="text-xs text-muted">{DEFAULT_LOCK_TEXT}</p>
    </li>
  );
}
