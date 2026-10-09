import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert, EmptyState, Loading, TabPanel, Tabs } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { useSelectedBook } from '../reader/useBook';
import { wikiApi, wikiKeys } from './api';
import { LockedNotice } from './LockedNotice';
import { SECTION_SLUGS, sectionFromSlug } from './sections';
import { CharactersView, GlossaryView, PlacesView, PowersView } from './SectionViews';

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
  if (!book) return <EmptyState title="Todavía no hay una wiki disponible." />;
  if (sections.isError) return <Alert>{errorMessage(sections.error)}</Alert>;

  const list = sections.data?.sections ?? [];
  const active = list.find((s) => s.kind === sectionFromSlug(slug)) ?? list[0];

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h1 className="font-display text-3xl font-bold">Wiki del universo</h1>
        <p className="text-muted">{book.title}</p>
      </div>
      {list.length === 0 || !active ? (
        <EmptyState title="Este libro todavía no tiene wiki." />
      ) : (
        <>
          <Tabs
            label="Secciones de la wiki"
            active={active.kind}
            tabs={list.map((s) => ({
              id: s.kind,
              label: s.locked ? `🔒 ${s.title}` : s.title,
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
