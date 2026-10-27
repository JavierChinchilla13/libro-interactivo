import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AdminIcon } from '../../../shared/ui/adminIcons';
import { useMediaQuery } from './useMediaQuery';

/** Una acción del menú «Más» de la barra en celular. */
export interface SaveBarItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

/** Menú «Más» (se abre hacia arriba, sobre la barra): cierra con Escape, al elegir o al tocar fuera. */
function MoreMenu({ items, note }: { items: readonly SaveBarItem[]; note?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="admin-more">
      <button
        ref={trigger}
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        Más
        <AdminIcon name="chevron" className="size-4 -rotate-90" />
      </button>
      {open ? (
        <div id={id} role="group" aria-label="Más acciones" className="admin-more-menu">
          {note ? <p className="admin-more-note">{note}</p> : null}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Barra de guardado fija al pie del formulario: dice si hay cambios, deja guardar o descartar y no se pierde al
 * desplazar. En celular queda sobre el área segura. Pensada para ir como último hijo de un contenedor alto.
 */
export function SaveBar({
  dirty,
  saving = false,
  error,
  onSave,
  onDiscard,
  saveLabel = 'Guardar cambios',
  savingLabel = 'Guardando…',
  savedLabel = 'Todo guardado',
  dirtyLabel = 'Tienes cambios sin guardar',
  disabledReason,
  saveVariant = 'primary',
  after,
  moreItems,
  children,
}: {
  dirty: boolean;
  saving?: boolean;
  /** Mensaje de error ya en lenguaje humano; si existe, tiene prioridad sobre el estado. */
  error?: string | null;
  onSave: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  savingLabel?: string;
  savedLabel?: string;
  dirtyLabel?: string;
  /** Por qué no se puede guardar (se muestra junto al botón, que queda deshabilitado). */
  disabledReason?: string;
  /** `secondary` cuando la acción principal de la pantalla es otra (por ejemplo «Publicar»). */
  saveVariant?: 'primary' | 'secondary';
  /** Acciones a la derecha del botón de guardar (la principal, como «Publicar»). */
  after?: ReactNode;
  /** En celular, estas acciones se juntan en un menú «Más» y la barra queda en una sola fila (con `after`). */
  moreItems?: readonly SaveBarItem[];
  /** Acciones extra a la izquierda del botón de guardar (Vista previa, Revisar…). */
  children?: ReactNode;
}) {
  const narrow = useMediaQuery('(max-width: 639.98px)', false);
  const blocked = Boolean(disabledReason);
  let status = savedLabel;
  let tone: 'ok' | 'dirty' | 'error' | 'busy' = 'ok';
  if (error) {
    status = error;
    tone = 'error';
  } else if (saving) {
    status = savingLabel;
    tone = 'busy';
  } else if (dirty) {
    status = dirtyLabel;
    tone = 'dirty';
  }

  if (narrow && moreItems) {
    const short =
      tone === 'error'
        ? 'No se guardó'
        : tone === 'dirty'
          ? 'Sin guardar'
          : tone === 'busy'
            ? status
            : null;
    return (
      <div className="admin-savebar admin-savebar-narrow" data-tone={tone}>
        <p role={tone === 'error' ? 'alert' : 'status'} className="admin-savebar-status">
          <AdminIcon
            name={tone === 'error' ? 'warning' : tone === 'ok' ? 'check' : 'info'}
            className="size-4"
          />
          <span className={short ? 'min-w-0' : 'sr-only'}>{short ?? status}</span>
          {short && tone === 'error' ? <span className="sr-only">: {status}</span> : null}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <MoreMenu items={moreItems} note={disabledReason} />
          {/* Guardar es lo más frecuente: con cambios se ve a mano, sin abrir «Más». */}
          {dirty && !saving && !blocked ? (
            <button type="button" className="btn btn-secondary" onClick={onSave}>
              Guardar
            </button>
          ) : null}
          {after}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-savebar" data-tone={tone}>
      <p role={tone === 'error' ? 'alert' : 'status'} className="admin-savebar-status">
        <AdminIcon
          name={tone === 'error' ? 'warning' : tone === 'ok' ? 'check' : 'info'}
          className="size-4"
        />
        <span className="min-w-0">{status}</span>
      </p>
      {disabledReason ? (
        <p className="w-full text-xs text-muted sm:w-auto">{disabledReason}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {children}
        {onDiscard ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!dirty || saving}
            onClick={onDiscard}
          >
            Descartar
          </button>
        ) : null}
        <button
          type="button"
          className={`btn ${saveVariant === 'primary' ? 'btn-primary' : 'btn-secondary'}`}
          disabled={!dirty || saving || blocked}
          onClick={onSave}
        >
          {saving ? savingLabel : saveLabel}
        </button>
        {after}
      </div>
    </div>
  );
}
