import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { SelectField } from '../../../shared/ui/controls';
import { booksApi, extrasApi, keys } from '../api';
import { DataList, type Column } from '../components/DataList';
import { ListPage, useRowSearch, type ListState } from '../components/ListPage';
import { StatusBadge } from '../components/StatusBadge';
import { KIND_LABEL } from './extraForm';

const useExtras = (bookId: string) =>
  useQuery({
    queryKey: keys.extras(bookId),
    queryFn: () => extrasApi.list(bookId),
    enabled: bookId !== '',
  });
type Extra = NonNullable<ReturnType<typeof useExtras>['data']>['extras'][number];

const columns: Column<Extra>[] = [
  {
    id: 'order',
    header: '#',
    role: 'table',
    className: 'admin-cell-num',
    cell: (extra) => extra.order,
  },
  {
    id: 'title',
    header: 'Título',
    role: 'title',
    cell: (extra) => <span className="admin-cell-title">{extra.title}</span>,
  },
  { id: 'kind', header: 'Tipo', role: 'meta', cell: (extra) => KIND_LABEL[extra.kind] },
  {
    id: 'status',
    header: 'Estado',
    role: 'status',
    cell: (extra) => <StatusBadge status={extra.status} />,
  },
];

const READY: ListState = {
  isPending: false,
  isError: false,
  error: null,
  refetch: () => undefined,
};

/** Capítulos extra: se abren al completar todo el libro, sin QR. */
export function ExtraListPage() {
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const [chosen, setChosen] = useState('');
  const bookId = chosen || books.data?.books[0]?.id || '';
  const extras = useExtras(bookId);
  const search = useRowSearch(extras.data?.extras, (extra) => extra.title);
  const noBooks = books.data !== undefined && books.data.books.length === 0;
  const state = books.isPending || books.isError ? books : noBooks ? READY : extras;
  const newExtra = `/admin/extras/nuevo${bookId ? `?libro=${bookId}` : ''}`;

  return (
    <ListPage
      title="Capítulos extra"
      subtitle="Se abren cuando el lector completa todos los quizzes del libro. No llevan QR."
      primaryAction={
        <Link to={newExtra} className="btn btn-primary">
          + Nuevo extra
        </Link>
      }
      toolbar={
        books.data && !noBooks ? (
          <>
            <SelectField
              label="Libro"
              value={bookId}
              options={books.data.books.map((book) => ({ value: book.id, label: book.title }))}
              onChange={(event) => setChosen(event.target.value)}
            />
            {search.field}
          </>
        ) : null
      }
      state={state}
      count={noBooks ? 0 : search.visible?.length}
      filtersActive={search.active}
      onClearFilters={search.clear}
      empty={
        noBooks
          ? {
              icon: 'book',
              title: 'Primero crea un libro',
              text: 'Los extras viven dentro de un libro.',
              action: (
                <Link to="/admin/libros/nuevo" className="btn btn-primary">
                  Crear libro
                </Link>
              ),
            }
          : {
              icon: 'extra',
              title: 'Este libro todavía no tiene extras',
              text: 'Son textos y recursos que se abren al terminar el libro.',
              action: (
                <Link to={newExtra} className="btn btn-primary">
                  Crear el primer extra
                </Link>
              ),
            }
      }
    >
      <DataList
        label="Capítulos extra"
        rows={search.visible ?? []}
        rowKey={(extra) => extra.id}
        columns={columns}
        action={{ to: (extra) => `/admin/extras/${extra.id}`, name: (extra) => extra.title }}
      />
    </ListPage>
  );
}
