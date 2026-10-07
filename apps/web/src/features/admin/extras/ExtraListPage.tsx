import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { SelectField } from '../../../shared/ui/controls';
import { Alert, Badge, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, extrasApi, keys } from '../api';
import { errorMessage } from '../errors';
import { KIND_LABEL } from './extraForm';

const STATUS = {
  draft: { label: 'Borrador', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'success' },
  archived: { label: 'Archivado', tone: 'warning' },
} as const;

/** Capítulos extra: se abren al completar todo el libro, sin QR. */
export function ExtraListPage() {
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const [chosen, setChosen] = useState('');
  const bookId = chosen || books.data?.books[0]?.id || '';
  const extras = useQuery({
    queryKey: keys.extras(bookId),
    queryFn: () => extrasApi.list(bookId),
    enabled: bookId !== '',
  });

  return (
    <>
      <PageHeader
        title="Capítulos extra"
        subtitle="Se abren cuando el lector completa todos los quizzes del libro. No llevan QR."
        actions={
          <Link
            to={`/admin/extras/nuevo${bookId ? `?libro=${bookId}` : ''}`}
            className="inline-flex min-h-11 items-center rounded-token bg-primary px-4 text-sm font-semibold text-primary-contrast"
          >
            + Nuevo extra
          </Link>
        }
      />
      {books.isPending ? <Loading /> : null}
      {books.isError ? <Alert>{errorMessage(books.error)}</Alert> : null}
      {books.data && books.data.books.length === 0 ? (
        <EmptyState title="Primero crea un libro">
          Los extras viven dentro de un libro.{' '}
          <Link to="/admin/libros/nuevo" className="underline">
            Crear libro
          </Link>
        </EmptyState>
      ) : null}
      {books.data && books.data.books.length > 0 ? (
        <>
          <SelectField
            label="Libro"
            wrapperClassName="mb-4 max-w-sm"
            value={bookId}
            options={books.data.books.map((book) => ({ value: book.id, label: book.title }))}
            onChange={(event) => setChosen(event.target.value)}
          />
          {extras.isPending ? <Loading /> : null}
          {extras.isError ? <Alert>{errorMessage(extras.error)}</Alert> : null}
          {extras.data && extras.data.extras.length === 0 ? (
            <EmptyState title="Este libro todavía no tiene extras" />
          ) : null}
          {extras.data && extras.data.extras.length > 0 ? (
            <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      #
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Título
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Tipo
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Estado
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {extras.data.extras.map((extra) => (
                    <tr key={extra.id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted">{extra.order}</td>
                      <td className="px-4 py-3 font-medium">{extra.title}</td>
                      <td className="px-4 py-3">{KIND_LABEL[extra.kind]}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS[extra.status].tone}>{STATUS[extra.status].label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/admin/extras/${extra.id}`} className="underline">
                          Editar<span className="sr-only"> {extra.title}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
