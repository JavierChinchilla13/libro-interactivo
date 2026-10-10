import type { PublicBookSummary } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { communityApi, communityKeys } from '../community/api';
import { postKeys, postsApi } from '../posts/api';
import { booksApi, readerKeys } from '../reader/api';
import { publicApi, publicKeys } from './api';
import {
  AuthorSection,
  BookSection,
  BuySection,
  Experiences,
  FeaturedPosts,
  Hero,
  ReviewsSection,
  SagaSection,
  SectionsSkeleton,
  WikiPreview,
} from './LandingSections';

/** El libro que se destaca: el publicado más reciente de la saga (el de mayor posición). */
function pickFeatured(books: readonly PublicBookSummary[]): PublicBookSummary | undefined {
  return books.filter((book) => book.status === 'published').sort((a, b) => b.order - a.order)[0];
}

/**
 * Landing pública. Solo muestra lo que ya existe: una sección sin datos se omite, y los textos
 * que la autora aún no escribe aparecen marcados `[PLACEHOLDER]`. Nunca revela contenido del libro.
 */
export function HomePage() {
  const session = useSession();
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list });
  const featured = pickFeatured(books.data?.books ?? []);
  const detail = useQuery({
    queryKey: publicKeys.book(featured?.slug ?? ''),
    queryFn: () => booksApi.get(featured?.slug ?? ''),
    enabled: featured !== undefined,
  });

  const featuredPosts = useQuery({
    queryKey: postKeys.featured,
    queryFn: () => postsApi.list({ featured: true, pageSize: 3 }),
    // Secciones decorativas: si fallan, la página sigue sin ellas (sin reintentos que la retengan).
    retry: false,
  });

  const reviews = useQuery({
    queryKey: communityKeys.reviews,
    queryFn: () => communityApi.reviews(6),
    retry: false,
  });

  // El héroe no espera a nadie: aparece de inmediato y solo sus textos esperan a `site`. Las secciones de abajo
  // se reservan con un relleno de altura fija (sin saltos de diseño) y entran juntas cuando todo respondió.
  const heroStatus = site.isLoading ? 'loading' : site.isError ? 'error' : 'ready';
  const sectionsLoading = [books, detail, featuredPosts, reviews].some((query) => query.isLoading);
  const failed = [site, books, detail].filter((query) => query.isError);

  const lockMessage = site.data?.lockMessage ?? 'Bloqueado: avanza en tu lectura';
  const book = detail.data;

  return (
    <div className="flex flex-col gap-14">
      <Hero
        site={site.data}
        hasBook={book !== undefined && !sectionsLoading}
        signedIn={Boolean(session.data)}
        sessionReady={!session.isPending}
        status={heroStatus}
      />
      {failed.length > 0 && !sectionsLoading ? (
        <Alert tone="warning" title="No pudimos cargar todo el contenido">
          <div className="mt-2">
            <Button
              variant="secondary"
              onClick={() => failed.forEach((query) => void query.refetch())}
            >
              Reintentar
            </Button>
          </div>
        </Alert>
      ) : null}
      {sectionsLoading ? (
        <SectionsSkeleton />
      ) : (
        <>
          {book ? <BookSection book={book} /> : null}
          {book ? <WikiPreview tabs={book.wikiTabs} lockMessage={lockMessage} /> : null}
          {book ? (
            <Experiences
              experiences={book.experiences}
              lockMessage={lockMessage}
              signedIn={Boolean(session.data)}
            />
          ) : null}
          <FeaturedPosts posts={featuredPosts.data?.posts ?? []} />
          <SagaSection books={books.data?.books ?? []} />
          <BuySection links={book?.purchaseLinks ?? []} />
          <ReviewsSection reviews={reviews.data?.reviews ?? []} />
        </>
      )}
      {heroStatus === 'loading' ? null : <AuthorSection site={site.data} />}
    </div>
  );
}
