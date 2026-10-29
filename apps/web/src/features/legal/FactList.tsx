import type { ReactNode } from 'react';

export interface Fact {
  name: string;
  /** El nombre es un identificador técnico (cookie, clave del navegador): no se traduce. */
  technical?: boolean;
  rows: ReadonlyArray<readonly [label: string, value: ReactNode]>;
}

/**
 * Una ficha corta por elemento (proveedor, cookie…), legible en cualquier ancho. Reemplaza a las tablas: a 375 px una
 * tabla de tres columnas se corta y no se puede recorrer con el teclado.
 */
export function FactList({ items }: { items: ReadonlyArray<Fact> }) {
  return (
    <dl className="flex flex-col divide-y divide-line border-y border-line font-sans text-base leading-normal">
      {items.map((item) => (
        <div
          key={item.name}
          className="grid gap-x-8 gap-y-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)]"
        >
          <dt
            translate={item.technical ? 'no' : undefined}
            className={`min-w-0 break-words font-semibold text-text ${item.technical ? 'text-sm' : ''}`}
          >
            {item.name}
          </dt>
          <dd className="flex min-w-0 flex-col gap-1 text-muted">
            {item.rows.map(([label, value]) => (
              <span key={label}>
                <span className="text-text">{label}: </span>
                {value}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
