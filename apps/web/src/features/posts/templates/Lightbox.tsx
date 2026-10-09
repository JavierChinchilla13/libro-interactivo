import type { ImageRef } from '@libro/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { thumbUrl } from '../../../shared/lib/cloudinary';

export interface LightboxItem {
  image: ImageRef;
  /** Texto o contenido bajo la foto (p. ej. el crédito del artista con su enlace). */
  caption?: ReactNode;
}

/**
 * Visor de fotos ampliadas con flechas. Diálogo modal: Escape lo cierra, ← y → cambian de foto
 * y el foco entra al botón de cerrar y vuelve a la foto que lo abrió.
 */
export function Lightbox({
  items,
  index,
  onChange,
  onClose,
}: {
  items: readonly LightboxItem[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const last = items.length - 1;

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft') onChange(index === 0 ? last : index - 1);
      else if (event.key === 'ArrowRight') onChange(index === last ? 0 : index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, last, onChange, onClose]);

  if (!item) return null;
  const nav =
    'flex size-12 items-center justify-center rounded-full bg-surface text-xl text-text shadow';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 min-h-11 rounded-token bg-surface px-4 text-sm font-semibold"
      >
        Cerrar
      </button>
      <img
        src={thumbUrl(item.image.url, 1600)}
        alt={item.image.alt}
        className="max-h-[75dvh] max-w-full rounded-token object-contain"
      />
      {item.caption ? <div className="max-w-xl text-center text-white">{item.caption}</div> : null}
      {items.length > 1 ? (
        <div className="flex items-center gap-4 text-white">
          <button
            type="button"
            aria-label="Foto anterior"
            className={nav}
            onClick={() => onChange(index === 0 ? last : index - 1)}
          >
            ‹
          </button>
          <span aria-live="polite">
            {index + 1} de {items.length}
          </span>
          <button
            type="button"
            aria-label="Foto siguiente"
            className={nav}
            onClick={() => onChange(index === last ? 0 : index + 1)}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
