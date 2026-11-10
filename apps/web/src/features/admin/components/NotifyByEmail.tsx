import type { NotificationKind, NotificationPreview } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { CheckField } from '../../../shared/ui/controls';
import { useSession } from '../../auth/session';
import { keys, notificationsApi } from '../api';
import { errorMessage } from '../errors';
import { FormSection } from './FormSection';

const num = (n: number) => n.toLocaleString('es-CR');
const count = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'long', timeStyle: 'short' });

/** «Saldría hoy» / «tardaría unos 3 días» según el cupo que queda. */
function timing(preview: NotificationPreview): string {
  if (preview.estimatedDays <= 1) return 'Con el cupo de hoy alcanza para enviarlo todo hoy.';
  return `Con el cupo que queda tardaría unos ${preview.estimatedDays} días en salir todo (sigue solo cada día).`;
}

/** El resumen de a quién llega y cuánto cupo queda, en frases cortas. */
function Summary({ kind, preview }: { kind: NotificationKind; preview: NotificationPreview }) {
  const { quota } = preview;
  const who =
    kind === 'extra'
      ? 'apuntadas a las novedades que ya terminaron este libro'
      : 'apuntadas a las novedades';
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-pretty text-muted">
      <li>
        Lo recibirían{' '}
        <strong className="tabular-nums">{count(preview.recipients, 'lectora', 'lectoras')}</strong>{' '}
        {who}.
      </li>
      <li>
        Quedan <span className="tabular-nums">{num(quota.todayLeft)}</span> correos para avisos hoy
        y <span className="tabular-nums">{num(quota.monthLeft)}</span> este mes (el plan permite{' '}
        {num(quota.dailyLimit)} al día y {num(quota.monthlyLimit)} al mes; se guardan{' '}
        {quota.reserve} al día para los correos de la cuenta, como recuperar la contraseña).
      </li>
      {preview.recipients > 0 ? <li>{timing(preview)}</li> : null}
    </ul>
  );
}

/**
 * Casilla «Avisar por correo» de una actualización o un capítulo extra (solo administradoras; el servidor también lo
 * exige). No guarda nada por sí sola: el formulario pide el aviso después de guardar con estado «Publicado». Cada
 * elemento se avisa una sola vez; si ya se avisó, muestra cómo va.
 */
export function NotifyByEmail({
  kind,
  refId,
  bookId,
  published,
  scheduledFor,
  checked,
  onChange,
}: {
  kind: NotificationKind;
  /** Sin `refId`, aún no se guardó. */
  refId?: string;
  /** De un extra: el libro (solo lo reciben las que lo terminaron). */
  bookId?: string;
  /** ¿El formulario está en «Publicado»? (si no, se avisa al publicar). */
  published: boolean;
  /** Fecha futura de una actualización programada: los correos no salen antes. */
  scheduledFor?: Date;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const session = useSession();
  const [now] = useState(() => Date.now());
  const isAdmin = session.data?.role === 'ADMIN';
  const needsBook = kind === 'extra' && !bookId;
  const preview = useQuery({
    queryKey: keys.notificationPreview(kind, refId, bookId),
    queryFn: () => notificationsApi.preview({ kind, refId, bookId }),
    enabled: isAdmin && !needsBook,
    staleTime: 0,
    retry: false,
  });
  if (!isAdmin) return null;

  const existing = preview.data?.existing ?? null;
  const title = 'Aviso por correo';
  if (existing) {
    const done = existing.totals.sent + existing.totals.skipped + existing.totals.failed;
    return (
      <FormSection title={title}>
        <p className="text-sm text-pretty">
          Ya se avisó por correo ({when(existing.createdAt)}): {done} de{' '}
          {count(existing.totals.recipients, 'lectora', 'lectoras')} procesadas,{' '}
          {existing.totals.sent} enviados. Cada publicación se avisa una sola vez.{' '}
          <Link to="/admin/avisos" className="underline underline-offset-2">
            Ver avisos por correo
          </Link>
        </p>
      </FormSection>
    );
  }

  const nobody = preview.data !== undefined && preview.data.recipients === 0;
  const hint = needsBook
    ? 'Elige el libro para saber a quién le llegaría.'
    : nobody
      ? 'Ahora no hay lectoras apuntadas que lo puedan recibir: no se enviaría nada.'
      : published
        ? 'Se pide al guardar. Sale de a poco, según el cupo de correos del día.'
        : 'Se envía al publicar. Si solo guardas el borrador, todavía no se avisa.';
  const future = scheduledFor && scheduledFor.getTime() > now ? scheduledFor : null;

  return (
    <FormSection title={title}>
      <CheckField
        label="Avisar por correo a las lectoras apuntadas a las novedades"
        hint={hint}
        checked={checked && !nobody && !needsBook}
        disabled={nobody || needsBook || preview.isError}
        onChange={onChange}
      />
      {future ? (
        <p className="text-sm text-muted">
          Está programada: los correos salen desde el {when(future.toISOString())}.
        </p>
      ) : null}
      {preview.isError ? (
        <p className="text-sm text-danger" role="alert">
          No pudimos calcular el cupo: {errorMessage(preview.error)}
        </p>
      ) : preview.data ? (
        <Summary kind={kind} preview={preview.data} />
      ) : needsBook ? null : (
        <p className="text-sm text-muted">Calculando a quién le llegaría…</p>
      )}
    </FormSection>
  );
}
