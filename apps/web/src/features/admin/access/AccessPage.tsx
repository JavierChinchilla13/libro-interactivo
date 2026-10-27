import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, SelectField } from '../../../shared/ui/controls';
import { AdminIcon } from '../../../shared/ui/adminIcons';
import { Alert, Card, EmptyState, PageHeader } from '../../../shared/ui/layout';
import { accessApi, booksApi, keys, quizzesApi } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { FormSection } from '../components/FormSection';
import { HelpTip } from '../components/HelpTip';
import { SkeletonRows } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { errorMessage } from '../errors';

/**
 * Códigos QR (solo administradoras): un QR por quiz, igual en todos los ejemplares. Se descargan
 * en PDF (imprenta) o SVG y se pueden regenerar idénticos cuando se quiera; revocar o rotar deja sin efecto el impreso.
 */
export function AccessPage() {
  const client = useQueryClient();
  const toast = useToast();
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
    // También el inicio («Genera el código QR» se marca solo).
    await client.invalidateQueries({ queryKey: ['admin', 'access'] });
  };
  const create = useMutation({
    mutationFn: () => accessApi.create({ kind: 'quiz', refId: quizId }),
    onSuccess: async () => {
      setQuizId('');
      await refresh();
      toast.success('Código creado');
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => accessApi.revoke(id),
    onSuccess: async () => {
      await refresh();
      toast.success('Código revocado');
    },
  });
  const confirm = useConfirm();
  const rotate = useMutation({
    mutationFn: (id: string) => accessApi.rotate(id),
    onSuccess: async () => {
      await refresh();
      toast.success('Código nuevo creado: descárgalo para imprimirlo');
    },
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
      <div className="mb-4">
        <HelpTip>
          Un código por quiz y uno para el juego, igual en todos los ejemplares y sin caducidad.
          Quien lo escanea lo desbloquea en su cuenta. Si un código se filtra, puedes revocarlo o
          crear uno nuevo; quienes ya lo usaron conservan el acceso.
        </HelpTip>
      </div>
      {books.isPending ? <SkeletonRows rows={3} /> : null}
      {books.isError ? <Alert>{errorMessage(books.error)}</Alert> : null}
      {books.data && books.data.books.length === 0 ? (
        <EmptyState
          icon={<AdminIcon name="qr" className="size-7" />}
          title="Primero crea un libro y un quiz"
          action={
            <Link to="/admin/libros/nuevo" className="btn btn-primary">
              Crear libro
            </Link>
          }
        >
          Cada código desbloquea un quiz publicado.
        </EmptyState>
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

          <FormSection
            title="Crear un código"
            help="Solo quizzes publicados que todavía no tengan un código activo. El del juego se podrá crear cuando exista el juego."
          >
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
                aria-describedby={quizId === '' ? 'crear-codigo-motivo' : undefined}
                onClick={() => create.mutate()}
              >
                Crear código
              </Button>
            </div>
            {quizId === '' ? (
              <p id="crear-codigo-motivo" className="text-sm text-muted">
                {free.length === 0
                  ? 'Todos los quizzes publicados de este libro ya tienen un código activo.'
                  : 'Elige un quiz primero.'}
              </p>
            ) : null}
          </FormSection>

          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          {tokens.isPending ? <SkeletonRows rows={2} /> : null}
          {tokens.isError ? <Alert>{errorMessage(tokens.error)}</Alert> : null}
          {tokens.data && tokens.data.tokens.length === 0 ? (
            <EmptyState
              icon={<AdminIcon name="qr" className="size-7" />}
              title="Este libro todavía no tiene códigos"
            >
              Crea uno arriba para un quiz publicado y descárgalo para imprimirlo.
            </EmptyState>
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
                          <StatusBadge
                            status={token.status === 'active' ? 'active' : 'inactive'}
                            label={token.status === 'active' ? 'Activo' : 'Revocado'}
                          />
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
                          onClick={async () => {
                            const ok = await confirm({
                              title: '¿Crear un código nuevo?',
                              message:
                                'Se crea un código nuevo y el anterior se revoca: ya no desbloquea a nadie. Quienes ya lo usaron conservan el acceso. Tendrás que volver a imprimir el QR.',
                              confirmLabel: 'Crear código nuevo',
                            });
                            if (ok) rotate.mutate(token.id);
                          }}
                        >
                          Rotar
                        </Button>
                        <Button
                          variant="danger-outline"
                          loading={revoke.isPending && revoke.variables === token.id}
                          onClick={async () => {
                            const ok = await confirm({
                              title: '¿Revocar este código?',
                              message:
                                'Nadie podrá desbloquear con él a partir de ahora. Quienes ya lo usaron conservan el acceso.',
                              confirmLabel: 'Revocar',
                              tone: 'danger',
                            });
                            if (ok) revoke.mutate(token.id);
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
