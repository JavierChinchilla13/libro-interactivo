import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert, EmptyState, Loading, PageHeader, TabPanel, Tabs } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { useSelectedBook } from '../reader/useBook';
import { wikiApi, wikiKeys } from './api';
import { LockedNotice } from './LockedNotice';
import { SECTION_SLUGS, sectionFromSlug } from './sections';
import { CharactersView, GlossaryView, PlacesView, PowersView } from './SectionViews';
import { LockIcon } from '../../shared/ui/icons';

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
  const { section: slug } = useParams();
  const navigate = useNavigate();
  const viewer = useSession().data?.id ?? 'visitante';
  const { book, isPending, error } = useSelectedBook();
  const bookId = book?.id ?? '';
  const sections = useQuery({
    queryKey: wikiKeys.sections(viewer, bookId),
    queryFn: () => wikiApi.sections(bookId),
    enabled: bookId !== '',
  });

  if (isPending || (book && sections.isPending)) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (!book) return <EmptyState title="Todavía no hay una wiki disponible." action={homeLink} />;
  if (sections.isError) return <Alert>{errorMessage(sections.error)}</Alert>;

  const list = sections.data?.sections ?? [];
  const active = list.find((s) => s.kind === sectionFromSlug(slug)) ?? list[0];

  return (
    <div className="flex flex-col">
      <PageHeader title="Wiki del universo" subtitle={book.title} />
      {list.length === 0 || !active ? (
        <EmptyState title="Este libro todavía no tiene wiki." action={homeLink} />
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
            onChange={(kind) => void navigate(`/wiki/${SECTION_SLUGS[kind]}`)}
          />
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
        </>
      )}
    </div>
  );
}
