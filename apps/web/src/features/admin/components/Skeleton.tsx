/** Bloque de carga con la forma de lo que viene (sin texto «Cargando…» suelto). Se anuncia una sola vez. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`admin-skeleton block ${className}`} />;
}

/** Filas de lista en carga: una barra ancha y otra corta, como un título con su dato. */
export function SkeletonRows({ rows = 5, label = 'Cargando' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-token-md border border-line bg-surface p-4"
        >
          <Skeleton className="size-10 shrink-0 rounded-token-sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="hidden h-7 w-24 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
