import { ServiceStatus } from './ServiceStatus';

export function HealthPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Estado del sistema</h1>
      <p className="text-muted">Comprobación técnica de la conexión con el servidor.</p>
      <ServiceStatus />
    </div>
  );
}
