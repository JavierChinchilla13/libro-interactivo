import { plural, type TestProgressResetResponse } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { readerApi, readerKeys } from './api';
import type { LibraryEntry } from './LibraryBookCard';
import { useLibrary } from './useLibrary';

const ID = /([0-9a-f]{24})/i;

/**
 * Botón de la franja: 44 px de alto en todo momento y, en el celular, la etiqueta completa en dos líneas si hace falta
 * (así los dos caben lado a lado sin acortar el nombre que lee el lector de pantalla).
 */
const BUTTON =
  'btn btn-compact min-h-11 px-2 text-center text-[13px] leading-tight whitespace-normal sm:px-4 sm:text-sm';

/** Mensaje de éxito de «Reiniciar mi progreso de prueba», con lo que se borró. */
export function resetMessage(counts: TestProgressResetResponse): string {
  if (counts.quizAttempts === 0 && counts.gameSessions === 0) {
    return 'No había pruebas que borrar: tu recorrido ya está desde cero.';
  }
  return `Listo: se borraron ${plural(counts.quizAttempts, 'intento de quiz', 'intentos de quiz')} y ${plural(counts.gameSessions, 'partida de juego', 'partidas de juego')} de prueba. Tu recorrido empieza desde cero.`;
}

/**
 * Qué libro se está viendo según la dirección: `/panel/libros/:slug…`, `/panel/juego/:bookId`, `/panel/quiz/:quizId` o `/panel/extras/:extraId`
 * (el libro de un quiz o de un capítulo extra se sabe cuando su pantalla ya cargó). Solo sirve para saber si ese libro
 * está sin publicar: eso lo dice la biblioteca (`unpublished`), nunca el `status` del libro.
 */
function useViewedEntry(entries: readonly LibraryEntry[]): LibraryEntry | undefined {
  const { pathname } = useLocation();
  const draft = useSearchParams()[0].get('fuente') === 'borrador';
  const slug = /^\/panel\/libros\/([^/]+)/.exec(pathname)?.[1];
  const gameBookId = /^\/panel\/juego\/([^/]+)/.exec(pathname)?.[1];
  const quizId = /^\/panel\/quiz\/([^/]+)/.exec(pathname)?.[1];
  const extraId = /^\/panel\/extras\/([^/]+)/.exec(pathname)?.[1];
  // Solo escucha la caché: la introducción la pide la pantalla del quiz; aquí no se hace ninguna petición.
  const intro = useQuery({
    queryKey: readerKeys.intro(quizId && ID.test(quizId) ? quizId : '', draft),
    queryFn: () => readerApi.intro(quizId ?? ''),
    enabled: false,
  });
  // Igual con un capítulo extra abierto: su libro se sabe cuando la pantalla ya lo cargó (misma clave que `ExtraViewPage`).
  const extra = useQuery({
    queryKey: ['reader', 'extra', extraId && ID.test(extraId) ? extraId : ''],
    queryFn: () => readerApi.extra(extraId ?? ''),
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
  if (extraId && extra.data) return entries.find((entry) => entry.book.id === extra.data?.bookId);
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
  const draft = useSearchParams()[0].get('fuente') === 'borrador';
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
      // Compacta en el celular (texto de 13 px y botones lado a lado); el área de toque de los botones sigue en 44 px.
      className="border-b-2 border-warning bg-surface-alt px-4 py-1.5 text-[13px] leading-4 sm:py-3 sm:text-sm sm:leading-normal"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && confirming) setConfirming(false);
      }}
    >
      <div className="mx-auto flex w-full max-w-[var(--token-page-max)] flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <p className="min-w-0 [overflow-wrap:anywhere]">
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block rounded-token-xs border border-warning px-1 py-px align-middle text-[11px] font-semibold uppercase leading-4 tracking-wide sm:mr-2 sm:px-1.5 sm:py-0.5 sm:text-xs"
          >
            Prueba
          </span>
          <span className="font-medium">
            Modo prueba: nada de esto cuenta para las estadísticas ni para los lectores.
          </span>
          {draft ? (
            // Una prueba del BORRADOR: lo que se ve es el borrador del quiz, no lo que ven los lectores.
            <span className="ml-1 font-semibold">Probando el BORRADOR (no publicado).</span>
          ) : null}
          {unpublished ? (
            <span className="ml-1">Este libro aún no está publicado: los lectores no lo ven.</span>
          ) : null}
        </p>
        <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0 lg:flex-nowrap lg:items-center">
          {confirming ? (
            <div
              role="group"
              aria-label="Confirmar el reinicio"
              className="col-span-2 grid grid-cols-2 items-center gap-2 lg:flex"
            >
              <span className="col-span-2 lg:max-w-sm">
                Se borrarán tus intentos y partidas de prueba. No afecta a ningún lector ni a tu
                cuenta.
              </span>
              <button
                ref={cancel}
                type="button"
                className={`${BUTTON} btn-secondary`}
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${BUTTON} btn-primary`}
                disabled={reset.isPending}
                onClick={() => reset.mutate()}
              >
                {reset.isPending ? 'Reiniciando…' : 'Sí, reiniciar'}
              </button>
            </div>
          ) : (
            <>
              <Link to="/admin" className={`${BUTTON} btn-secondary`}>
                Volver a administración
              </Link>
              <button
                type="button"
                className={`${BUTTON} btn-secondary`}
                onClick={() => {
                  setMessage(null);
                  reset.reset();
                  setConfirming(true);
                }}
              >
                Reiniciar mi progreso de prueba
              </button>
            </>
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
