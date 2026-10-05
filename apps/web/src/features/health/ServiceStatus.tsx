import { useHealth } from './useHealth';

/** Indicador del estado del servidor y de la base de datos (consulta `/api/health`). */
export function ServiceStatus() {
  const { data, isPending, isError } = useHealth();

  const server = isPending ? 'comprobando…' : isError ? 'sin conexión' : 'en línea';
  const db = isPending ? 'comprobando…' : data?.db === 'up' ? 'conectada' : 'sin conexión';
  const ok = !isPending && !isError && data?.db === 'up';

  return (
    <section
      aria-label="Estado del servicio"
      className="rounded-token-lg border border-border bg-surface p-4"
    >
      <h2 className="text-base font-semibold">Estado del servicio</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Servidor</dt>
        <dd data-testid="server-status">{server}</dd>
        <dt className="text-muted">Base de datos</dt>
        <dd data-testid="db-status">{db}</dd>
      </dl>
      <p
        className={`mt-3 text-sm font-medium ${ok ? 'text-success' : isPending ? 'text-muted' : 'text-danger'}`}
      >
        {ok
          ? 'Todo funciona correctamente.'
          : isPending
            ? 'Verificando…'
            : 'Hay un problema con el servicio.'}
      </p>
    </section>
  );
}
