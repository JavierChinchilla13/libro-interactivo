import type { ReactNode } from 'react';
import { AdminIcon } from '../../../shared/ui/adminIcons';

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
  /** Acciones extra a la izquierda del botón de guardar (Vista previa, Revisar…). */
  children?: ReactNode;
}) {
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
