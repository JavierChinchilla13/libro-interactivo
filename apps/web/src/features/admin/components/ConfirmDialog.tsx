import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ConfirmOptions {
  title: string;
  /** Qué pasa exactamente si confirma («Se quitará de la web. Podrás restaurarlo desde Archivado»). */
  message?: ReactNode;
  /** El verbo del botón («Archivar», «Salir sin guardar»), nunca «Aceptar». */
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` pinta el botón en rojo: borra, quita o descarta. */
  tone?: 'primary' | 'danger';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Confirmaciones de la administración con un `<dialog>` nativo (foco atrapado y Escape ya resueltos por el
 * navegador). Se usa como `if (!(await confirm({...}))) return;`, en lugar de `window.confirm`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const settle = useRef<((ok: boolean) => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // Si ya hay una abierta, la anterior se cancela: nunca quedan promesas colgadas.
        settle.current?.(false);
        settle.current = resolve;
        if (!opener.current && document.activeElement instanceof HTMLElement) {
          opener.current = document.activeElement;
        }
        setPending({ ...options, resolve });
      }),
    [],
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !pending) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }, [pending]);

  const close = (ok: boolean) => {
    const current = pending;
    if (!current) return;
    settle.current = null;
    setPending(null);
    current.resolve(ok);
    // El foco vuelve al botón que abrió el cuadro (si sigue en la página).
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) window.setTimeout(() => back.focus(), 0);
  };

  const api = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {pending ? (
        <dialog
          ref={ref}
          className="admin-dialog"
          aria-labelledby="admin-confirm-title"
          aria-describedby={pending.message ? 'admin-confirm-message' : undefined}
          onCancel={(event) => {
            event.preventDefault();
            close(false);
          }}
          onClick={(event) => {
            // Un clic en el fondo oscuro (fuera de la tarjeta) cancela.
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div className="admin-dialog-card">
            <h2 id="admin-confirm-title" className="text-lg font-semibold">
              {pending.title}
            </h2>
            {pending.message ? (
              <div id="admin-confirm-message" className="mt-2 text-sm text-muted">
                {pending.message}
              </div>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                // En una acción que borra o quita, el foco empieza en «Cancelar»: Enter no destruye por error.
                autoFocus={pending.tone === 'danger'}
                className="btn btn-secondary"
                onClick={() => close(false)}
              >
                {pending.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                autoFocus={pending.tone !== 'danger'}
                className={`btn ${pending.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return confirm;
}
