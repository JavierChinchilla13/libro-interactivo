import { POST_CATEGORY_LABELS, postTemplates } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatShortDate } from '../../../shared/lib/dates';
import { SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Badge, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { keys, postsApi } from '../api';
import { errorMessage } from '../errors';
import { statusLabel } from './postForm';

const tone = (label: string) =>
  label === 'Publicada' ? 'success' : label === 'Programada' ? 'warning' : 'neutral';

/** Actualizaciones del sitio: filtros por estado, tipo y título. */
export function PostListPage() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const filter = { status, category, q: text.trim() };
  const posts = useQuery({
    queryKey: [...keys.posts, filter],
    queryFn: () =>
      postsApi.list({
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.q ? { q: filter.q } : {}),
      }),
  });
  const filtering = Boolean(status || category || filter.q);

  return (
    <>
      <PageHeader
        title="Actualizaciones"
        subtitle="Ferias, eventos y novedades. Cada publicación elige una plantilla."
        actions={
          <Link
            to="/admin/actualizaciones/nueva"
            className="inline-flex min-h-11 items-center rounded-token bg-primary px-4 text-sm font-semibold text-primary-contrast"
          >
            + Nueva actualización
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
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
          options={Object.entries(POST_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => setCategory(event.target.value)}
        />
        <TextField
          label="Buscar por título"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {posts.isPending ? <Loading /> : null}
      {posts.isError ? <Alert>{errorMessage(posts.error)}</Alert> : null}
      {posts.data && posts.data.posts.length === 0 ? (
        <EmptyState
          title={
            filtering ? 'No hay actualizaciones con esos filtros' : 'Todavía no hay actualizaciones'
          }
        >
          {filtering ? null : 'Crea la primera con «Nueva actualización».'}
        </EmptyState>
      ) : null}
      {posts.data && posts.data.posts.length > 0 ? (
        <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Título
                </th>
                <th scope="col" className="px-4 py-3">
                  Plantilla
                </th>
                <th scope="col" className="px-4 py-3">
                  Tipo
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {posts.data.posts.map((post) => {
                const label = statusLabel(post);
                return (
                  <tr key={post.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      {post.title}
                      {post.featured ? (
                        <span
                          className="ml-2 text-xs text-muted"
                          title="Destacada en la página principal"
                        >
                          ★ Destacada
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">{postTemplates[post.template].label}</td>
                    <td className="px-4 py-3 text-muted">{POST_CATEGORY_LABELS[post.category]}</td>
                    <td className="px-4 py-3">
                      <Badge tone={tone(label)}>{label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {post.publishedAt ? formatShortDate(post.publishedAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/admin/actualizaciones/${post.id}`} className="underline">
                        Editar<span className="sr-only"> {post.title}</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
