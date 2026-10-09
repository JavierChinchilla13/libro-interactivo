import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { SelectField } from '../../../shared/ui/controls';
import { Alert, Badge, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, keys, quizzesApi } from '../api';
import { errorMessage } from '../errors';

const STATUS = {
  draft: { label: 'Borrador', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'success' },
  archived: { label: 'Archivado', tone: 'warning' },
} as const;

/** Listado de quizzes: por libro, con filtro de estado y la regla de repetir. */
export function QuizListPage() {
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const [chosen, setChosen] = useState<string>('');
  const [status, setStatus] = useState('');
  const bookId = chosen || books.data?.books[0]?.id || '';

  const quizzes = useQuery({
    queryKey: [...keys.quizzes(bookId), status],
    queryFn: () => quizzesApi.list(bookId, status || undefined),
    enabled: bookId !== '',
  });

  return (
    <>
      <PageHeader
        title="Quizzes"
        subtitle="Se juegan en orden: el quiz 2 se abre al completar el 1, y así."
        actions={
          <Link
            to={`/admin/quizzes/nuevo${bookId ? `?libro=${bookId}` : ''}`}
            className="btn btn-primary"
          >
            + Nuevo quiz
          </Link>
        }
      />
      {books.isPending ? <Loading /> : null}
      {books.isError ? <Alert>{errorMessage(books.error)}</Alert> : null}
      {books.data && books.data.books.length === 0 ? (
        <EmptyState title="Primero crea un libro">
          Los quizzes viven dentro de un libro.{' '}
          <Link to="/admin/libros/nuevo" className="underline">
            Crear libro
          </Link>
        </EmptyState>
      ) : null}
      {books.data && books.data.books.length > 0 ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <SelectField
              label="Libro"
              value={bookId}
              options={books.data.books.map((book) => ({ value: book.id, label: book.title }))}
              onChange={(event) => setChosen(event.target.value)}
            />
            <SelectField
              label="Estado"
              value={status}
              placeholder="Todos"
              options={[
                { value: 'draft', label: 'Borrador' },
                { value: 'published', label: 'Publicado' },
                { value: 'archived', label: 'Archivado' },
              ]}
              onChange={(event) => setStatus(event.target.value)}
            />
          </div>
          {quizzes.isPending ? <Loading /> : null}
          {quizzes.isError ? <Alert>{errorMessage(quizzes.error)}</Alert> : null}
          {quizzes.data && quizzes.data.quizzes.length === 0 ? (
            <EmptyState title="Este libro todavía no tiene quizzes" />
          ) : null}
          {quizzes.data && quizzes.data.quizzes.length > 0 ? (
            <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      #
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Título
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Estado
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Repetir
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Versión
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quizzes.data.quizzes.map((quiz) => (
                    <tr key={quiz.id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted">{quiz.order}</td>
                      <td className="px-4 py-3 font-medium">{quiz.title}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS[quiz.status].tone}>{STATUS[quiz.status].label}</Badge>
                      </td>
                      <td className="px-4 py-3">{quiz.allowRetake ? 'Sí' : 'No (una sola vez)'}</td>
                      <td className="px-4 py-3 text-muted">
                        {quiz.currentVersion > 0 ? `v${quiz.currentVersion}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/admin/quizzes/${quiz.id}`} className="underline">
                          Editar<span className="sr-only"> {quiz.title}</span>
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
