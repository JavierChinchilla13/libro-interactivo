import { Link, Navigate } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert, Loading, PageHeader } from '../../shared/ui/layout';
import { Plate } from '../../shared/ui/Plate';
import { type LibraryEntry } from './LibraryBookCard';
import { experiencesText } from './progressText';
import { useLibrary } from './useLibrary';

type Section = 'resultados' | 'extras';

const COPY: Record<Section, { title: string; subtitle: string; action: string }> = {
  resultados: {
    title: 'Resultados',
    subtitle: 'Elige un libro para ver lo que descubriste en él.',
    action: 'Ver resultados',
  },
  extras: {
    title: 'Extras',
    subtitle: 'Elige un libro para ver sus capítulos extra.',
    action: 'Ver extras',
  },
};

function BookRow({ entry, section }: { entry: LibraryEntry; section: Section }) {
  const { book, progress } = entry;
  return (
    <li>
      <Link
        to={`/panel/libros/${book.slug}/${section}`}
        className="flex items-center gap-4 rounded-token-xl border border-line bg-surface p-4 transition-colors hover:border-primary active:bg-surface-alt"
      >
        <Plate
          cover={book.cover}
          title={book.title}
          className="w-12 shrink-0 sm:w-14"
          landscapeClassName="w-16 shrink-0 sm:w-20"
          sizes="80px"
          landscapeSizes="80px"
        />
        <span className="min-w-0 flex-1">
          <span
            className="line-clamp-2 block font-semibold leading-snug [overflow-wrap:anywhere]"
            title={book.title}
          >
            {book.title}
          </span>
          {progress ? (
            <span className="block text-sm text-muted tabular-nums">
              {experiencesText(progress.done, progress.total)}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-sm underline underline-offset-2">
          {COPY[section].action}
          <span className="sr-only"> de {book.title}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Punto de acceso de «Resultados» o «Extras» desde el panel general: lista los libros abiertos para elegir uno. Con un
 * solo libro abierto va directo a él (un clic menos); sin libros abiertos vuelve a la entrada del panel.
 */
function BookAccess({ section }: { section: Section }) {
  const library = useLibrary();
  if (library.isPending) return <Loading />;
  if (library.isError) return <Alert>{errorMessage(library.error)}</Alert>;
  const open = library.data.books
    .filter((entry) => entry.access === 'open')
    .sort((a, b) => a.book.order - b.book.order);
  const only = open[0];
  if (open.length === 0) return <Navigate replace to="/panel" />;
  if (open.length === 1 && only) {
    return <Navigate replace to={`/panel/libros/${only.book.slug}/${section}`} />;
  }
  const closed = library.data.books.length - open.length;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={COPY[section].title} subtitle={COPY[section].subtitle} />
      <ul aria-label="Tus libros" className="flex flex-col gap-3">
        {open.map((entry) => (
          <BookRow key={entry.book.id} entry={entry} section={section} />
        ))}
      </ul>
      {closed > 0 ? (
        <p className="text-sm text-muted">
          Los libros que todavía no abriste no tienen{' '}
          {section === 'resultados' ? 'resultados' : 'extras'} aún.
        </p>
      ) : null}
    </div>
  );
}

export function ResultsAccessPage() {
  return <BookAccess section="resultados" />;
}

export function ExtrasAccessPage() {
  return <BookAccess section="extras" />;
}
