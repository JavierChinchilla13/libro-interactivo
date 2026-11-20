import { plural, type TestProgressResetResponse } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { readerApi, readerKeys } from './api';
import type { LibraryEntry } from './LibraryBookCard';
import { useLibrary } from './useLibrary';

const ID = /([0-9a-f]{24})/i;

/** Mensaje de éxito de «Reiniciar mi progreso de prueba», con lo que se borró. */
export function resetMessage(counts: TestProgressResetResponse): string {
  if (counts.quizAttempts === 0 && counts.gameSessions === 0) {
    return 'No había pruebas que borrar: tu recorrido ya está desde cero.';
  }
  return `Listo: se borraron ${plural(counts.quizAttempts, 'intento de quiz', 'intentos de quiz')} y ${plural(counts.gameSessions, 'partida de juego', 'partidas de juego')} de prueba. Tu recorrido empieza desde cero.`;
}

/**
 * Qué libro se está viendo según la dirección: `/panel/libros/:slug…`, `/panel/juego/:bookId` o `/panel/quiz/:quizId`
 * (el libro de un quiz se sabe cuando la pantalla del quiz ya cargó su introducción). Solo sirve para saber si ese libro
 * está sin publicar: eso lo dice la biblioteca (`unpublished`), nunca el `status` del libro.
 */
function useViewedEntry(entries: readonly LibraryEntry[]): LibraryEntry | undefined {
  const { pathname } = useLocation();
  const slug = /^\/panel\/libros\/([^/]+)/.exec(pathname)?.[1];
  const gameBookId = /^\/panel\/juego\/([^/]+)/.exec(pathname)?.[1];
  const quizId = /^\/panel\/quiz\/([^/]+)/.exec(pathname)?.[1];
  // Solo escucha la caché: la introducción la pide la pantalla del quiz; aquí no se hace ninguna petición.
  const intro = useQuery({
    queryKey: readerKeys.intro(quizId && ID.test(quizId) ? quizId : ''),
    queryFn: () => readerApi.intro(quizId ?? ''),
    enabled: false,
  });
  if (slug) {
    try {
      const decoded = decodeURIComponent(slug);
      return entries.find((entry) => entry.book.slug === decoded);
    } catch {
      return undefined;
    }
  }
  if (gameBookId) return entries.find((entry) => entry.book.id === gameBookId);
  if (quizId && intro.data) return entries.find((entry) => entry.book.id === intro.data?.bookId);
  return undefined;
}

/**
 * Franja de «Modo prueba», solo para el equipo (EDITOR y ADMIN) dentro del panel del lector: lo que juega o abre aquí
 * no cuenta para las estadísticas ni para los lectores. Dice además si el libro que se está viendo aún no está
 * publicado (lo decide la biblioteca con `unpublished`), da el camino de vuelta a administración y permite reiniciar el
 * progreso de prueba propio, con confirmación en la misma franja.
 */
export function TestModeBanner() {
  const client = useQueryClient();
  const library = useLibrary();
  const entry = useViewedEntry(library.data?.books ?? []);
  const unpublished = entry?.unpublished !== undefined;

  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // En una acción que borra, el foco empieza en «Cancelar»: Enter no destruye por error.
    if (confirming) cancel.current?.focus();
  }, [confirming]);

  const reset = useMutation({
    mutationFn: readerApi.resetTestProgress,
    onSuccess: async (counts) => {
      setConfirming(false);
      setMessage(resetMessage(counts));
      // El hilo, los resultados y la biblioteca vuelven a pedirse: el recorrido empieza de cero.
      await client.invalidateQueries({ queryKey: ['reader'] });
    },
  });

  return (
    <div
      role="status"
      data-testid="test-mode-banner"
      className="border-b-2 border-warning bg-surface-alt px-4 py-3 text-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && confirming) setConfirming(false);
      }}
    >
      <div className="mx-auto flex w-full max-w-[var(--token-page-max)] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="min-w-0 [overflow-wrap:anywhere]">
          <span
            aria-hidden="true"
            className="mr-2 inline-block rounded-token-xs border border-warning px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
          >
            Prueba
          </span>
          <span className="font-medium">
            Modo prueba: nada de esto cuenta para las estadísticas ni para los lectores.
          </span>
          {unpublished ? (
            <span className="ml-1">Este libro aún no está publicado: los lectores no lo ven.</span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
          <Link to="/admin" className="btn btn-secondary btn-compact">
            Volver a administración
          </Link>
          {confirming ? (
            <div
              role="group"
              aria-label="Confirmar el reinicio"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="max-w-sm">
                Se borrarán tus intentos y partidas de prueba. No afecta a ningún lector ni a tu
                cuenta.
              </span>
              <button
                ref={cancel}
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={reset.isPending}
                onClick={() => reset.mutate()}
              >
                {reset.isPending ? 'Reiniciando…' : 'Sí, reiniciar'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => {
                setMessage(null);
                reset.reset();
                setConfirming(true);
              }}
            >
              Reiniciar mi progreso de prueba
            </button>
          )}
        </div>
      </div>
      {message ? (
        <p className="mx-auto mt-2 w-full max-w-[var(--token-page-max)]">{message}</p>
      ) : null}
      {reset.isError ? (
        <p role="alert" className="mx-auto mt-2 w-full max-w-[var(--token-page-max)] text-danger">
          No pudimos reiniciar tu progreso de prueba: {errorMessage(reset.error)}
        </p>
      ) : null}
    </div>
  );
}
