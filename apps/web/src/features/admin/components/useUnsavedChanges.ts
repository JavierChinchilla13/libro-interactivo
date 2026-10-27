import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { useConfirm } from './ConfirmDialog';

/**
 * Avisa antes de perder cambios sin guardar: al cerrar o recargar la pestaña (aviso del navegador) y al ir a otra
 * pantalla dentro de la app (cuadro propio con «Seguir editando» / «Salir sin guardar»).
 * Devuelve `allowLeave`: llamarla justo antes de navegar a propósito (por ejemplo, tras crear algo) para no avisar.
 */
export function useUnsavedChanges(dirty: boolean) {
  const confirm = useConfirm();
  const skip = useRef(false);
  const current = useRef(dirty);
  useEffect(() => {
    current.current = dirty;
    // `allowLeave` vale para una sola salida: si se vuelve a editar o se guardó, el aviso se rearma.
    skip.current = false;
  }, [dirty]);
  // Se decide al navegar (no al dibujar): así `allowLeave()` surte efecto aunque no haya vuelto a dibujarse.
  const blocker = useBlocker(() => current.current && !skip.current);
  const latest = useRef(blocker);
  useEffect(() => {
    latest.current = blocker;
  }, [blocker]);

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
      if (leave) latest.current.proceed?.();
      else latest.current.reset?.();
    });
    return () => {
      alive = false;
    };
  }, [blocker.state, confirm]);

  const allowLeave = useCallback(() => {
    skip.current = true;
  }, []);
  return { allowLeave };
}
