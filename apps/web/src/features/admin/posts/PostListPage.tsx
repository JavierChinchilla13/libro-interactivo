import { POST_CATEGORY_LABELS, postTemplates } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatShortDate } from '../../../shared/lib/dates';
import { SelectField, TextField } from '../../../shared/ui/controls';
import { keys, postsApi } from '../api';
import { DataList, type Column } from '../components/DataList';
import { ListPage } from '../components/ListPage';
import { StatusBadge, type AdminStatus } from '../components/StatusBadge';
import { statusLabel } from './postForm';

const STATUS: Record<string, AdminStatus> = {
  Publicada: 'published',
  Programada: 'scheduled',
  Borrador: 'draft',
  Archivada: 'archived',
};

type PostRow = NonNullable<ReturnType<typeof usePosts>['data']>['posts'][number];
const usePosts = (filter: { status: string; category: string; q: string }) =>
  useQuery({
    queryKey: [...keys.posts, filter],
    queryFn: () =>
      postsApi.list({
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.q ? { q: filter.q } : {}),
      }),
  });

const columns: Column<PostRow>[] = [
  {
    id: 'title',
    header: 'Título',
    role: 'title',
    cell: (post) => (
      <span className="admin-cell-title">
        {post.title}
        {post.featured ? (
          <span
            className="ml-2 text-xs font-normal text-muted"
            title="Destacada en la página principal"
          >
            ★ Destacada
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: 'template',
    header: 'Plantilla',
    role: 'meta',
    cell: (post) => postTemplates[post.template].label,
  },
  {
    id: 'category',
    header: 'Tipo',
    role: 'meta',
    cell: (post) => POST_CATEGORY_LABELS[post.category],
  },
  {
    id: 'status',
    header: 'Estado',
    role: 'status',
    cell: (post) => {
      const label = statusLabel(post);
      return <StatusBadge status={STATUS[label] ?? 'draft'} label={label} />;
    },
  },
  {
    id: 'date',
    header: 'Fecha',
    role: 'meta',
    cell: (post) => (post.publishedAt ? formatShortDate(post.publishedAt) : '—'),
  },
];

/** Actualizaciones del sitio: filtros por estado, tipo y título. */
export function PostListPage() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const filter = { status, category, q: text.trim() };
  const posts = usePosts(filter);
  const filtering = Boolean(status || category || filter.q);

  return (
    <ListPage
      title="Actualizaciones"
      subtitle="Ferias, eventos y novedades. Cada publicación elige una plantilla."
      primaryAction={
        <Link to="/admin/actualizaciones/nueva" className="btn btn-primary">
          + Nueva actualización
        </Link>
      }
      toolbar={
        <>
          <SelectField
            label="Estado"
            value={status}
            placeholder="Todos"
            options={[
              { value: 'draft', label: 'Borrador' },
              { value: 'published', label: 'Publicada o programada' },
              { value: 'archived', label: 'Archivada' },
            ]}
            onChange={(event) => setStatus(event.target.value)}
          />
          <SelectField
            label="Tipo"
            value={category}
            placeholder="Todos"
            options={Object.entries(POST_CATEGORY_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(event) => setCategory(event.target.value)}
          />
          <TextField
            label="Buscar por título"
            type="search"
            wrapperClassName="min-w-56 flex-1 sm:max-w-xs"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </>
      }
      state={posts}
      count={posts.data?.posts.length}
      filtersActive={filtering}
      onClearFilters={() => {
        setStatus('');
        setCategory('');
        setText('');
      }}
      noResults="No hay actualizaciones con esos filtros"
      empty={{
        icon: 'news',
        title: 'Todavía no hay actualizaciones',
        text: 'Ferias, eventos y novedades para las lectoras. Cada una elige una plantilla.',
        action: (
          <Link to="/admin/actualizaciones/nueva" className="btn btn-primary">
            Crear la primera actualización
          </Link>
        ),
      }}
    >
      <DataList
        label="Actualizaciones"
        rows={posts.data?.posts ?? []}
        rowKey={(post) => post.id}
        columns={columns}
        action={{
          to: (post) => `/admin/actualizaciones/${post.id}`,
          name: (post) => post.title,
        }}
      />
    </ListPage>
  );
}
