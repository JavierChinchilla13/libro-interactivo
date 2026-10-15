import type { GameSessionResponse } from '@libro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { Button } from '../../shared/ui/controls';
import { Alert, Loading } from '../../shared/ui/layout';
import { readerKeys } from '../reader/api';
import { gameApi } from './api';
import { GameStage } from './GameStage';

const WORD_MS = 38;

/** ¿La persona pidió menos movimiento? Entonces el texto aparece completo de una vez. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Texto de la escena palabra por palabra. Lectores de pantalla reciben el texto completo desde el principio; un clic
 * sobre el texto lo muestra entero.
 */
function SceneText({ text }: { text: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? words.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current >= words.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, WORD_MS);
    return () => window.clearInterval(timer);
  }, [words]);

  const done = shown >= words.length;
  return (
    <div className="game-text" onClick={() => setShown(words.length)}>
      <p className="sr-only">{text}</p>
      <p aria-hidden="true">
        {words.slice(0, shown).join(' ')}
        {done ? null : <span className="game-caret" />}
      </p>
    </div>
  );
}

/** Final de la partida: título y texto del final; si es fallido, permite intentarlo de nuevo. */
function EndingPanel({
  session,
  onRetry,
  retrying,
}: {
  session: GameSessionResponse;
  onRetry: () => void;
  retrying: boolean;
}) {
  const ending = session.scene.ending;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  if (!ending) return null;
  const completed = ending.kind === 'completed';
  return (
    <section className="game-ending flex flex-col items-start gap-3" aria-live="polite">
      <p className="label">{completed ? 'Final' : 'Fin de la partida'}</p>
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        {ending.title}
      </h2>
      <p className="max-w-prose">{ending.text}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {completed ? (
          <Link to="/panel" className="btn btn-primary">
            Volver al panel
          </Link>
        ) : (
          <>
            <Button onClick={onRetry} disabled={retrying}>
              Intentarlo de nuevo
            </Button>
            <Link to="/panel" className="btn btn-secondary">
              Volver al panel
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

/** El juego de un libro: la partida en curso se reanuda sola; cada decisión la valida y resuelve el servidor. */
export function GamePage() {
  const { bookId = '' } = useParams();
  const client = useQueryClient();
  const [session, setSession] = useState<GameSessionResponse | null>(null);

  const start = useMutation({
    mutationFn: () => gameApi.start(bookId),
    onSuccess: (data) => setSession(data),
  });
  const choose = useMutation({
    mutationFn: (choiceId: string) => {
      if (!session) throw new Error('Sin partida');
      return gameApi.choose(session.sessionId, choiceId);
    },
    onSuccess: (data) => {
      setSession(data);
      if (data.status === 'completed') {
        void client.invalidateQueries({ queryKey: readerKeys.progress(bookId) });
      }
    },
  });

  const begin = start.mutate;
  useEffect(() => {
    begin();
  }, [begin, bookId]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${session?.title ?? 'Juego'} · Universo Memorias`;
    return () => {
      document.title = previous;
    };
  }, [session?.title]);

  const onChoose = useCallback((choiceId: string) => choose.mutate(choiceId), [choose]);

  if (start.isError && !session) {
    const blocked =
      start.error instanceof ApiClientError &&
      (start.error.code === 'NOT_UNLOCKED' || start.error.code === 'NOT_FOUND');
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <Alert tone={blocked ? 'neutral' : 'danger'}>
          {blocked
            ? 'El juego todavía no está disponible. Completa los quizzes anteriores y vuelve.'
            : errorMessage(start.error)}
        </Alert>
        <Link to="/panel" className="btn btn-secondary self-start">
          Volver al panel
        </Link>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="mx-auto w-full max-w-2xl p-4">
        <Loading label="Preparando el juego…" />
      </main>
    );
  }

  const ended = session.status !== 'in_progress';
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h1 className="sr-only">{session.title}</h1>
      <GameStage scene={session.scene} disabled={choose.isPending || ended} onChoose={onChoose} />
      {choose.isError ? <Alert tone="danger">{errorMessage(choose.error)}</Alert> : null}
      {ended ? (
        <EndingPanel
          session={session}
          retrying={start.isPending}
          onRetry={() => {
            setSession(null);
            start.mutate();
          }}
        />
      ) : (
        <>
          <SceneText key={session.scene.id} text={session.scene.text} />
          <ul className="flex flex-col gap-2" aria-label="¿Qué haces?">
            {session.scene.choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className="option w-full text-left"
                  disabled={choose.isPending}
                  onClick={() => onChoose(choice.id)}
                >
                  {choice.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
