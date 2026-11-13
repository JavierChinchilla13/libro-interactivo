/**
 * Etiqueta de estado única de la administración: un punto de color más el texto (el color nunca es el único canal).
 * Un estado nuevo = una entrada nueva aquí. Las etiquetas por defecto van en masculino (libro, quiz, código, usuario,
 * mensaje, aviso, extra, fan art): cuando el sujeto es femenino (carta, actualización, reseña, entrada de la wiki,
 * versión) la pantalla pasa su propia `label` («Publicada», «Archivada»…).
 */
const STATUSES = {
  published: { label: 'Publicado', tone: 'success' },
  draft: { label: 'Borrador', tone: 'neutral' },
  archived: { label: 'Archivado', tone: 'neutral' },
  scheduled: { label: 'Programado', tone: 'primary' },
  soon: { label: 'Próximamente', tone: 'primary' },
  pending: { label: 'Por aprobar', tone: 'warning' },
  changes: { label: 'Cambios sin publicar', tone: 'warning' },
  unread: { label: 'Sin leer', tone: 'warning' },
  read: { label: 'Leído', tone: 'neutral' },
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Desactivado', tone: 'neutral' },
  failed: { label: 'Con problemas', tone: 'danger' },
} as const;

export type AdminStatus = keyof typeof STATUSES;

export function StatusBadge({ status, label }: { status: AdminStatus; label?: string }) {
  const def = STATUSES[status];
  return (
    <span className="admin-status" data-tone={def.tone}>
      <span aria-hidden="true" className="admin-status-dot" />
      {label ?? def.label}
    </span>
  );
}
