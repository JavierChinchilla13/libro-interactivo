import { PageHeader } from '../../shared/ui/layout';
import { ServiceStatus } from './ServiceStatus';

export function HealthPage() {
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
