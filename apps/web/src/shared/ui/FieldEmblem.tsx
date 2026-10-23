import type { FieldVisualKey } from '@libro/shared';

/**
 * «Tu campo»: emblema estático (solo CSS, sin lienzo) del campo de poder del resultado de la lectora. Es el mismo dato
 * que ella ya ve en su resultado (clave visual y nombre); nunca el `fieldSlug` ni nada del cuerpo de la ficha. El
 * significado va en texto, no solo en color.
 */
export function FieldEmblem({
  visual,
  className = '',
}: {
  visual: { key: FieldVisualKey; fieldName: string };
  className?: string;
}) {
  return (
    <p className={`field-emblem ${className}`} data-key={visual.key}>
      <span className="field-emblem-orb" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="label">Tu campo</span>
        <span className="font-semibold [overflow-wrap:anywhere]">{visual.fieldName}</span>
      </span>
    </p>
  );
}
