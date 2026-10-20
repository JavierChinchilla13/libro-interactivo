import { useId, useRef, useState, type ReactNode } from 'react';

export interface Folder {
  id: string;
  label: string;
  /** Texto bajo el nombre: «3 lugares», «2 por descubrir». */
  summary: string;
  content: ReactNode;
}

/**
 * Carpetas de la wiki (lugares y archivos): cada tipo es una carpeta de vidrio con su pestaña; al abrirla se ven sus
 * entradas en una hoja debajo. Patrón de revelado (botón con `aria-expanded`, una abierta a la vez), así que teclado y
 * lectores de pantalla funcionan sin trucos; `Esc` cierra y devuelve el foco a la carpeta. El vidrio vive solo aquí,
 * con alternativa sólida si no hay desenfoque o la persona pide menos transparencia.
 */
export function GlassFolders({
  folders,
  label,
  initialOpen,
}: {
  folders: readonly Folder[];
  label: string;
  initialOpen?: string;
}) {
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const base = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const current = folders.find((folder) => folder.id === open);

  return (
    <div className="flex flex-col gap-6">
      <ul
        aria-label={label}
        className="grid grid-cols-1 gap-x-4 gap-y-6 pt-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {folders.map((folder) => {
          const expanded = folder.id === open;
          return (
            <li key={folder.id}>
              <button
                type="button"
                ref={(node) => {
                  if (node) buttons.current.set(folder.id, node);
                  else buttons.current.delete(folder.id);
                }}
                className="glass-folder"
                aria-expanded={expanded}
                aria-controls={expanded ? `${base}-panel` : undefined}
                onClick={() => setOpen(expanded ? null : folder.id)}
              >
                <span className="font-display text-xl font-medium [overflow-wrap:anywhere]">
                  {folder.label}
                </span>
                <span className="text-sm text-muted">{folder.summary}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {current ? (
        <section
          id={`${base}-panel`}
          key={current.id}
          aria-label={current.label}
          className="glass-folder-sheet"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setOpen(null);
            buttons.current.get(current.id)?.focus();
          }}
        >
          {current.content}
        </section>
      ) : null}
    </div>
  );
}
