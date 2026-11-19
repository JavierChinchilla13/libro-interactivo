import {
  CLOUDINARY_CONSOLE_URL,
  USAGE_ALERT_PERCENT,
  USAGE_WARN_PERCENT,
  formatDecimal,
  type CloudinaryUsage,
} from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../auth/session';
import { cloudinaryUsageApi, keys } from '../api';
import { Skeleton } from './Skeleton';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const TEN_MINUTES = 10 * 60_000;

/** «25» si es redondo y «3,2» si no (coma decimal; nunca «3.2»). */
export function formatCount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : formatDecimal(rounded);
}

/** Bytes en la unidad que se lee mejor: «1,7 GB», «212,1 MB» o «menos de 1 MB». */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${formatCount(bytes / GB)} GB`;
  if (bytes >= MB) return `${formatCount(bytes / MB)} MB`;
  return bytes === 0 ? '0 MB' : 'menos de 1 MB';
}

export type UsageLevel = 'ok' | 'warn' | 'alert';

const share = (part: { bytes: number; limitBytes: number | null } | undefined) =>
  part && part.limitBytes ? (part.bytes / part.limitBytes) * 100 : undefined;

/** El más alto de los porcentajes que Cloudinary permite saber (créditos y, si hay tope, almacenamiento y ancho de banda). */
export function usagePercent(usage: CloudinaryUsage): number | undefined {
  const values = [usage.credits?.percent, share(usage.storage), share(usage.bandwidth)].filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  return values.length ? Math.max(...values) : undefined;
}

export function usageLevel(percent: number | undefined): UsageLevel {
  if (percent === undefined) return 'ok';
  if (percent >= USAGE_ALERT_PERCENT) return 'alert';
  if (percent >= USAGE_WARN_PERCENT) return 'warn';
  return 'ok';
}

function ConsoleLink() {
  return (
    <a
      href={CLOUDINARY_CONSOLE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="admin-usage-link"
    >
      Ver el uso o ampliar el plan en Cloudinary
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

function Details({ usage }: { usage: CloudinaryUsage }) {
  const percent = usagePercent(usage);
  const level = usageLevel(percent);
  // Barra principal: los créditos del mes; si el plan no los tiene, el almacenamiento con tope.
  const bar = usage.credits
    ? {
        value: usage.credits.percent,
        text: `Cloudinary: ${formatCount(usage.credits.used)} de ${formatCount(usage.credits.limit)} créditos este mes (${Math.round(usage.credits.percent)} %)`,
      }
    : share(usage.storage) !== undefined
      ? {
          value: share(usage.storage) as number,
          text: `Cloudinary: ${formatBytes(usage.storage!.bytes)} de ${formatBytes(usage.storage!.limitBytes!)} de almacenamiento (${Math.round(share(usage.storage) as number)} %)`,
        }
      : null;
  const storage = usage.storage
    ? `Almacenamiento: ${formatBytes(usage.storage.bytes)}${usage.storage.limitBytes ? ` de ${formatBytes(usage.storage.limitBytes)}` : ''}`
    : null;
  const bandwidth = usage.bandwidth
    ? `Ancho de banda este mes: ${formatBytes(usage.bandwidth.bytes)}${usage.bandwidth.limitBytes ? ` de ${formatBytes(usage.bandwidth.limitBytes)}` : ''}`
    : null;

  return (
    <>
      {bar ? (
        <>
          <p className="admin-usage-main">{bar.text}</p>
          <div
            className="admin-usage-bar"
            data-level={level}
            role="progressbar"
            aria-label="Uso del plan de Cloudinary"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(bar.value))}
            aria-valuetext={bar.text}
          >
            <span style={{ width: `${Math.min(100, Math.max(bar.value, 0.5))}%` }} />
          </div>
        </>
      ) : null}
      {level !== 'ok' ? (
        <p className="admin-usage-note" data-level={level}>
          {level === 'alert'
            ? 'Casi agotado: Cloudinary podría rechazar archivos nuevos. Revisa el plan o libera espacio.'
            : `Atención: ya usaste más del ${USAGE_WARN_PERCENT} % del plan de este mes.`}
        </p>
      ) : null}
      {storage ? <p className="admin-usage-line">{storage}</p> : null}
      {bandwidth ? <p className="admin-usage-line">{bandwidth}</p> : null}
      {usage.plan ? <p className="admin-usage-line">Plan {usage.plan}</p> : null}
    </>
  );
}

/**
 * Cuánto lleva usado la cuenta de Cloudinary. Solo para administradores (el editor no lo ve ni lo pide). Todo viene
 * de Cloudinary; sin datos (error, sin credenciales o plan que no informa) solo queda el enlace a su consola.
 * `full` es la sección del inicio; `compact` es la línea discreta de las pantallas donde se suben archivos.
 */
export function CloudinaryUsagePanel({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const session = useSession();
  const isAdmin = session.data?.role === 'ADMIN';
  const usage = useQuery({
    queryKey: keys.cloudinaryUsage,
    queryFn: cloudinaryUsageApi.get,
    enabled: isAdmin,
    staleTime: TEN_MINUTES,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!isAdmin) return null;

  const data = usage.data?.available ? usage.data : undefined;
  const body = usage.isPending ? (
    <div role="status" aria-busy="true" aria-label="Consultando el uso de Cloudinary">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2 h-2 w-full rounded-full" />
    </div>
  ) : (
    <div role="status" className="admin-usage-body">
      {data ? <Details usage={data} /> : null}
      <ConsoleLink />
    </div>
  );

  if (variant === 'compact') return <div className="admin-usage admin-usage--compact">{body}</div>;
  return (
    <section aria-labelledby="home-cloudinary">
      <h2 id="home-cloudinary" className="admin-h2">
        Espacio en Cloudinary
      </h2>
      <div className="admin-card admin-usage">{body}</div>
    </section>
  );
}
