import { plural, pluralWord } from '@libro/shared';
import type { NotificationJob, NotificationPreview } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert, PageHeader } from '../../../shared/ui/layout';
import { keys, notificationsApi } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { DataList, type Column } from '../components/DataList';
import { SkeletonRows } from '../components/Skeleton';
import { StatusBadge, type AdminStatus } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { errorMessage } from '../errors';

/** Mientras haya un aviso en marcha, la lista se refresca sola cada tanto. */
const REFRESH_MS = 15_000;

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

const active = (job: NotificationJob) => job.status === 'queued' || job.status === 'sending';
const isFuture = (iso: string | undefined) => iso !== undefined && Date.parse(iso) > Date.now();

/** El estado en palabras: «En cola», «Enviando», «En pausa hasta…», «Terminado»… */
function statusOf(job: NotificationJob): { status: AdminStatus; label: string } {
  if (active(job) && isFuture(job.pausedUntil)) return { status: 'pending', label: 'En pausa' };
  if (active(job) && isFuture(job.notBefore)) return { status: 'scheduled', label: 'Programado' };
  switch (job.status) {
    case 'queued':
      return { status: 'scheduled', label: 'En cola' };
    case 'sending':
      return { status: 'scheduled', label: 'Enviando' };
    case 'done':
      return { status: 'published', label: 'Terminado' };
    case 'cancelled':
      return { status: 'inactive', label: 'Cancelado' };
    case 'failed':
      return { status: 'failed', label: 'Con problemas' };
  }
}

/** Una línea que explica qué espera un aviso en pausa o programado. */
function waitNote(job: NotificationJob): string | null {
  if (!active(job)) return null;
  if (isFuture(job.notBefore)) return `Sale desde el ${when(job.notBefore)}.`;
  if (job.pausedUntil && isFuture(job.pausedUntil))
    return `Se acabó el cupo de correos: sigue solo el ${when(job.pausedUntil)}.`;
  return null;
}

function Progress({ job }: { job: NotificationJob }) {
  const { recipients, sent, skipped, failed } = job.totals;
  const done = sent + skipped + failed;
  const share = recipients === 0 ? 1 : done / recipients;
  return (
    <div className="flex min-w-[10rem] flex-col gap-1.5">
      <p className="text-sm tabular-nums">
        {sent} de {recipients} {pluralWord(recipients, 'enviado', 'enviados')}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={recipients}
        aria-valuenow={done}
        aria-label={`Avance de «${job.subject}»`}
        className="meter"
      >
        <div className="meter-fill" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      {skipped > 0 || failed > 0 ? (
        <p className="text-xs text-muted tabular-nums">
          {skipped > 0 ? `${skipped} sin enviar (se dieron de baja o cerraron la cuenta)` : null}
          {skipped > 0 && failed > 0 ? ' · ' : null}
          {failed > 0 ? `${failed} rechazados por el servicio de correo` : null}
        </p>
      ) : null}
    </div>
  );
}

/** Cupo de hoy y del mes, y cuántos lectores están apuntados ahora. */
function QuotaSummary({ preview }: { preview: NotificationPreview }) {
  const { quota } = preview;
  const items = [
    { label: 'Apuntados a las novedades', value: preview.recipients },
    { label: 'Correos para avisos hoy', value: quota.todayLeft },
    { label: 'Correos para avisos este mes', value: quota.monthLeft },
  ];
  return (
    <section aria-labelledby="quota-title" className="admin-card flex flex-col gap-3">
      <h2 id="quota-title" className="text-base font-semibold">
        Cupo de correos
      </h2>
      <dl className="admin-stats grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {item.value.toLocaleString('es-CR')}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-pretty text-muted">
        El plan gratuito permite {quota.dailyLimit} correos al día y {quota.monthlyLimit} al mes. Se
        guardan {quota.reserve} al día para los correos de la cuenta (recuperar la contraseña,
        confirmar el correo, contacto). Si un aviso no cabe hoy, sigue solo al día siguiente; el día
        cambia a las 6:00 p. m. de Costa Rica.
      </p>
    </section>
  );
}

/**
 * Avisos por correo (solo administradores): cada actualización o capítulo extra que se avisó, cómo va el envío y
 * la opción de cancelar lo que falta. Los avisos se piden desde el formulario de cada publicación.
 */
export function NotificationsPage() {
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({
    queryKey: keys.notifications,
    queryFn: notificationsApi.list,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.jobs.some(active) ? REFRESH_MS : false),
  });
  const quota = useQuery({
    queryKey: keys.notificationPreview('post'),
    queryFn: () => notificationsApi.preview({ kind: 'post' }),
    staleTime: 0,
    refetchInterval: list.data?.jobs.some(active) ? REFRESH_MS : false,
  });
  const cancel = useMutation({
    mutationFn: notificationsApi.cancel,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.notifications });
      toast.success('Aviso cancelado. Lo que faltaba ya no se enviará.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  async function askCancel(job: NotificationJob) {
    const pending = job.totals.pending;
    const ok = await confirm({
      title: `¿Cancelar el aviso «${job.subject}»?`,
      message: `${pluralWord(pending, 'Falta', 'Faltan')} ${plural(pending, 'correo', 'correos')} por enviar y ya no saldrán. Lo enviado no se puede deshacer, y esta publicación no se podrá volver a avisar.`,
      confirmLabel: 'Cancelar el aviso',
      cancelLabel: 'Seguir enviando',
      tone: 'danger',
    });
    if (ok) cancel.mutate(job.id);
  }

  const columns: Column<NotificationJob>[] = [
    {
      id: 'subject',
      header: 'Aviso',
      role: 'title',
      cell: (job) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium [overflow-wrap:anywhere]">{job.subject}</span>
          <span className="text-xs text-muted">
            {job.kind === 'post' ? 'Actualización' : 'Capítulo extra'} · {when(job.createdAt)}
            {job.createdBy ? ` · ${job.createdBy.name}` : ''}
          </span>
          {waitNote(job) ? <span className="text-xs text-muted">{waitNote(job)}</span> : null}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      role: 'status',
      cell: (job) => {
        const { status, label } = statusOf(job);
        return <StatusBadge status={status} label={label} />;
      },
    },
    {
      id: 'progress',
      header: 'Avance',
      role: 'meta',
      cell: (job) => (
        <div className="flex flex-col items-start gap-2">
          <Progress job={job} />
          {active(job) ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={cancel.isPending}
              onClick={() => void askCancel(job)}
            >
              Cancelar <span className="sr-only">el aviso «{job.subject}»</span>
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const jobs = list.data?.jobs ?? [];

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Avisos por correo"
        subtitle="Los correos a los lectores apuntados a las novedades: cómo va cada envío."
      />

      {quota.data ? <QuotaSummary preview={quota.data} /> : null}

      {list.isError ? (
        <Alert title="No pudimos cargar los avisos">
          <p className="mt-1">{errorMessage(list.error)}</p>
        </Alert>
      ) : !list.data ? (
        <SkeletonRows rows={3} />
      ) : jobs.length === 0 ? (
        <section className="admin-card flex flex-col gap-2 text-sm">
          <h2 className="text-base font-semibold">Todavía no se envió ningún aviso</h2>
          <p className="text-pretty text-muted">
            Al publicar una{' '}
            <Link to="/admin/actualizaciones" className="underline underline-offset-2">
              actualización
            </Link>{' '}
            o un{' '}
            <Link to="/admin/extras" className="underline underline-offset-2">
              capítulo extra
            </Link>
            , marca «Avisar por correo» y el envío aparecerá aquí.
          </p>
        </section>
      ) : (
        <DataList
          label="Avisos por correo"
          rows={jobs}
          rowKey={(job) => job.id}
          columns={columns}
        />
      )}
    </div>
  );
}
