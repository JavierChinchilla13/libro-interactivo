import { useState } from 'react';
import { Link } from 'react-router';
import { AdminIcon, type AdminIconName } from '../../shared/ui/adminIcons';
import { Alert, EmptyState, PageHeader } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { Skeleton } from './components/Skeleton';
import { useAdminOverview } from './overview';

const HIDE_KEY = 'admin-primeros-pasos-ocultos';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function greeting(now: Date, name: string | undefined) {
  const hour = now.getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}` : hello;
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function untilLabel(days: number): string {
  if (days === 0) return 'sale hoy';
  if (days === 1) return 'sale mañana';
  return `sale en ${days} días`;
}

interface Attention {
  id: string;
  to: string;
  icon: AdminIconName;
  text: string;
}

interface Step {
  id: string;
  label: string;
  hint: string;
  to: string;
  done: boolean;
}

/** Inicio de la administración: qué necesita atención, qué hacer hoy, números y primeros pasos. */
export function AdminHomePage() {
  const session = useSession();
  const role = session.data?.role;
  const isAdmin = role === 'ADMIN';
  const [now] = useState(() => new Date());
  const [hidden, setHidden] = useState(readHidden);
  const overview = useAdminOverview(role, now);
  const { books, quizzes, stats, upcoming } = overview;

  const attention: Attention[] = [];
  if (overview.unhandledMessages)
    attention.push({
      id: 'mensajes',
      to: '/admin/mensajes',
      icon: 'mail',
      text: plural(overview.unhandledMessages, 'mensaje sin atender', 'mensajes sin atender'),
    });
  if (quizzes.withChanges)
    attention.push({
      id: 'cambios',
      to: '/admin/quizzes',
      icon: 'quiz',
      text: `${plural(quizzes.withChanges, 'quiz', 'quizzes')} con cambios sin publicar`,
    });
  if (quizzes.drafts)
    attention.push({
      id: 'quizzes-borrador',
      to: '/admin/quizzes',
      icon: 'quiz',
      text: `${plural(quizzes.drafts, 'quiz', 'quizzes')} en borrador`,
    });
  if (overview.fanArtDrafts)
    attention.push({
      id: 'fan-arts',
      to: '/admin/fan-arts',
      icon: 'art',
      text: `${plural(overview.fanArtDrafts, 'fan art', 'fan arts')} en borrador`,
    });
  if (overview.postDrafts)
    attention.push({
      id: 'posts',
      to: '/admin/actualizaciones',
      icon: 'news',
      text: `${plural(overview.postDrafts, 'actualización', 'actualizaciones')} en borrador`,
    });
  if (upcoming)
    attention.push({
      id: 'lanzamiento',
      to: `/admin/libros/${upcoming.id}`,
      icon: 'book',
      text: `${upcoming.title} ${untilLabel(upcoming.days)}`,
    });

  const attentionReady =
    !overview.loading &&
    quizzes.ready &&
    overview.fanArtDrafts !== undefined &&
    overview.postDrafts !== undefined &&
    (!isAdmin || overview.unhandledMessages !== undefined);

  const steps: Step[] = [
    {
      id: 'libro',
      label: 'Crea tu primer libro',
      hint: 'Título, sinopsis y portada.',
      to: '/admin/libros/nuevo',
      done: books.total > 0,
    },
    {
      id: 'quiz',
      label: 'Crea un quiz',
      hint: 'Las preguntas y los resultados que descubre la lectora.',
      to: '/admin/quizzes/nuevo',
      done: quizzes.total > 0,
    },
    {
      id: 'publicar',
      label: 'Publica el quiz',
      hint: 'Hasta entonces las lectoras no lo ven.',
      to: '/admin/quizzes',
      done: quizzes.published > 0,
    },
    ...(isAdmin
      ? [
          {
            id: 'qr',
            label: 'Genera el código QR',
            hint: 'Para imprimirlo en el libro y desbloquear el quiz.',
            to: '/admin/qr',
            done: (overview.tokenCount ?? 0) > 0,
          },
        ]
      : []),
    {
      id: 'portada',
      label: 'Sube las imágenes de la portada',
      hint: 'Entre 5 y 9 para la rejilla de la página principal.',
      to: '/admin/sitio',
      done: (overview.headerImages ?? 0) >= 5,
    },
  ];
  const doneSteps = steps.filter((step) => step.done).length;
  const stepsReady = !overview.loading && quizzes.ready && overview.headerImages !== undefined;
  const showSteps = stepsReady && !hidden && doneSteps < steps.length;
  const stepsFirst = doneSteps < 3;

  const firstSteps = showSteps ? (
    <section aria-labelledby="home-steps" className="admin-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="home-steps" className="text-lg font-semibold">
            Primeros pasos
          </h2>
          <p className="text-sm text-muted">
            {doneSteps} de {steps.length} listos. Se marcan solos a medida que avanzas.
          </p>
        </div>
        <button
          type="button"
          className="admin-text-btn"
          onClick={() => {
            try {
              window.localStorage.setItem(HIDE_KEY, '1');
            } catch {
              /* sin almacenamiento: se oculta solo mientras la página está abierta */
            }
            setHidden(true);
          }}
        >
          Ocultar
        </button>
      </div>
      <ol className="admin-steps">
        {steps.map((step) => (
          <li key={step.id} data-done={step.done}>
            <span className="admin-step-mark" aria-hidden="true">
              {step.done ? <AdminIcon name="check" className="size-4" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="admin-step-title">
                {step.done ? (
                  <>
                    {step.label}
                    <span className="sr-only"> (hecho)</span>
                  </>
                ) : (
                  <Link to={step.to}>{step.label}</Link>
                )}
              </span>
              {step.done ? null : <span className="block text-sm text-muted">{step.hint}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  ) : null;

  const actions: {
    to: string;
    icon: AdminIconName;
    title: string;
    text: string;
    admin?: boolean;
  }[] = [
    {
      to: '/admin/libros/nuevo',
      icon: 'book',
      title: 'Nuevo libro',
      text: 'Agrega otro libro de la saga.',
    },
    {
      to: '/admin/quizzes/nuevo',
      icon: 'quiz',
      title: 'Nuevo quiz',
      text: 'Preguntas y resultados para un libro.',
    },
    {
      to: '/admin/wiki/nueva?tipo=character',
      icon: 'wiki',
      title: 'Subir personaje',
      text: 'Una ficha nueva para la wiki.',
    },
    {
      to: '/admin/actualizaciones/nueva',
      icon: 'news',
      title: 'Nueva actualización',
      text: 'Una noticia o aviso para las lectoras.',
    },
    {
      to: '/admin/qr',
      icon: 'qr',
      title: 'Ver códigos QR',
      text: 'Descárgalos para imprimir.',
      admin: true,
    },
  ];

  if (overview.failed) {
    return (
      <>
        <PageHeader title={greeting(now, session.data?.name)} />
        <Alert title="No pudimos cargar el inicio">
          <p className="mt-1">Revisa tu conexión e inténtalo de nuevo.</p>
          <button type="button" className="btn btn-secondary mt-3" onClick={overview.refetch}>
            Reintentar
          </button>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={greeting(now, session.data?.name)}
        subtitle="Esto es lo que hay hoy en Universo Memorias."
      />

      <div className="flex flex-col gap-8">
        {stepsFirst ? firstSteps : null}

        <section aria-labelledby="home-attention">
          <h2 id="home-attention" className="admin-h2">
            Qué necesita tu atención
          </h2>
          {!attentionReady ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="Cargando"
              className="flex flex-col gap-2"
            >
              <Skeleton className="h-14 w-full rounded-token-md" />
              <Skeleton className="h-14 w-full rounded-token-md" />
            </div>
          ) : attention.length === 0 && overview.partialFailure ? (
            <Alert tone="warning" title="No pudimos revisar todo">
              <p className="mt-1">
                Algunas cosas no cargaron, así que no podemos decir que esté todo al día.
              </p>
              <button
                type="button"
                className="btn btn-secondary mt-3"
                onClick={overview.refetchAll}
              >
                Reintentar
              </button>
            </Alert>
          ) : attention.length === 0 ? (
            <EmptyState icon={<AdminIcon name="check" className="size-7" />} title="Todo al día">
              No hay nada pendiente por revisar.
            </EmptyState>
          ) : (
            <ul className="admin-attn">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link to={item.to} data-kind={item.id === 'lanzamiento' ? 'info' : 'task'}>
                    <AdminIcon name={item.icon} />
                    <span className="min-w-0 flex-1">{item.text}</span>
                    <AdminIcon name="chevron" className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="home-actions">
          <h2 id="home-actions" className="admin-h2">
            ¿Qué quieres hacer hoy?
          </h2>
          <ul className="admin-actions">
            {actions
              .filter((action) => !action.admin || isAdmin)
              .map((action) => (
                <li key={action.to}>
                  <Link to={action.to} className="surface card-link">
                    <span className="admin-action-icon">
                      <AdminIcon name={action.icon} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{action.title}</span>
                      <span className="block text-sm text-muted">{action.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>

        <section aria-labelledby="home-numbers">
          <h2 id="home-numbers" className="admin-h2">
            Resumen en números
          </h2>
          <dl className="admin-stats">
            <div className="admin-stat">
              <dt>Libros publicados</dt>
              <dd data-testid="stat-published-books">{overview.loading ? '—' : books.published}</dd>
              <p>{overview.loading ? ' ' : `de ${books.total} en total`}</p>
            </div>
            <div className="admin-stat">
              <dt>Quizzes publicados</dt>
              <dd>{quizzes.ready ? quizzes.published : '—'}</dd>
              <p>{quizzes.ready ? `de ${quizzes.total} sin contar los archivados` : ' '}</p>
            </div>
            {isAdmin ? (
              <>
                <div className="admin-stat">
                  <dt>Lectoras</dt>
                  <dd>{stats ? stats.readers.total : '—'}</dd>
                  <p>{stats ? `${stats.readers.last7Days} nuevas en 7 días` : ' '}</p>
                </div>
                <div className="admin-stat">
                  <dt>Quizzes completados</dt>
                  <dd>{stats ? stats.attempts.completed : '—'}</dd>
                  <p>{stats ? 'No cuenta las pruebas del equipo' : ' '}</p>
                </div>
              </>
            ) : null}
          </dl>
        </section>

        {stepsFirst ? null : firstSteps}
      </div>
    </>
  );
}
