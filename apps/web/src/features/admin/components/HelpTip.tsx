import type { ReactNode } from 'react';
import { AdminIcon } from '../../../shared/ui/adminIcons';

/** Ayuda en contexto: «¿Qué es esto?» que se despliega con 2 a 4 líneas, cerrada por defecto (`<details>` nativo). */
export function HelpTip({
  title = '¿Qué es esto?',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="admin-help">
      <summary>
        <AdminIcon name="info" className="size-4" />
        <span>{title}</span>
      </summary>
      <div className="admin-help-body">{children}</div>
    </details>
  );
}
