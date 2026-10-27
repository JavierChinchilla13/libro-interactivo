import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMediaQuery } from './useMediaQuery';

/**
 * Qué papel juega una columna en la tarjeta del celular: `title` es el encabezado de la tarjeta, `status` va como
 * etiqueta bajo el título, `meta` sale como «Nombre: valor» y `table` solo aparece en la tabla.
 */
export type ColumnRole = 'title' | 'status' | 'meta' | 'table';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  role?: ColumnRole;
  /** Clases extra de la celda de la tabla (por ejemplo, un ancho fijo para un número de orden). */
  className?: string;
}

export interface RowAction<T> {
  to: (row: T) => string;
  /** Nombre de la fila para lectores de pantalla («Editar Quiz 3»); no se ve. */
  name: (row: T) => string;
  label?: string;
}

const PAGE_SIZE = 50;
const BREAKPOINT = '(min-width: 768px)';

/**
 * Lista de la administración: tabla desde 768 px y tarjetas en el celular, con una sola definición de columnas.
 * Muestra de a 50 filas («Mostrar más») para que 500 elementos no pesen. El botón «Editar» nunca parte su texto.
 */
export function DataList<T>({
  label,
  rows,
  rowKey,
  columns,
  action,
  pageSize = PAGE_SIZE,
}: {
  /** Nombre de la lista para lectores de pantalla («Quizzes»). */
  label: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: readonly Column<T>[];
  action?: RowAction<T>;
  pageSize?: number;
}) {
  const wide = useMediaQuery(BREAKPOINT, true);
  const [shown, setShown] = useState(pageSize);
  const visible = rows.slice(0, shown);
  const more = rows.length - visible.length;
  const actionLabel = action?.label ?? 'Editar';

  const footer =
    more > 0 ? (
      <div className="admin-list-more">
        <p>
          Mostrando {visible.length} de {rows.length}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShown((count) => count + pageSize)}
        >
          Mostrar {Math.min(pageSize, more)} más
        </button>
      </div>
    ) : null;

  if (!wide) {
    const title = columns.find((column) => column.role === 'title') ?? columns[0];
    const statuses = columns.filter((column) => column.role === 'status');
    const metas = columns.filter((column) => column.role === 'meta');
    return (
      <>
        <ul className="admin-card-list" aria-label={label}>
          {visible.map((row) => (
            <li key={rowKey(row)} className="admin-row-card">
              <div className="min-w-0">{title ? title.cell(row) : null}</div>
              {statuses.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {statuses.map((column) => (
                    <span key={column.id}>{column.cell(row)}</span>
                  ))}
                </div>
              ) : null}
              {metas.length > 0 ? (
                <dl className="admin-row-meta">
                  {metas.map((column) => (
                    <div key={column.id}>
                      <dt>{column.header}</dt>
                      <dd>{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {action ? (
                <Link to={action.to(row)} className="btn btn-secondary admin-row-action">
                  {actionLabel} <span className="sr-only">{action.name(row)}</span>
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        {footer}
      </>
    );
  }

  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.id} scope="col">
                  {column.header}
                </th>
              ))}
              {action ? (
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={`${column.role === 'meta' || column.role === 'status' ? 'whitespace-nowrap' : ''} ${column.className ?? ''}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {action ? (
                  <td className="admin-actions-cell">
                    <Link to={action.to(row)} className="admin-edit-link">
                      {actionLabel} <span className="sr-only">{action.name(row)}</span>
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </>
  );
}
