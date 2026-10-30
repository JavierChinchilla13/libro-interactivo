import { Link } from 'react-router';
import { usePageMeta } from '../shared/seo/usePageMeta';
import { EmptyState } from '../shared/ui/layout';

/** Dirección que no existe: un punto apagado, lo que pasó y una salida. */
export function NotFoundPage() {
  usePageMeta({ title: 'Página no encontrada', noindex: true });
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
