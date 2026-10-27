import { useMemo, useState } from 'react';
import { useUnsavedChanges } from './useUnsavedChanges';

/**
 * Sabe si un formulario tiene cambios sin guardar (compara con lo último guardado) y activa el aviso de salida.
 * `markSaved(valor)` fija lo que acaba de guardarse; `saved` es a lo que vuelve «Descartar».
 */
export function useFormGuard<T>(form: T, initial: T) {
  const [saved, setSaved] = useState<T>(initial);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const { allowLeave } = useUnsavedChanges(dirty);
  return { dirty, saved, markSaved: setSaved, allowLeave };
}
