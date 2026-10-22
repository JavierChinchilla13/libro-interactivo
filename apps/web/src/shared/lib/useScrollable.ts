import { useEffect, useState } from 'react';

/**
 * ¿Desborda este elemento en horizontal (es una tira que se desliza)? Sirve para dar foco de teclado a una tira solo
 * cuando de verdad hay algo que desplazar: en pantallas anchas, donde todo cabe, no sobra una parada de Tab. Devuelve
 * la función para el `ref` del elemento y el estado; se recalcula al cambiar su tamaño.
 */
export function useScrollable<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const check = () => setScrollable(node.scrollWidth > node.clientWidth + 1);
    const observer = new ResizeObserver(check);
    observer.observe(node);
    check();
    return () => observer.disconnect();
  }, [node]);
  return [setNode, scrollable] as const;
}
