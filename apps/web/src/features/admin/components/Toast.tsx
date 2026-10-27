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
import { AdminIcon } from '../../../shared/ui/adminIcons';

type ToastTone = 'success' | 'danger';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  /** Aviso corto y discreto («Guardado»). Se va solo a los 4 segundos. */
  success: (message: string) => void;
  /** Un fallo que la persona no puede perder de vista; dura un poco más. */
  error: (message: string) => void;
}

const DURATION = { success: 4000, danger: 7000 } as const;

const ToastContext = createContext<ToastApi | null>(null);

/** Avisos de la administración: una región `aria-live` abajo a la derecha (arriba del contenido en celular). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((all) => all.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      next.current += 1;
      const id = next.current;
      // Máximo tres a la vez: un aviso nuevo no debe tapar el contenido.
      setItems((all) => [...all.slice(-2), { id, tone, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION[tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const timer of live.values()) window.clearTimeout(timer);
      live.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('danger', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="admin-toasts" role="region" aria-label="Avisos" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="admin-toast" data-tone={item.tone}>
            <AdminIcon name={item.tone === 'success' ? 'check' : 'warning'} className="size-5" />
            <p className="min-w-0 flex-1 text-sm">{item.message}</p>
            <button
              type="button"
              className="admin-toast-close"
              aria-label="Cerrar aviso"
              onClick={() => dismiss(item.id)}
            >
              <AdminIcon name="close" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return api;
}
