import { Link } from 'react-router';
import { EmptyState } from '../shared/ui/layout';

/** Dirección que no existe: un punto apagado, lo que pasó y una salida. */
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl">
      <EmptyState
        title="Página no encontrada"
        action={
          <Link to="/" className="btn btn-secondary">
            Volver al inicio
          </Link>
        }
      >
        La dirección que buscas no existe o cambió de lugar.
      </EmptyState>
    </div>
  );
}
