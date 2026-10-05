import { ServiceStatus } from '../health/ServiceStatus';

/** Portada provisoria (tema neutro). La landing completa llega en la fase 9. */
export function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">Universo Memorias</p>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Libro Interactivo</h1>
        <p className="max-w-prose text-muted">
          [PLACEHOLDER] Aquí irá la presentación del universo y de sus libros. Esta pantalla es
          provisoria mientras se construye la plataforma.
        </p>
      </section>
      <ServiceStatus />
    </div>
  );
}
