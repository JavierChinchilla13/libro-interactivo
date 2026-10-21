import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'libro_selected_book';
const listeners = new Set<() => void>();

/** Libro elegido en este navegador (solo una comodidad: no es dato de la cuenta). */
export function getSelectedBookId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // sin almacenamiento (modo privado): se usa el libro por defecto
  }
}

/** Recuerda el libro elegido y avisa a todo lo que lo muestra (el panel, la wiki y el fondo con su tema). */
export function setSelectedBookId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
    memory = null;
  } catch {
    memory = id; // sin almacenamiento (modo privado): la elección vale mientras la página siga abierta
  }
  listeners.forEach((listener) => listener());
}

let memory: string | null = null;
const current = () => getSelectedBookId() ?? memory;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** El libro elegido, reactivo: si cambia (aquí o en otra pestaña) quien lo use se vuelve a pintar. */
export function useSelectedBookId(): string | null {
  return useSyncExternalStore(subscribe, current, () => null);
}
