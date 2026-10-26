import { Navigate } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert, Loading } from '../../shared/ui/layout';
import { useSelectedBookId } from './bookSelection';
import { useLibrary } from './useLibrary';

/**
 * Las direcciones antiguas `/panel/resultados` y `/panel/extras` ya no son páginas: llevan a la del libro activo
 * (el último que la lectora abrió, o el primero abierto), que es donde ahora viven. Sin libros abiertos, a la entrada.
 */
function ScopedRedirect({ section }: { section: 'resultados' | 'extras' }) {
  const library = useLibrary();
  const chosen = useSelectedBookId();
  if (library.isPending) return <Loading />;
  if (library.isError) return <Alert>{errorMessage(library.error)}</Alert>;
  const open = library.data.books.filter((entry) => entry.access === 'open');
  const entry = open.find((candidate) => candidate.book.id === chosen) ?? open[0];
  return <Navigate replace to={entry ? `/panel/libros/${entry.book.slug}/${section}` : '/panel'} />;
}

export function ResultsRedirect() {
  return <ScopedRedirect section="resultados" />;
}

export function ExtrasRedirect() {
  return <ScopedRedirect section="extras" />;
}
