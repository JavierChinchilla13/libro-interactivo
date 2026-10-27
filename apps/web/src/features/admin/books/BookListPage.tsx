import type { BookStatus } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { booksApi, keys } from '../api';
import { DataList, type Column } from '../components/DataList';
import { ListPage, useRowSearch } from '../components/ListPage';
import { StatusBadge, type AdminStatus } from '../components/StatusBadge';

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  draft: 'Borrador',
  upcoming: 'Próximamente',
  published: 'Publicado',
  archived: 'Archivado',
};

const STATUS: Record<BookStatus, AdminStatus> = {
  draft: 'draft',
  upcoming: 'soon',
  published: 'published',
  archived: 'archived',
};

const useBooks = () => useQuery({ queryKey: keys.books, queryFn: booksApi.list });
type Book = NonNullable<ReturnType<typeof useBooks>['data']>['books'][number];

const columns: Column<Book>[] = [
  {
    id: 'order',
    header: '#',
    role: 'table',
    className: 'admin-cell-num',
    cell: (book) => book.order,
  },
  {
    id: 'title',
    header: 'Libro',
    role: 'title',
    cell: (book) => <span className="admin-cell-title">{book.title}</span>,
  },
  {
    id: 'status',
    header: 'Estado',
    role: 'status',
    cell: (book) => <StatusBadge status={STATUS[book.status]} />,
  },
  { id: 'date', header: 'Fecha', role: 'meta', cell: (book) => book.releaseDate ?? '—' },
];

/** Libros de la saga: el orden de la lista es el orden de la saga. */
export function BookListPage() {
  const books = useBooks();
  const search = useRowSearch(books.data?.books, (book) => book.title);

  return (
    <ListPage
      title="Libros"
      subtitle="Cada libro es un contenedor: sus quizzes, wiki y capítulos extra se crean dentro de él."
      primaryAction={
        <Link to="/admin/libros/nuevo" className="btn btn-primary">
          + Nuevo libro
        </Link>
      }
      toolbar={search.field}
      state={books}
      count={search.visible?.length}
      filtersActive={search.active}
      onClearFilters={search.clear}
      empty={{
        icon: 'book',
        title: 'Todavía no hay libros',
        text: 'Crea el primero; desde ahí agregas sus quizzes, su wiki y sus capítulos extra.',
        action: (
          <Link to="/admin/libros/nuevo" className="btn btn-primary">
            Crear el primer libro
          </Link>
        ),
      }}
    >
      <DataList
        label="Libros"
        rows={search.visible ?? []}
        rowKey={(book) => book.id}
        columns={columns}
        action={{ to: (book) => `/admin/libros/${book.id}`, name: (book) => book.title }}
      />
    </ListPage>
  );
}
