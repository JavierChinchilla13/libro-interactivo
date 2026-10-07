import type { PublicWikiLeaf, PublicWikiSection } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { TextField } from '../../shared/ui/controls';
import { Alert, EmptyState, Loading } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { wikiApi, wikiKeys } from './api';
import { LockedCard, LockedNotice } from './LockedNotice';
import type { SectionKind } from './sections';

type Open<T extends { locked: boolean }> = Extract<T, { locked: false }>;

/** Sin acentos y en minúsculas, igual que la búsqueda del servidor. */
const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function useEntries(bookId: string, kind: SectionKind) {
  const viewer = useSession().data?.id ?? 'visitante';
  return useQuery({
    queryKey: wikiKeys.entries(viewer, bookId, kind),
    queryFn: () => wikiApi.entries(bookId, kind),
    retry: false,
  });
}

/** Cada vista llama a esto: mientras carga, si el servidor dice «bloqueado» o si hay un error. */
function useGate(query: ReturnType<typeof useEntries>, section: PublicWikiSection): ReactNode {
  if (query.isPending) return <Loading />;
  if (query.error instanceof ApiClientError && query.error.code === 'NOT_UNLOCKED') {
    return <LockedNotice title={section.title} message={section.lockedMessage} />;
  }
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  return null;
}

function EntryCard({ entry }: { entry: Open<PublicWikiLeaf> }) {
  return (
    <li>
      <Link
        to={`/wiki/entrada/${entry.id}`}
        className="flex h-full flex-col gap-2 rounded-token-lg border border-border bg-surface p-3 hover:bg-surface-alt"
      >
        {entry.image ? (
          <img
            src={thumbUrl(entry.image.url, 320)}
            alt={entry.image.alt}
            width={entry.image.width}
            height={entry.image.height}
            loading="lazy"
            className="aspect-square w-full rounded-token object-cover"
          />
        ) : null}
        <span className="font-semibold">{entry.name}</span>
        {entry.group ? <span className="text-xs text-muted">{entry.group}</span> : null}
        {entry.summary ? <span className="text-sm text-muted">{entry.summary}</span> : null}
      </Link>
    </li>
  );
}

const gridClass = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';

function Cards({ entries, empty }: { entries: readonly PublicWikiLeaf[]; empty: string }) {
  if (entries.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className={gridClass}>
      {entries.map((entry) =>
        entry.locked ? <LockedCard key={entry.id} /> : <EntryCard key={entry.id} entry={entry} />,
      )}
    </ul>
  );
}

export function CharactersView({
  bookId,
  section,
}: {
  bookId: string;
  section: PublicWikiSection;
}) {
  const query = useEntries(bookId, 'character');
  const gate = useGate(query, section);
  if (gate) return gate;
  return (
    <div className="flex flex-col gap-4">
      {section.introHtml ? <SafeHtml html={section.introHtml} /> : null}
      <Cards entries={query.data?.entries ?? []} empty="Todavía no hay personajes publicados." />
    </div>
  );
}

/** Campos de poder; al abrir uno se ven sus poderes conocidos. */
export function PowersView({ bookId, section }: { bookId: string; section: PublicWikiSection }) {
  const query = useEntries(bookId, 'power_field');
  const gate = useGate(query, section);
  if (gate) return gate;
  const fields = query.data?.entries ?? [];
  if (fields.length === 0) return <EmptyState title="Todavía no hay poderes publicados." />;
  return (
    <div className="flex flex-col gap-4">
      {section.introHtml ? <SafeHtml html={section.introHtml} /> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) =>
          field.locked ? (
            <LockedCard key={field.id} />
          ) : (
            <li key={field.id} className="rounded-token-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                {field.image ? (
                  <img
                    src={thumbUrl(field.image.url, 160)}
                    alt={field.image.alt}
                    width={64}
                    height={64}
                    loading="lazy"
                    className="size-16 rounded-token object-cover"
                  />
                ) : null}
                <div>
                  <Link to={`/wiki/entrada/${field.id}`} className="font-semibold underline">
                    {field.name}
                  </Link>
                  {field.summary ? <p className="text-sm text-muted">{field.summary}</p> : null}
                </div>
              </div>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                  Poderes conocidos ({field.powers?.length ?? 0})
                </summary>
                {field.powers && field.powers.length > 0 ? (
                  <ul className="mt-2 grid gap-2">
                    {field.powers.map((power) =>
                      power.locked ? (
                        <li key={power.id} className="text-sm text-muted">
                          🔒 Bloqueado
                        </li>
                      ) : (
                        <li key={power.id}>
                          <Link to={`/wiki/entrada/${power.id}`} className="underline">
                            {power.name}
                          </Link>
                          {power.summary ? (
                            <span className="text-sm text-muted"> — {power.summary}</span>
                          ) : null}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">Aún no se conoce ninguno.</p>
                )}
              </details>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/** Lugares: mensaje de la autora, mapa, filtro por tipo y la lista. */
export function PlacesView({ bookId, section }: { bookId: string; section: PublicWikiSection }) {
  const query = useEntries(bookId, 'place');
  const [group, setGroup] = useState<string | null>(null);
  const gate = useGate(query, section);
  if (gate) return gate;
  const entries = query.data?.entries ?? [];
  const groups = [
    ...new Set(entries.flatMap((entry) => (!entry.locked && entry.group ? [entry.group] : []))),
  ];
  // Filtrar por tipo oculta las tarjetas bloqueadas: no tienen tipo que mostrar.
  const shown = group ? entries.filter((entry) => !entry.locked && entry.group === group) : entries;
  return (
    <div className="flex flex-col gap-4">
      {section.introHtml ? <SafeHtml html={section.introHtml} /> : null}
      {section.mapImage ? (
        <img
          src={thumbUrl(section.mapImage.url, 1200)}
          alt={section.mapImage.alt}
          width={section.mapImage.width}
          height={section.mapImage.height}
          className="h-auto max-w-full rounded-token-lg border border-border"
        />
      ) : null}
      {groups.length > 0 ? (
        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          {[null, ...groups].map((option) => (
            <button
              key={option ?? 'todos'}
              type="button"
              aria-pressed={group === option}
              onClick={() => setGroup(option)}
              className={`min-h-11 rounded-full border px-4 text-sm ${
                group === option ? 'border-primary bg-surface-alt font-semibold' : 'border-border'
              }`}
            >
              {option ?? 'Todos'}
            </button>
          ))}
        </div>
      ) : null}
      <Cards entries={shown} empty="Todavía no hay lugares publicados." />
    </div>
  );
}

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

/** Glosario: búsqueda mientras se escribe y filtro por letra (las letras sin términos se atenúan). */
export function GlossaryView({ bookId, section }: { bookId: string; section: PublicWikiSection }) {
  const query = useEntries(bookId, 'term');
  const [text, setText] = useState('');
  const [letter, setLetter] = useState<string | null>(null);
  const entries = useMemo(() => query.data?.entries ?? [], [query.data]);
  const available = useMemo(
    () => new Set(entries.flatMap((entry) => (entry.locked ? [] : [entry.letter]))),
    [entries],
  );
  const gate = useGate(query, section);
  if (gate) return gate;

  const needle = normalize(text);
  const filtering = needle !== '' || letter !== null;
  // Con búsqueda o letra solo se muestra lo abierto (igual que hace el servidor).
  const shown = entries.filter((entry) => {
    if (entry.locked) return !filtering;
    return (
      (needle === '' || normalize(entry.name).includes(needle)) &&
      (letter === null || entry.letter === letter)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {section.introHtml ? <SafeHtml html={section.introHtml} /> : null}
      <TextField
        label="Buscar un término"
        type="search"
        placeholder="Escribe para buscar…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div role="group" aria-label="Filtrar por letra" className="flex flex-wrap gap-1">
        {LETTERS.map((option) => (
          <button
            key={option}
            type="button"
            disabled={!available.has(option)}
            aria-pressed={letter === option}
            onClick={() => setLetter(letter === option ? null : option)}
            className={`size-11 rounded-token border text-sm disabled:opacity-40 ${
              letter === option ? 'border-primary bg-surface-alt font-semibold' : 'border-border'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {shown.length === 0 && filtering ? (
        <EmptyState title="No encontramos términos con esa búsqueda." />
      ) : (
        <Cards entries={shown} empty="Todavía no hay términos publicados." />
      )}
    </div>
  );
}
