import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert, EmptyState, Loading, PageHeader, TabPanel, Tabs } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { setSelectedBookId, useWikiBook } from '../reader/useBook';
import { wikiApi, wikiKeys } from './api';
import { WikiBookContext } from './bookContext';
import { LockedNotice } from './LockedNotice';
import { SECTION_SLUGS, sectionFromSlug } from './sections';
import { CharactersView, GlossaryView, PlacesView, PowersView } from './SectionViews';
import { LockIcon } from '../../shared/ui/icons';
import { usePageMeta } from '../../shared/seo/usePageMeta';

const homeLink = (
  <Link to="/" className="btn btn-secondary">
    Volver al inicio
  </Link>
);

/**
 * Wiki del universo: personajes, poderes, lugares y glosario en una sola página con pestañas.
 * La pestaña activa vive en la dirección (`/wiki/lugares`). Lo bloqueado se ve «bloqueado» con el mensaje de la
 * autora y sin contenido: el servidor decide en cada petición según la sesión y el progreso.
 */
export function WikiPage() {
  // Alto mínimo: mientras carga y al llegar el contenido el pie no se mueve (CLS).
  return (
    <div className="min-h-[85dvh]">
      <WikiContent />
    </div>
  );
}

function WikiContent() {
  const { section: slug } = useParams();
  const navigate = useNavigate();
  const viewer = useSession().data?.id ?? 'visitante';
  // El libro puede ir en la dirección (`/wiki?libro=<slug>`) para compartir el enlace; es lo menos invasivo: las rutas
  // de las pestañas (`/wiki/lugares`) no cambian y sin el parámetro todo funciona como antes.
  const [params, setParams] = useSearchParams();
  const slugParam = params.get('libro');
  const { books, book, draft, isPending, error } = useWikiBook(slugParam);
  const bookId = book?.id ?? '';
  const sections = useQuery({
    queryKey: wikiKeys.sections(viewer, bookId),
    queryFn: () => wikiApi.sections(bookId),
    enabled: bookId !== '',
  });

  const available = sections.data?.sections ?? [];
  const current = available.find((s) => s.kind === sectionFromSlug(slug)) ?? available[0];
  usePageMeta({
    title: current && !current.locked ? `Wiki: ${current.title}` : 'Wiki del universo',
    description:
      'La wiki del universo de Memorias: personajes, campos de poder, lugares y glosario. Parte del contenido se desbloquea al avanzar en los quizzes.',
  });

  if (isPending || (book && sections.isPending)) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (!book) {
    // También sin wiki la página tiene su titular: una sola H1 por página.
    return (
      <div className="flex flex-col">
        <PageHeader title="Wiki del universo" />
        <EmptyState title="Todavía no hay una wiki disponible." action={homeLink} />
      </div>
    );
  }
  if (sections.isError) return <Alert>{errorMessage(sections.error)}</Alert>;

  const list = sections.data?.sections ?? [];
  const active = list.find((s) => s.kind === sectionFromSlug(slug)) ?? list[0];

  return (
    <div className="flex flex-col">
      <PageHeader title="Wiki del universo" subtitle={book.title} />
      {draft ? (
        // Solo el equipo ve la wiki de un libro en borrador (los «próximamente» ya son públicos y no llevan aviso).
        <div className="mb-4">
          <Alert tone="warning">
            <p>Este libro está en borrador: los lectores no ven esta wiki.</p>
          </Alert>
        </div>
      ) : null}
      {books.length > 1 ? (
        // Solo con más de un libro. Botones (con teclado) que cambian lo mostrado y se recuerdan como en el panel.
        <div role="group" aria-label="Libro de la wiki" className="mb-4 flex flex-wrap gap-2">
          {books.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chip"
              aria-pressed={option.id === book.id}
              onClick={() => {
                setSelectedBookId(option.id);
                setParams({ libro: option.slug });
              }}
            >
              {option.title}
            </button>
          ))}
        </div>
      ) : null}
      {list.length === 0 || !active ? (
        <EmptyState title="Todavía no hay entradas publicadas en la wiki." action={homeLink} />
      ) : (
        <>
          <Tabs
            label="Secciones de la wiki"
            active={active.kind}
            tabs={list.map((s) => ({
              id: s.kind,
              label: s.locked ? (
                <>
                  {s.title}
                  <LockIcon className="size-4" />
                  <span className="sr-only"> (bloqueado)</span>
                </>
              ) : (
                s.title
              ),
            }))}
            onChange={(kind) =>
              void navigate(
                `/wiki/${SECTION_SLUGS[kind]}${slugParam ? `?libro=${encodeURIComponent(slugParam)}` : ''}`,
              )
            }
          />
          <WikiBookContext.Provider value={book.slug}>
            <TabPanel id={active.kind} active={active.kind}>
              {active.locked ? (
                <LockedNotice title={active.title} message={active.lockedMessage} />
              ) : active.kind === 'character' ? (
                <CharactersView bookId={book.id} section={active} />
              ) : active.kind === 'power_field' ? (
                <PowersView bookId={book.id} section={active} />
              ) : active.kind === 'place' ? (
                <PlacesView bookId={book.id} section={active} />
              ) : (
                <GlossaryView bookId={book.id} section={active} />
              )}
            </TabPanel>
          </WikiBookContext.Provider>
        </>
      )}
    </div>
  );
}
