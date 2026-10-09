import { POST_CATEGORY_LABELS, type PostCard, type PostCategory } from '@libro/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { formatShortDate } from '../../shared/lib/dates';
import { Button } from '../../shared/ui/controls';
import { Alert, Badge, EmptyState, Loading } from '../../shared/ui/layout';
import { postKeys, postsApi } from './api';

/** Filtro por tipo: la dirección usa el plural en español (`?tipo=eventos`). */
const FILTERS: { label: string; slug: string | null; category: PostCategory | undefined }[] = [
  { label: 'Todas', slug: null, category: undefined },
  { label: 'Eventos', slug: 'eventos', category: 'evento' },
  { label: 'Novedades', slug: 'novedades', category: 'novedad' },
  { label: 'Invitaciones', slug: 'invitaciones', category: 'invitacion' },
];

/** Tarjeta de una publicación: miniatura, tipo, título, fecha y primer párrafo. */
export function PostCardItem({ post }: { post: PostCard }) {
  return (
    <li>
      <Link
        to={`/actualizaciones/${post.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-token-lg border border-border bg-surface hover:bg-surface-alt"
      >
        {post.thumbnail ? (
          <img
            src={thumbUrl(post.thumbnail.url, 640)}
            alt={post.thumbnail.alt}
            width={post.thumbnail.width}
            height={post.thumbnail.height}
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
        ) : null}
        <span className="flex flex-1 flex-col gap-2 p-4">
          <span>
            <Badge tone={post.category === 'evento' ? 'warning' : 'neutral'}>
              {POST_CATEGORY_LABELS[post.category]}
            </Badge>
          </span>
          <span className="font-display text-lg font-semibold">{post.title}</span>
          <span className="text-xs text-muted">{formatShortDate(post.publishedAt)}</span>
          {post.excerpt ? <span className="text-sm text-muted">{post.excerpt}</span> : null}
        </span>
      </Link>
    </li>
  );
}

/** Lista de actualizaciones: filtro por tipo, más recientes primero y «Cargar más». */
export function PostsPage() {
  const [params, setParams] = useSearchParams();
  const active = FILTERS.find((filter) => filter.slug === params.get('tipo')) ?? FILTERS[0];
  const category = active?.category;
  const query = useInfiniteQuery({
    queryKey: postKeys.list(category),
    queryFn: ({ pageParam }) => postsApi.list({ category, page: pageParam }),
    initialPageParam: 1,
    retry: false,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const posts = query.data?.pages.flatMap((page) => page.posts) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Actualizaciones</h1>
        <p className="text-muted">Ferias, eventos y novedades de la autora.</p>
      </div>
      <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            aria-pressed={filter === active}
            onClick={() => setParams(filter.slug ? { tipo: filter.slug } : {})}
            className={`min-h-11 rounded-full border px-4 text-sm ${
              filter === active ? 'border-primary bg-surface-alt font-semibold' : 'border-border'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {query.isPending ? <Loading /> : null}
      {query.isError ? <Alert>{errorMessage(query.error)}</Alert> : null}
      {query.isSuccess && posts.length === 0 ? (
        <EmptyState title="Todavía no hay publicaciones de este tipo." />
      ) : null}
      {posts.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCardItem key={post.id} post={post} />
          ))}
        </ul>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-center"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Cargar más
        </Button>
      ) : null}
    </div>
  );
}
