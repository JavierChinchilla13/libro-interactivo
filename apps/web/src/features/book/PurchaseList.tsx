import type { PurchaseLink } from '@libro/shared';
import { ArrowUpRightIcon } from '../../shared/ui/icons';

const REGIONS = [
  { region: 'CR', title: 'Costa Rica' },
  { region: 'INTL', title: 'Internacional' },
] as const;

function groupsOf(links: readonly PurchaseLink[]) {
  return REGIONS.map((group) => ({
    ...group,
    items: links.filter((link) => link.region === group.region),
  })).filter((group) => group.items.length > 0);
}

/** ¿Hay algún lugar donde conseguir el libro? */
export function hasPurchaseLinks(links: readonly PurchaseLink[]): boolean {
  return groupsOf(links).length > 0;
}

/**
 * Dónde conseguir el libro: Costa Rica (envíos y compras presenciales) e internacional (Amazon), todo sale del libro.
 * Cada opción es un botón que sale del sitio (flecha); las notas van debajo. Se usa en la portada y en la página del
 * libro.
 */
export function PurchaseList({ links }: { links: readonly PurchaseLink[] }) {
  const groups = groupsOf(links);
  if (groups.length === 0) return null;
  return (
    <div className="purchase">
      {groups.map((group) => (
        <div key={group.region} className="purchase-group">
          <h3 className="purchase-title">{group.title}</h3>
          <ul className="purchase-links">
            {group.items.map((link, index) => (
              <li key={`${link.label}-${index}`}>
                {link.url ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-lg"
                  >
                    {link.label}
                    <ArrowUpRightIcon className="size-5 text-primary" />
                  </a>
                ) : (
                  <p className="purchase-static">{link.label}</p>
                )}
                {link.notes ? <p className="purchase-note">{link.notes}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
