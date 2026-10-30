import { PageHeader } from '../../shared/ui/layout';
import { ServiceStatus } from './ServiceStatus';
import { usePageMeta } from '../../shared/seo/usePageMeta';

export function HealthPage() {
  usePageMeta({ title: 'Estado del sistema', noindex: true });
  return (
    <div>
      <PageHeader
        title="Estado del sistema"
        subtitle="Comprobación técnica de la conexión con el servidor."
      />
      <ServiceStatus />
    </div>
  );
}
