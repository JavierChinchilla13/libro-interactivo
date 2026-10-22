import type { PublicBookSummary } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { communityApi, communityKeys } from '../community/api';
import { postKeys, postsApi } from '../posts/api';
import { booksApi, readerKeys } from '../reader/api';
import { publicApi, publicKeys } from './api';
import {
  AuthorSection,
  BuySection,
  ClosingBand,
  Experiences,
  FeaturedBookCard,
  FeaturedPosts,
  Hero,
  Manifesto,
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
  // Las secciones se montan cuando el héroe ya se pintó (su elemento más grande es el LCP): así sus letras
  // (Newsreader) y sus imágenes no compiten con el primer pintado. Mientras tanto se ve el relleno de altura fija.
  // Si el navegador no informa del LCP, o tarda, se montan igual (el respaldo es corto).
  const [afterFirstPaint, setAfterFirstPaint] = useState(false);
  useEffect(() => {
    if (heroStatus === 'loading') return;
    const release = () => setAfterFirstPaint(true);
    const supported =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint');
    if (!supported) {
      release();
      return;
    }
    const fallback = setTimeout(release, 1200);
    const observer = new PerformanceObserver((list) => {
      const inHero = list.getEntries().some((entry) => {
        const element = (entry as PerformanceEntry & { element?: Element | null }).element;
        return Boolean(element?.closest('[aria-labelledby="hero-title"]'));
      });
      if (inHero) release();
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
    return () => {
      clearTimeout(fallback);
      observer.disconnect();
    };
  }, [heroStatus]);
  const sectionsLoading =
    !afterFirstPaint || [books, detail, featuredPosts, reviews].some((query) => query.isLoading);
  const failed = [site, books, detail].filter((query) => query.isError);

  const lockMessage = site.data?.lockMessage ?? 'Bloqueado: avanza en tu lectura';
  const book = detail.data;
  // La ficha del libro solo aparece si tiene algo que contar además del título.
  const showBook = book !== undefined && Boolean(book.cover || book.synopsis || book.tagline);

  // Un enlace con ancla (`/#comprar`) llega antes de que las secciones existan: se desplaza cuando ya están.
  const location = useLocation();
  useEffect(() => {
    if (sectionsLoading || !location.hash) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [sectionsLoading, location.hash, location.key]);

  return (
    <div className="flex flex-col">
      <Hero site={site.data} signedIn={Boolean(session.data)} status={heroStatus} />
      {failed.length > 0 && !sectionsLoading ? (
        <div className="mt-6">
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
        </div>
      ) : null}
      {sectionsLoading ? (
        <SectionsSkeleton />
      ) : (
        <>
          <Manifesto
            hasBook={Boolean(book && showBook)}
            hasExperiences={(book?.experiences.length ?? 0) > 0}
          />
          {book && showBook ? <FeaturedBookCard book={book} /> : null}
          <BuySection links={book?.purchaseLinks ?? []} />
          {book ? (
            <Experiences
              experiences={book.experiences}
              lockMessage={lockMessage}
              signedIn={Boolean(session.data)}
            />
          ) : null}
          {book ? <WikiPreview tabs={book.wikiTabs} lockMessage={lockMessage} /> : null}
          <FeaturedPosts posts={featuredPosts.data?.posts ?? []} />
          <SagaSection books={books.data?.books ?? []} />
          <ReviewsSection reviews={reviews.data?.reviews ?? []} />
          {heroStatus === 'loading' ? null : <AuthorSection site={site.data} />}
        </>
      )}
      {sectionsLoading ? null : (
        <ClosingBand signedIn={Boolean(session.data)} sessionReady={!session.isPending} />
      )}
    </div>
  );
}
