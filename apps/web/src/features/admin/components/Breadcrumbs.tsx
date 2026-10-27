import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { AdminCrumb } from '../adminNav';
import { AdminIcon } from '../../../shared/ui/adminIcons';

/** Lugar donde una pantalla de detalle dice cómo se llama (la última miga: «Quiz 3» en vez de «Editar»). */
const LeafContext = createContext<((label: string | null) => void) | null>(null);

export function CrumbLeafProvider({
  setLeaf,
  children,
}: {
  setLeaf: (label: string | null) => void;
  children: ReactNode;
}) {
  return <LeafContext.Provider value={setLeaf}>{children}</LeafContext.Provider>;
}

/** Una pantalla de detalle pone aquí su nombre real; al salir, la miga vuelve a ser genérica. */
export function useCrumbLeaf(label: string | null | undefined) {
  const setLeaf = useContext(LeafContext);
  useEffect(() => {
    if (setLeaf && label) setLeaf(label);
  }, [setLeaf, label]);
  useEffect(() => {
    return () => setLeaf?.(null);
  }, [setLeaf]);
}

/** Migas «Grupo › Pantalla › Detalle»: el grupo es solo contexto (no es una página), el resto enlaza. */
export function Breadcrumbs({ crumbs }: { crumbs: readonly AdminCrumb[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Dónde estás" className="admin-crumbs">
      <ol>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {crumb.to && !last ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
              )}
              {last ? null : <AdminIcon name="chevron" className="size-3.5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
