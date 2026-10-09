import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Alert, Card, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { keys, statsApi } from '../api';
import { errorMessage } from '../errors';

function Figure({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card as="div" className="flex flex-col gap-1">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-3xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

/** Estadísticas básicas (solo administradoras): cuántas lectoras hay, cómo avanzan y qué resultados salen. */
export function StatsPage() {
  const stats = useQuery({ queryKey: keys.stats, queryFn: statsApi.get, staleTime: 0 });
  if (stats.isError) return <Alert>{errorMessage(stats.error)}</Alert>;
  if (!stats.data) return <Loading />;
  const data = stats.data;

  return (
    <>
      <PageHeader
        title="Estadísticas"
        subtitle="Sin contar los intentos de prueba de las administradoras."
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Lectoras"
            value={data.readers.total}
            hint={`${data.readers.last7Days} esta semana · ${data.readers.last30Days} este mes · ${data.readers.disabled} desactivadas`}
          />
          <Figure
            label="Quizzes completados"
            value={data.attempts.completed}
            hint={`${data.attempts.inProgress} en curso`}
          />
          <Figure label="Libros terminados" value={data.booksCompleted} />
          <Figure
            label="Mensajes sin atender"
            value={data.unhandledMessages}
            hint={`${data.staff} cuentas de administración`}
          />
        </div>

        <section aria-labelledby="stats-quizzes" className="flex flex-col gap-3">
          <h2 id="stats-quizzes" className="font-semibold">
            Resultados por quiz
          </h2>
          {data.quizzes.length === 0 ? (
            <EmptyState title="Todavía no hay quizzes publicados" />
          ) : null}
          {data.quizzes.map((quiz) => {
            const max = Math.max(1, ...quiz.results.map((result) => result.count));
            return (
              <Card key={quiz.quizId} as="article" className="flex flex-col gap-3">
                <div>
                  <h3 className="font-medium">
                    {quiz.bookTitle ? `${quiz.bookTitle} · ` : ''}Quiz {quiz.order} · {quiz.title}
                  </h3>
                  <p className="text-sm text-muted">
                    {quiz.completedUsers} {quiz.completedUsers === 1 ? 'persona' : 'personas'} ·{' '}
                    {quiz.attempts}{' '}
                    {quiz.attempts === 1 ? 'intento completado' : 'intentos completados'}
                  </p>
                </div>
                {quiz.results.length === 0 ? (
                  <p className="text-sm text-muted">Aún no hay resultados.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {quiz.results.map((result) => (
                      <li key={result.key} className="flex flex-col gap-1">
                        <div className="flex justify-between gap-3 text-sm">
                          <span>{result.title}</span>
                          <span className="text-muted">{result.count}</span>
                        </div>
                        <div className="meter" aria-hidden="true">
                          <div
                            className="meter-fill"
                            style={{ width: `${Math.round((result.count / max) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </section>
      </div>
    </>
  );
}
