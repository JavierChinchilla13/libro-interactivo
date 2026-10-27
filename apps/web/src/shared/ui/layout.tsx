import type { ReactNode } from 'react';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-alt text-text ring-1 ring-line',
  primary: 'bg-primary/15 text-primary ring-1 ring-primary/30',
  success: 'bg-success/15 text-success ring-1 ring-success/30',
  warning: 'bg-warning/15 text-warning ring-1 ring-warning/30',
  danger: 'bg-danger/15 text-danger ring-1 ring-danger/30',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={`surface rounded-token-lg p-4 sm:p-5 ${className}`}>{children}</Tag>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="fade-up mb-7 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 max-w-full flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'danger',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const border =
    tone === 'success' ? 'border-success' : tone === 'warning' ? 'border-warning' : 'border-danger';
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-token-lg border border-l-4 border-line ${border} bg-surface-alt p-3.5 text-sm`}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  /** Un icono propio (decorativo) en lugar del punto neutro; los vacíos de la administración lo usan. */
  icon?: ReactNode;
  /** Una salida (enlace o botón) para que la persona no se quede en un callejón. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-token-md bg-surface p-8 text-center">
      {icon ? (
        <span aria-hidden="true" className="mb-4 text-muted">
          {icon}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="mb-4 size-3.5 rounded-full border-2 border-unlit bg-surface"
        />
      )}
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm text-muted">
      {label}
    </p>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
}

/** Pestañas accesibles (rol tablist/tab). El contenido lo pinta quien las usa. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={`-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors duration-(--token-dur-fast) ease-token-out ${
            tab.id === active
              ? 'border-primary text-text'
              : 'border-transparent text-muted hover:text-text'
          }`}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
