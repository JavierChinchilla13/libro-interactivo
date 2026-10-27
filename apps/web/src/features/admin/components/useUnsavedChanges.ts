import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { useConfirm } from './ConfirmDialog';

/**
 * Avisa antes de perder cambios sin guardar: al cerrar o recargar la pestaña (aviso del navegador) y al ir a otra
 * pantalla dentro de la app (cuadro propio con «Seguir editando» / «Salir sin guardar»).
 */
export function useUnsavedChanges(dirty: boolean) {
  const confirm = useConfirm();
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let alive = true;
    void confirm({
      title: 'Hay cambios sin guardar',
      message: 'Si sales ahora, se pierde lo que cambiaste en esta pantalla.',
      confirmLabel: 'Salir sin guardar',
      cancelLabel: 'Seguir editando',
      tone: 'danger',
    }).then((leave) => {
      if (!alive) return;
      if (leave) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      alive = false;
    };
  }, [blocker, confirm]);
}
