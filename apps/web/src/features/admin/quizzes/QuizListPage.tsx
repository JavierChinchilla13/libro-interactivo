import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { SelectField } from '../../../shared/ui/controls';
import { booksApi, keys, quizzesApi } from '../api';
import { DataList, type Column } from '../components/DataList';
import { ListPage, useRowSearch, type ListState } from '../components/ListPage';
import { StatusBadge } from '../components/StatusBadge';

const useQuizzes = (bookId: string, status: string) =>
  useQuery({
    queryKey: [...keys.quizzes(bookId), status],
    queryFn: () => quizzesApi.list(bookId, status || undefined),
    enabled: bookId !== '',
  });
type Quiz = NonNullable<ReturnType<typeof useQuizzes>['data']>['quizzes'][number];

const columns: Column<Quiz>[] = [
  {
    id: 'order',
    header: '#',
    role: 'table',
    className: 'admin-cell-num',
    cell: (quiz) => quiz.order,
  },
  {
    id: 'title',
    header: 'Título',
    role: 'title',
    cell: (quiz) => <span className="admin-cell-title">{quiz.title}</span>,
  },
  {
    id: 'status',
    header: 'Estado',
    role: 'status',
    cell: (quiz) => (
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status={quiz.status} />
        {quiz.status === 'published' && quiz.hasUnpublishedChanges ? (
          <StatusBadge status="changes" />
        ) : null}
      </span>
    ),
  },
  {
    id: 'retake',
    header: 'Repetir',
    role: 'meta',
    cell: (quiz) => (quiz.allowRetake ? 'Sí' : 'No (una sola vez)'),
  },
  {
    id: 'version',
    header: 'Versión',
    role: 'meta',
    cell: (quiz) => (quiz.currentVersion > 0 ? `v${quiz.currentVersion}` : '—'),
  },
];

/** Estado «ya resuelto» para cuando no hay nada que pedir (sin libros no hay quizzes). */
const READY: ListState = {
  isPending: false,
  isError: false,
  error: null,
  refetch: () => undefined,
};

/** Listado de quizzes: por libro, con filtro de estado y la regla de repetir. */
export function QuizListPage() {
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const [chosen, setChosen] = useState<string>('');
  const [status, setStatus] = useState('');
  const bookId = chosen || books.data?.books[0]?.id || '';
  const quizzes = useQuizzes(bookId, status);
  const search = useRowSearch(quizzes.data?.quizzes, (quiz) => quiz.title);
  const noBooks = books.data !== undefined && books.data.books.length === 0;
  const state = books.isPending || books.isError ? books : noBooks ? READY : quizzes;
  const newQuiz = `/admin/quizzes/nuevo${bookId ? `?libro=${bookId}` : ''}`;

  return (
    <ListPage
      title="Quizzes"
      subtitle="Se juegan en orden: el quiz 2 se abre al completar el 1, y así."
      primaryAction={
        <Link to={newQuiz} className="btn btn-primary">
          + Nuevo quiz
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
            {search.field}
          </>
        ) : null
      }
      state={state}
      count={noBooks ? 0 : search.visible?.length}
      filtersActive={status !== '' || search.active}
      onClearFilters={() => {
        setStatus('');
        search.clear();
      }}
      empty={
        noBooks
          ? {
              icon: 'book',
              title: 'Primero crea un libro',
              text: 'Los quizzes viven dentro de un libro.',
              action: (
                <Link to="/admin/libros/nuevo" className="btn btn-primary">
                  Crear libro
                </Link>
              ),
            }
          : {
              icon: 'quiz',
              title: 'Este libro todavía no tiene quizzes',
              text: 'Un quiz son las preguntas y los resultados que descubre la lectora.',
              action: (
                <Link to={newQuiz} className="btn btn-primary">
                  Crear el primer quiz
                </Link>
              ),
            }
      }
    >
      <DataList
        label="Quizzes"
        rows={search.visible ?? []}
        rowKey={(quiz) => quiz.id}
        columns={columns}
        action={{ to: (quiz) => `/admin/quizzes/${quiz.id}`, name: (quiz) => quiz.title }}
      />
    </ListPage>
  );
}
