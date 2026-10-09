import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, SelectField } from '../../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { accessApi, booksApi, keys, quizzesApi } from '../api';
import { errorMessage } from '../errors';

/**
 * Códigos QR (solo administradoras): un QR por quiz, igual en todos los ejemplares. Se descargan
 * en PDF (imprenta) o SVG y se pueden regenerar idénticos cuando se quiera; revocar o rotar deja sin efecto el impreso.
 */
export function AccessPage() {
  const client = useQueryClient();
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const [chosen, setChosen] = useState('');
  const [quizId, setQuizId] = useState('');
  const bookId = chosen || books.data?.books[0]?.id || '';

  const tokens = useQuery({
    queryKey: keys.access(bookId),
    queryFn: () => accessApi.list(bookId),
    enabled: bookId !== '',
  });
  const quizzes = useQuery({
    queryKey: keys.quizzes(bookId),
    queryFn: () => quizzesApi.list(bookId),
    enabled: bookId !== '',
  });

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: keys.access(bookId) });
  };
  const create = useMutation({
    mutationFn: () => accessApi.create({ kind: 'quiz', refId: quizId }),
    onSuccess: async () => {
      setQuizId('');
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => accessApi.revoke(id),
    onSuccess: refresh,
  });
  const rotate = useMutation({
    mutationFn: (id: string) => accessApi.rotate(id),
    onSuccess: refresh,
  });

  const covered = new Set(
    (tokens.data?.tokens ?? []).filter((t) => t.status === 'active').map((t) => t.target.refId),
  );
  const free = (quizzes.data?.quizzes ?? []).filter(
    (quiz) => quiz.status === 'published' && !covered.has(quiz.id),
  );
  const error = create.error ?? revoke.error ?? rotate.error;

  return (
    <>
      <PageHeader
        title="Códigos QR"
        subtitle="Un código por quiz, igual en todos los ejemplares. Quien lo escanea lo desbloquea en su cuenta."
      />
      {books.isPending ? <Loading /> : null}
      {books.isError ? <Alert>{errorMessage(books.error)}</Alert> : null}
      {books.data && books.data.books.length === 0 ? (
        <EmptyState title="Primero crea un libro y un quiz" />
      ) : null}
      {books.data && books.data.books.length > 0 ? (
        <div className="flex flex-col gap-5">
          <SelectField
            label="Libro"
            wrapperClassName="max-w-sm"
            value={bookId}
            options={books.data.books.map((book) => ({ value: book.id, label: book.title }))}
            onChange={(event) => {
              setChosen(event.target.value);
              setQuizId('');
            }}
          />

          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">Crear un código</h2>
            <p className="text-sm text-muted">
              Solo quizzes publicados que todavía no tengan un código activo. El del juego se podrá
              crear cuando exista el juego.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <SelectField
                label="Quiz"
                wrapperClassName="min-w-64 flex-1"
                value={quizId}
                placeholder={free.length === 0 ? 'No hay quizzes disponibles' : 'Elige un quiz'}
                disabled={free.length === 0}
                options={free.map((quiz) => ({
                  value: quiz.id,
                  label: `Quiz ${quiz.order} · ${quiz.title}`,
                }))}
                onChange={(event) => setQuizId(event.target.value)}
              />
              <Button
                disabled={quizId === ''}
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                Crear código
              </Button>
            </div>
          </Card>

          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          {tokens.isPending ? <Loading /> : null}
          {tokens.isError ? <Alert>{errorMessage(tokens.error)}</Alert> : null}
          {tokens.data && tokens.data.tokens.length === 0 ? (
            <EmptyState title="Este libro todavía no tiene códigos" />
          ) : null}
          {tokens.data && tokens.data.tokens.length > 0 ? (
            <ul className="flex flex-col gap-3" aria-label="Códigos del libro">
              {tokens.data.tokens.map((token) => (
                <li key={token.id}>
                  <Card as="article" className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      {token.status === 'active' ? (
                        <img
                          src={accessApi.svgUrl(token.id)}
                          alt={`Vista previa del QR de ${token.label}`}
                          className="size-24 rounded-token border border-border bg-white p-1"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-medium">{token.label}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                          <Badge tone={token.status === 'active' ? 'success' : 'warning'}>
                            {token.status === 'active' ? 'Activo' : 'Revocado'}
                          </Badge>
                          <span>{token.redeemCount} desbloqueos</span>
                          {token.revokedReason ? <span>· {token.revokedReason}</span> : null}
                        </p>
                      </div>
                    </div>
                    {token.status === 'active' ? (
                      <div className="flex flex-wrap gap-2">
                        <a href={accessApi.pdfUrl(token.id)} download className="btn btn-primary">
                          Descargar PDF<span className="sr-only"> de {token.label}</span>
                        </a>
                        <a href={accessApi.svgUrl(token.id)} download className="btn btn-secondary">
                          SVG<span className="sr-only"> de {token.label}</span>
                        </a>
                        <Button
                          variant="secondary"
                          loading={rotate.isPending && rotate.variables === token.id}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Rotar crea un código NUEVO y deja sin efecto el impreso. ¿Continuar?',
                              )
                            )
                              rotate.mutate(token.id);
                          }}
                        >
                          Rotar
                        </Button>
                        <Button
                          variant="danger"
                          loading={revoke.isPending && revoke.variables === token.id}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Revocar impide nuevos desbloqueos con este código (los ya concedidos se conservan). ¿Revocar?',
                              )
                            )
                              revoke.mutate(token.id);
                          }}
                        >
                          Revocar
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
