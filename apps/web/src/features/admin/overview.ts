import type { AuthUser } from '@libro/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  accessApi,
  booksApi,
  fanArtsApi,
  keys,
  messagesApi,
  postsApi,
  quizzesApi,
  siteApi,
  statsApi,
} from './api';

type Role = AuthUser['role'];

/** Claves propias que cuelgan de las de cada lista: guardar algo allí las invalida solas. */
const overviewKeys = {
  fanArtDrafts: [...keys.fanArts, 'drafts'] as const,
  postDrafts: [...keys.posts, 'drafts'] as const,
  messagesUnhandled: [...keys.messages, 'unhandled'] as const,
  quizzes: (bookId: string) => [...keys.quizzes(bookId), 'overview'] as const,
  tokens: ['admin', 'access', 'all'] as const,
};

const MINUTE = 60_000;

/**
 * Números del menú lateral: mensajes sin leer (solo administradoras) y fan arts en borrador. Son dos llamadas
 * pequeñas que ya existen; si fallan, el menú simplemente no muestra insignia.
 */
export function useNavCounts(role: Role | undefined) {
  const staff = role === 'EDITOR' || role === 'ADMIN';
  const messages = useQuery({
    queryKey: overviewKeys.messagesUnhandled,
    queryFn: () => messagesApi.list({ status: 'unhandled' }),
    enabled: role === 'ADMIN',
    staleTime: MINUTE,
  });
  const fanArts = useQuery({
    queryKey: overviewKeys.fanArtDrafts,
    queryFn: () => fanArtsApi.list({ status: 'draft' }),
    enabled: staff,
    staleTime: MINUTE,
  });
  return {
    mensajes: messages.data?.unhandled ?? 0,
    'fan-arts': fanArts.data?.fanArts.length ?? 0,
  } as Record<string, number>;
}

const DAY = 86_400_000;

/** Próximo lanzamiento: el libro (sin publicar aún) con la fecha futura más cercana. */
export interface Upcoming {
  id: string;
  title: string;
  date: Date;
  days: number;
}

/**
 * Todo lo que necesita el inicio, con los endpoints que ya existen. Lo que solo ve una administradora (mensajes,
 * lectoras, códigos QR) no se pide a una editora.
 */
export function useAdminOverview(role: Role | undefined, now: Date = new Date()) {
  const isAdmin = role === 'ADMIN';
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const bookList = books.data?.books;
  const quizQueries = useQueries({
    queries: (bookList ?? []).map((book) => ({
      queryKey: overviewKeys.quizzes(book.id),
      queryFn: () => quizzesApi.list(book.id),
      staleTime: MINUTE,
    })),
  });
  const fanArts = useQuery({
    queryKey: overviewKeys.fanArtDrafts,
    queryFn: () => fanArtsApi.list({ status: 'draft' }),
    staleTime: MINUTE,
  });
  const posts = useQuery({
    queryKey: overviewKeys.postDrafts,
    queryFn: () => postsApi.list({ status: 'draft' }),
    staleTime: MINUTE,
  });
  const site = useQuery({ queryKey: keys.site, queryFn: siteApi.get, staleTime: MINUTE });
  const stats = useQuery({
    queryKey: keys.stats,
    queryFn: statsApi.get,
    enabled: isAdmin,
    staleTime: MINUTE,
  });
  const tokens = useQuery({
    queryKey: overviewKeys.tokens,
    queryFn: () => accessApi.list(),
    enabled: isAdmin,
    staleTime: MINUTE,
  });

  const quizzesReady = bookList !== undefined && quizQueries.every((query) => !query.isPending);
  const quizzes = quizQueries.flatMap((query) => query.data?.quizzes ?? []);
  const live = quizzes.filter((quiz) => quiz.status !== 'archived');

  let upcoming: Upcoming | null = null;
  for (const book of bookList ?? []) {
    if (book.status === 'published' || book.status === 'archived' || !book.releaseDate) continue;
    const date = new Date(book.releaseDate);
    const days = Math.ceil((date.getTime() - now.getTime()) / DAY);
    if (days < 0) continue;
    if (!upcoming || days < upcoming.days)
      upcoming = { id: book.id, title: book.title, date, days };
  }

  return {
    /** El inicio se dibuja cuando están los libros; lo demás aparece a medida que llega. */
    loading: books.isPending,
    failed: books.isError,
    refetch: () => void books.refetch(),
    /** Algún origen secundario falló: no se puede afirmar «Todo al día». */
    partialFailure: [fanArts, posts, ...quizQueries, ...(isAdmin ? [stats] : [])].some(
      (query) => query.isError,
    ),
    refetchAll: () => {
      for (const query of [fanArts, posts, ...quizQueries, ...(isAdmin ? [stats] : [])]) {
        if (query.isError) void query.refetch();
      }
    },
    books: {
      total: bookList?.length ?? 0,
      published: bookList?.filter((book) => book.status === 'published').length ?? 0,
    },
    quizzes: {
      ready: quizzesReady,
      total: live.length,
      published: live.filter((quiz) => quiz.status === 'published').length,
      drafts: live.filter((quiz) => quiz.status === 'draft').length,
      withChanges: live.filter((quiz) => quiz.status === 'published' && quiz.hasUnpublishedChanges)
        .length,
    },
    // Un origen que falla cuenta como «nada que mostrar»: no deja el inicio cargando para siempre.
    fanArtDrafts: fanArts.isPending ? undefined : (fanArts.data?.fanArts.length ?? 0),
    postDrafts: posts.isPending ? undefined : (posts.data?.posts.length ?? 0),
    unhandledMessages: isAdmin
      ? stats.isPending
        ? undefined
        : (stats.data?.unhandledMessages ?? 0)
      : undefined,
    stats: stats.data,
    tokenCount: isAdmin
      ? tokens.data?.tokens.filter((token) => token.status === 'active').length
      : undefined,
    headerImages: site.isPending ? undefined : (site.data?.universe.headerImages?.length ?? 0),
    upcoming,
  };
}
