import type { ReactNode } from 'react';
import { SafeHtml } from '../../shared/ui/SafeHtml';

/**
 * Cuerpo del mensaje de bienvenida: título y texto con la letra de lectura, interlineado amplio y aire entre
 * párrafos. Lo usan el modal de la lectora y la vista previa del editor, para que la autora vea lo mismo.
 */
export function WelcomeContent({
  title,
  bodyHtml,
  titleId,
  actions,
}: {
  title?: string;
  bodyHtml: string;
  /** Id del título (el modal lo usa como `aria-labelledby`). */
  titleId?: string;
  /** Botón de cierre (en la vista previa del editor no hay). */
  actions?: ReactNode;
}) {
  return (
    <div className="welcome-content">
      <h2 id={titleId} className="section-title welcome-title">
        {title ?? 'Bienvenida'}
      </h2>
      <SafeHtml html={bodyHtml} className="welcome-body" />
      {actions ? <div className="welcome-actions">{actions}</div> : null}
    </div>
  );
}
