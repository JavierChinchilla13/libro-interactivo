import type { WikiEntryResponse, WikiKind } from '@libro/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Badge, EmptyState, Loading, PageHeader, Tabs } from '../../../shared/ui/layout';
import { booksApi, keys, wikiApi } from '../api';
import { errorMessage } from '../errors';
import { KIND_LABEL, LIST_TABS } from './wikiForm';

type TabId = (typeof LIST_TABS)[number]['id'];

const STATUS = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' } as const;
const LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  '#',
];

/** Lista de la wiki: una pestaña por tipo, búsqueda, filtro por letra y orden manual. */
export function WikiListPage() {
  const client = useQueryClient();
  const [tabId, setTabId] = useState<TabId>('character');
  const [bookId, setBookId] = useState('');
  const [q, setQ] = useState('');
  const [letter, setLetter] = useState('');
  const tab = LIST_TABS.find((item) => item.id === tabId) ?? LIST_TABS[0];
  const kinds: readonly WikiKind[] = tab.kinds;

  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const lists = useQueries({
    queries: kinds.map((kind) => ({
      queryKey: [...keys.wiki, 'list', kind, bookId, q, letter],
      queryFn: () =>
        wikiApi.list({
          kind,
          bookId: bookId || undefined,
          q: q || undefined,
          letter: kind === 'term' && letter ? letter : undefined,
        }),
    })),
  });

  const loading = lists.some((list) => list.isPending);
  const failed = lists.find((list) => list.isError);
  const entries: WikiEntryResponse[] = lists.flatMap((list) => list.data?.entries ?? []);
  // Los poderes se muestran justo debajo de su campo.
  const ordered =
    tabId === 'powers'
      ? entries
          .filter((entry) => entry.kind === 'power_field')
          .flatMap((field) => [
            field,
            ...entries.filter((entry) => entry.kind === 'power' && entry.parentId === field.id),
          ])
          .concat(
            entries.filter(
              (entry) => entry.kind === 'power' && !entries.some((f) => f.id === entry.parentId),
            ),
          )
      : entries;

  const nameOf = (id: string | undefined) => entries.find((entry) => entry.id === id)?.name ?? '—';

  // Ordenar a mano solo tiene sentido dentro de un mismo tipo y libro.
  const sameScope = (kind: WikiKind) => ordered.filter((entry) => entry.kind === kind);
  const reorder = useMutation({
    mutationFn: wikiApi.reorder,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.wiki });
    },
  });
  function move(entry: WikiEntryResponse, direction: -1 | 1) {
    const group = sameScope(entry.kind).filter((item) => item.parentId === entry.parentId);
    const index = group.findIndex((item) => item.id === entry.id);
    const to = index + direction;
    if (index < 0 || to < 0 || to >= group.length) return;
    const ids = group.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    if (moved) ids.splice(to, 0, moved);
    reorder.mutate({ kind: entry.kind, bookId: entry.bookId, ids });
  }
  const canReorder = bookId !== '' || ordered.every((entry) => entry.bookId === undefined);

  const newKind: WikiKind = tabId === 'powers' ? 'power_field' : tabId;

  return (
    <>
      <PageHeader
        title="Wiki del universo"
        subtitle="Personajes, campos y poderes, lugares y glosario en un solo lugar."
        actions={
          <>
            {tabId === 'powers' ? (
              <Link
                to="/admin/wiki/nueva?tipo=power"
                className="inline-flex min-h-11 items-center rounded-token border border-border px-4 text-sm font-semibold"
              >
                + Nuevo poder
              </Link>
            ) : null}
            <Link
              to={`/admin/wiki/nueva?tipo=${newKind}`}
              className="inline-flex min-h-11 items-center rounded-token bg-primary px-4 text-sm font-semibold text-primary-contrast"
            >
              + {tabId === 'powers' ? 'Nuevo campo' : 'Nueva entrada'}
            </Link>
          </>
        }
      />
      <Tabs
        label="Tipos de la wiki"
        active={tabId}
        onChange={(id) => {
          setTabId(id);
          setLetter('');
        }}
        tabs={LIST_TABS.map((item) => ({ id: item.id, label: item.label }))}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <TextField
          label="Buscar por nombre"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <SelectField
          label="Libro"
          value={bookId}
          placeholder="Todos"
          options={(books.data?.books ?? []).map((book) => ({ value: book.id, label: book.title }))}
          onChange={(event) => setBookId(event.target.value)}
        />
      </div>
      {tabId === 'term' ? (
        <nav aria-label="Filtrar por letra" className="mb-4 flex flex-wrap gap-1">
          <button
            type="button"
            aria-pressed={letter === ''}
            onClick={() => setLetter('')}
            className={`min-h-9 rounded-token px-3 text-sm ${letter === '' ? 'bg-primary text-primary-contrast' : 'border border-border'}`}
          >
            Todas
          </button>
          {LETTERS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={letter === item}
              onClick={() => setLetter(item)}
              className={`min-h-9 min-w-9 rounded-token px-2 text-sm ${letter === item ? 'bg-primary text-primary-contrast' : 'border border-border'}`}
            >
              {item}
            </button>
          ))}
        </nav>
      ) : null}

      {loading ? <Loading /> : null}
      {failed?.error ? <Alert>{errorMessage(failed.error)}</Alert> : null}
      {reorder.isError ? <Alert>{errorMessage(reorder.error)}</Alert> : null}
      {!loading && !failed && ordered.length === 0 ? (
        <EmptyState title="No hay entradas con estos filtros" />
      ) : null}
      {ordered.length > 0 ? (
        <>
          {!canReorder ? (
            <p className="mb-2 text-xs text-muted">
              Elige un libro para poder ordenar las entradas a mano.
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Orden
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {tabId === 'powers' ? 'Campo' : 'Grupo'}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Oculto hasta…
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((entry) => (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <span className="flex gap-1">
                        <Button
                          variant="ghost"
                          aria-label={`Subir ${entry.name}`}
                          disabled={!canReorder || reorder.isPending}
                          onClick={() => move(entry, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Bajar ${entry.name}`}
                          disabled={!canReorder || reorder.isPending}
                          onClick={() => move(entry, 1)}
                        >
                          ↓
                        </Button>
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${entry.kind === 'power' ? 'pl-8' : ''}`}>
                      {entry.name}
                      {tabId === 'powers' ? (
                        <span className="ml-2 text-xs font-normal text-muted">
                          {KIND_LABEL[entry.kind]}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {entry.kind === 'power' ? nameOf(entry.parentId) : (entry.group ?? '—')}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {entry.unlockAfter ? 'Un quiz completado' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          entry.status === 'published'
                            ? 'success'
                            : entry.status === 'archived'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {STATUS[entry.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/admin/wiki/${entry.id}`} className="underline">
                        Editar<span className="sr-only"> {entry.name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
