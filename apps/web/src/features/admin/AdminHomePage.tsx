import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Card, PageHeader } from '../../shared/ui/layout';
import { booksApi, keys } from './api';

const shortcut =
  'glass card-link flex min-h-12 items-center rounded-token-lg px-4 text-sm font-medium';

/** Inicio del panel: resumen y atajos. */
export function AdminHomePage() {
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const total = books.data?.books.length;
  const published = books.data?.books.filter((book) => book.status === 'published').length;

  return (
    <>
      <PageHeader title="Inicio del panel" subtitle="Aquí gestionas el contenido de la saga." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Libros publicados</p>
          <p className="font-display text-3xl font-bold" data-testid="stat-published-books">
            {published ?? '—'}
          </p>
          <p className="text-xs text-muted">de {total ?? '—'} en total</p>
        </Card>
      </div>
      <h2 className="mb-3 font-semibold">Atajos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/admin/libros/nuevo" className={shortcut}>
          Nuevo libro
        </Link>
        <Link to="/admin/quizzes/nuevo" className={shortcut}>
          Nuevo quiz
        </Link>
        <Link to="/admin/wiki/nueva?tipo=character" className={shortcut}>
          Subir personaje
        </Link>
      </div>
    </>
  );
}
