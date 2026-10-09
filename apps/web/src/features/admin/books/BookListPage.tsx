import type { BookStatus } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert, Badge, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, keys } from '../api';
import { errorMessage } from '../errors';

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  draft: 'Borrador',
  upcoming: 'Próximamente',
  published: 'Publicado',
  archived: 'Archivado',
};

const tone = (status: BookStatus) =>
  status === 'published' ? 'success' : status === 'upcoming' ? 'warning' : 'neutral';

/** Libros de la saga: el orden de la lista es el orden de la saga. */
export function BookListPage() {
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });

  return (
    <>
      <PageHeader
        title="Libros"
        subtitle="Cada libro es un contenedor: sus quizzes, wiki y capítulos extra se crean dentro de él."
        actions={
          <Link to="/admin/libros/nuevo" className="btn btn-primary">
            + Nuevo libro
          </Link>
        }
      />
      {books.isPending ? <Loading /> : null}
      {books.isError ? <Alert>{errorMessage(books.error)}</Alert> : null}
      {books.data && books.data.books.length === 0 ? (
        <EmptyState title="Todavía no hay libros">Crea el primero con «Nuevo libro».</EmptyState>
      ) : null}
      {books.data && books.data.books.length > 0 ? (
        <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  #
                </th>
                <th scope="col" className="px-4 py-3">
                  Libro
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {books.data.books.map((book) => (
                <tr key={book.id} className="border-t border-border">
                  <td className="px-4 py-3 text-muted">{book.order}</td>
                  <td className="px-4 py-3 font-medium">{book.title}</td>
                  <td className="px-4 py-3">
                    <Badge tone={tone(book.status)}>{BOOK_STATUS_LABEL[book.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{book.releaseDate ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/libros/${book.id}`} className="underline">
                      Editar<span className="sr-only"> {book.title}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
