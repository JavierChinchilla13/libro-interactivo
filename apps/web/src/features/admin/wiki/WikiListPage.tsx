import type { WikiEntryResponse, WikiKind } from '@libro/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Tabs } from '../../../shared/ui/layout';
import { booksApi, keys, wikiApi } from '../api';
import { DataList, type Column } from '../components/DataList';
import { ListPage } from '../components/ListPage';
import { StatusBadge } from '../components/StatusBadge';
import { errorMessage } from '../errors';
import { KIND_LABEL, LIST_TABS } from './wikiForm';

type TabId = (typeof LIST_TABS)[number]['id'];

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

  const columns: Column<WikiEntryResponse>[] = [
    {
      id: 'order',
      header: 'Orden',
      role: 'table',
      cell: (entry) => (
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
      ),
    },
    {
      id: 'name',
      header: 'Nombre',
      role: 'title',
      cell: (entry) => (
        <span className={`admin-cell-title ${entry.kind === 'power' ? 'pl-6' : ''}`}>
          {entry.name}
          {tabId === 'powers' ? (
            <span className="ml-2 text-xs font-normal text-muted">{KIND_LABEL[entry.kind]}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'group',
      header: tabId === 'powers' ? 'Campo' : 'Grupo',
      role: 'meta',
      cell: (entry) => (entry.kind === 'power' ? nameOf(entry.parentId) : (entry.group ?? '—')),
    },
    {
      id: 'unlock',
      header: 'Oculto hasta…',
      role: 'meta',
      cell: (entry) => (entry.unlockAfter ? 'Un quiz completado' : '—'),
    },
    {
      id: 'status',
      header: 'Estado',
      role: 'status',
      cell: (entry) => <StatusBadge status={entry.status} />,
    },
  ];

  const filtering = bookId !== '' || q !== '' || letter !== '';
  const newLink = `/admin/wiki/nueva?tipo=${newKind}`;

  return (
    <ListPage
      title="Wiki del universo"
      subtitle="Personajes, campos y poderes, lugares y glosario en un solo lugar."
      primaryAction={
        <>
          {tabId === 'powers' ? (
            <Link to="/admin/wiki/nueva?tipo=power" className="btn btn-secondary">
              + Nuevo poder
            </Link>
          ) : null}
          <Link to={newLink} className="btn btn-primary">
            + {tabId === 'powers' ? 'Nuevo campo' : 'Nueva entrada'}
          </Link>
        </>
      }
      tabs={
        <Tabs
          label="Tipos de la wiki"
          active={tabId}
          onChange={(id) => {
            setTabId(id);
            setLetter('');
          }}
          tabs={LIST_TABS.map((item) => ({ id: item.id, label: item.label }))}
        />
      }
      toolbar={
        <>
          <TextField
            label="Buscar por nombre"
            wrapperClassName="min-w-56 flex-1 sm:max-w-xs"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <SelectField
            label="Libro"
            value={bookId}
            placeholder="Todos"
            options={(books.data?.books ?? []).map((book) => ({
              value: book.id,
              label: book.title,
            }))}
            onChange={(event) => setBookId(event.target.value)}
          />
          {tabId === 'term' ? (
            <nav aria-label="Filtrar por letra" className="flex w-full flex-wrap gap-1">
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
        </>
      }
      state={{
        isPending: loading,
        isError: Boolean(failed),
        error: failed?.error,
        refetch: () => lists.forEach((list) => void list.refetch()),
      }}
      count={loading ? undefined : ordered.length}
      filtersActive={filtering}
      onClearFilters={() => {
        setBookId('');
        setQ('');
        setLetter('');
      }}
      noResults="No hay entradas con estos filtros"
      empty={{
        icon: 'wiki',
        title: 'Todavía no hay entradas en esta pestaña',
        text: 'Crea la primera para que aparezca en la wiki.',
        action: (
          <Link to={newLink} className="btn btn-primary">
            {tabId === 'powers' ? 'Crear el primer campo' : 'Crear la primera entrada'}
          </Link>
        ),
      }}
    >
      {reorder.isError ? <Alert>{errorMessage(reorder.error)}</Alert> : null}
      {!canReorder ? (
        <p className="mb-2 text-xs text-muted">
          Elige un libro para poder ordenar las entradas a mano.
        </p>
      ) : null}
      <DataList
        label="Entradas de la wiki"
        rows={ordered}
        rowKey={(entry) => entry.id}
        columns={columns}
        action={{ to: (entry) => `/admin/wiki/${entry.id}`, name: (entry) => entry.name }}
      />
    </ListPage>
  );
}
