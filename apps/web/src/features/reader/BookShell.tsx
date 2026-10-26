import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { errorMessage } from '../../shared/api/messages';
import { navTab } from '../../shared/ui/nav';
import { Alert, Loading } from '../../shared/ui/layout';
import { Plate } from '../../shared/ui/Plate';
import { type LibraryEntry } from './LibraryBookCard';
import { experiencesText } from './progressText';
import { BOOK_SECTIONS, bookSectionOf, type BookSection } from './bookSections';
import { useLibrary } from './useLibrary';

/** Migas «Tus libros › {libro} [› sección]»: la última no es enlace y marca la página actual. */
function BookCrumbs({
  title,
  slug,
  section,
}: {
  title: string;
  slug: string;
  section: BookSection;
}) {
  const label = BOOK_SECTIONS.find((item) => item.id === section)?.label;
  const crumb = 'min-w-0 truncate';
  return (
    <nav aria-label="Migas" className="text-sm text-muted">
      <ol className="flex min-w-0 items-center gap-2">
        <li className="shrink-0">
          <Link to="/panel" className="underline underline-offset-2 hover:text-text">
            Tus libros
          </Link>
        </li>
        <li aria-hidden="true" className="shrink-0">
          ›
        </li>
        {section === 'resumen' ? (
          <li className={`${crumb} text-text`} aria-current="page" title={title}>
            {title}
          </li>
        ) : (
          <>
            <li className="flex min-w-0 shrink">
              <Link
                to={`/panel/libros/${slug}`}
                className="block min-w-0 truncate underline underline-offset-2 hover:text-text"
                title={title}
              >
                {title}
              </Link>
            </li>
            <li aria-hidden="true" className="shrink-0">
              ›
            </li>
            <li className="shrink-0 text-text" aria-current="page">
              {label}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

/** Cabecera compacta del libro (portada pequeña, título y avance) con el cambio de libro si hay más de uno abierto. */
function CompactHeader({
  entry,
  others,
  section,
}: {
  entry: LibraryEntry;
  others: readonly LibraryEntry[];
  section: BookSection;
}) {
  const navigate = useNavigate();
  const { book, progress } = entry;
  const suffix = BOOK_SECTIONS.find((item) => item.id === section)?.path ?? '';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Plate
        cover={book.cover}
        title={book.title}
        className="w-12 shrink-0 sm:w-14"
        landscapeClassName="w-16 shrink-0 sm:w-20"
        sizes="80px"
        landscapeSizes="80px"
      />
      <div className="min-w-0 flex-1">
        <p
          className="line-clamp-2 text-lg font-semibold leading-snug [overflow-wrap:anywhere]"
          title={book.title}
        >
          {book.title}
        </p>
        {progress ? (
          <p className="text-sm text-muted tabular-nums">
            {experiencesText(progress.done, progress.total)}
          </p>
        ) : null}
      </div>
      {others.length > 1 ? (
        <label className="flex min-w-0 basis-full flex-col gap-1 text-xs text-muted sm:max-w-[16rem] sm:basis-auto sm:shrink-0">
          Cambiar de libro
          <select
            value={book.slug}
            onChange={(event) => void navigate(`/panel/libros/${event.target.value}${suffix}`)}
            className="min-h-11 min-w-0 truncate rounded-xl border border-border bg-bg/60 px-3 text-sm text-text focus:border-primary focus:shadow-focus focus:outline-none"
          >
            {others.map((item) => (
              <option key={item.book.id} value={item.book.slug}>
                {item.book.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

/**
 * Marco de un libro dentro del panel (`/panel/libros/:slug`): migas, subnavegador propio «Resumen · Resultados ·
 * Extras» y, en Resultados y Extras, una cabecera compacta del libro. Una sola implementación para todos los libros:
 * todo lo de dentro parte del libro de la dirección. Un libro sin abrir (o «próximamente») solo tiene su resumen.
 */
export function BookShell() {
  const { slug = '' } = useParams();
  const { pathname } = useLocation();
  const library = useLibrary();
  const section = bookSectionOf(pathname);

  if (library.isPending) return <Loading />;
  if (library.error) return <Alert>{errorMessage(library.error)}</Alert>;
  const entry = library.data.books.find((candidate) => candidate.book.slug === slug);
  if (!entry) return <NotFoundPage />;
  const isOpen = entry.access === 'open';
  if (!isOpen && section !== 'resumen') return <Navigate replace to={`/panel/libros/${slug}`} />;
  const open = library.data.books.filter((candidate) => candidate.access === 'open');
  const base = `/panel/libros/${slug}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <BookCrumbs title={entry.book.title} slug={slug} section={section} />
        {section === 'resumen' ? null : (
          <CompactHeader entry={entry} others={open} section={section} />
        )}
        {isOpen ? (
          <nav
            aria-label={`Secciones de ${entry.book.title}`}
            className="flex gap-1 border-b border-line"
          >
            {BOOK_SECTIONS.map((item) => (
              <NavLink
                key={item.id}
                to={`${base}${item.path}`}
                end={item.path === ''}
                className={navTab}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
      <Outlet />
    </div>
  );
}
