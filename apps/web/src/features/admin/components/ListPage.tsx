import { useState, type ReactNode } from 'react';
import { AdminIcon, type AdminIconName } from '../../../shared/ui/adminIcons';
import { TextField } from '../../../shared/ui/controls';
import { Alert, EmptyState, PageHeader } from '../../../shared/ui/layout';
import { errorMessage } from '../errors';
import { SkeletonRows } from './Skeleton';

export interface ListState {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export interface ListEmpty {
  title: string;
  text?: ReactNode;
  /** La única salida del vacío: casi siempre «crear el primero». */
  action?: ReactNode;
  icon?: AdminIconName;
}

/**
 * Esqueleto común de las listas de la administración: título, una frase, un solo botón principal, filtros, y los
 * estados de carga (esqueletos), error (con «Reintentar») y vacío. El vacío distingue «todavía no hay nada» de
 * «ningún resultado con estos filtros». `children` es el contenido cuando sí hay filas (una `DataList`).
 */
export function ListPage({
  title,
  subtitle,
  primaryAction,
  help,
  tabs,
  toolbar,
  state,
  count,
  filtersActive = false,
  onClearFilters,
  empty,
  noResults = 'Ningún resultado con estos filtros',
  skeletonRows = 5,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  /** «¿Qué es esto?» plegado bajo el título. */
  help?: ReactNode;
  /** Pestañas que van entre el título y los filtros (la wiki). */
  tabs?: ReactNode;
  toolbar?: ReactNode;
  state: ListState;
  /** Cuántas filas hay con los filtros actuales; `undefined` mientras no llegan. */
  count: number | undefined;
  filtersActive?: boolean;
  onClearFilters?: () => void;
  empty: ListEmpty;
  noResults?: string;
  skeletonRows?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  let body: ReactNode;
  // Si ya hay filas (un refetch en segundo plano falló), la lista se queda: el error solo manda cuando no hay nada.
  if (state.isError && count === undefined) {
    body = (
      <Alert title="No pudimos cargar la lista">
        <p className="mt-1">{errorMessage(state.error)}</p>
        <button
          type="button"
          className="btn btn-secondary mt-3"
          onClick={() => void state.refetch()}
        >
          Reintentar
        </button>
      </Alert>
    );
  } else if (state.isPending || count === undefined) {
    body = <SkeletonRows rows={skeletonRows} />;
  } else if (count === 0) {
    body = filtersActive ? (
      <EmptyState
        icon={<AdminIcon name="empty" className="size-7" />}
        title={noResults}
        action={
          onClearFilters ? (
            <button type="button" className="btn btn-secondary" onClick={onClearFilters}>
              Limpiar filtros
            </button>
          ) : undefined
        }
      >
        Prueba con otras palabras o quita algún filtro.
      </EmptyState>
    ) : (
      <EmptyState
        icon={<AdminIcon name={empty.icon ?? 'empty'} className="size-7" />}
        title={empty.title}
        action={empty.action ? <div className="admin-empty-action">{empty.action}</div> : undefined}
      >
        {empty.text}
      </EmptyState>
    );
  } else {
    body = children;
  }

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={primaryAction} />
      {help ? <div className="mb-4">{help}</div> : null}
      {tabs}
      {toolbar ? <div className="admin-toolbar">{toolbar}</div> : null}
      {body}
      {footer}
    </>
  );
}

/** Un filtro de texto en el cliente: aparece solo cuando hay más de `from` filas (con pocas, buscar estorba). */
export function useRowSearch<T>(
  rows: readonly T[] | undefined,
  text: (row: T) => string,
  from = 8,
) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('es');
  const visible = rows
    ? needle
      ? rows.filter((row) => text(row).toLocaleLowerCase('es').includes(needle))
      : rows
    : undefined;
  const available = (rows?.length ?? 0) > from || query !== '';
  return {
    query,
    clear: () => setQuery(''),
    active: needle !== '',
    visible,
    field: available ? (
      <TextField
        label="Buscar por título"
        type="search"
        wrapperClassName="min-w-56 flex-1 sm:max-w-xs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    ) : null,
  };
}
