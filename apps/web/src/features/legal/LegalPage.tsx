import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useMediaQuery } from '../../shared/lib/useMediaQuery';
import { usePageMeta } from '../../shared/seo/usePageMeta';
import { publicApi, publicKeys } from '../home/api';

/**
 * La etiqueta de un dato pendiente. Se lee como una nota al margen (letra de interfaz, más chica que el texto), con
 * subrayado discontinuo y tono de aviso; no usa el cian de lo interactivo.
 */
const placeholderTag =
  'rounded-sm px-1 font-sans text-[0.8125rem] leading-snug text-text [box-decoration-break:clone] bg-warning/25 border-b border-dashed border-warning';

/**
 * Dato que solo puede dar la titular del sitio (nombre legal, identificación, domicilio, ley aplicable…). Los textos
 * son un borrador: nada aquí inventa datos de la titular ni de la autora.
 */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className={placeholderTag}>[PLACEHOLDER: {children}]</mark>;
}

/** Lo que se muestra mientras el administrador no escribe el nombre legal de la titular en el panel. */
export const OWNER_PENDING = 'nombre legal de la titular';

/**
 * El nombre legal de la titular. **Siempre sale de los ajustes del sitio** (`legalOwnerName`, lo escribe una
 * administrador en el panel): nunca se escribe en el código, porque el repositorio es público. Sin él, un dato
 * pendiente bien visible.
 */
export function OwnerName() {
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const name = site.data?.legalOwnerName?.trim();
  return name ? (
    <span data-legal-owner="">{name}</span>
  ) : (
    <Placeholder>{OWNER_PENDING}</Placeholder>
  );
}

/** «3 de noviembre de 2026» a partir de `AAAA-MM-DD` (sin zona horaria: es una fecha de calendario). */
export function formatLegalDate(isoDate: string): string {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

const LEGAL_LINKS = [
  { to: '/privacidad', label: 'Privacidad' },
  { to: '/terminos', label: 'Términos' },
  { to: '/cookies', label: 'Cookies' },
] as const;

/** Un apartado del texto: su dirección (ancla del índice), su titular y su cuerpo. */
export interface LegalSectionDef {
  id: string;
  title: string;
  body: ReactNode;
}

const tocLabel = 'text-sm font-medium text-text';

/** La lista del índice. Los enlaces llevan a cada apartado (ancla) con un objetivo táctil de 44 px en el celular. */
function TocList({ sections }: { sections: LegalSectionDef[] }) {
  return (
    <ol className="flex flex-col border-l border-line">
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="-ml-px flex min-h-11 items-center border-l border-transparent py-1 pl-4 text-muted hover:border-primary hover:text-text lg:min-h-9"
          >
            <span className="shrink-0 whitespace-nowrap tabular-nums">{index + 1}.</span>
            <span className="ml-2">{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Marco común de las páginas legales. Arriba: titular, versión y vigencia, y el aviso de borrador (una franja entre dos
 * líneas, sin caja). Abajo: el índice de la página (siempre abierto y fijo a la izquierda desde 1024 px; plegable en el
 * celular) y el texto en letra de lectura con una medida de 65 caracteres. El cuerpo de cada página son componentes
 * para que la revisión legal los cambie sin tocar lógica.
 */
export function LegalPage({
  title,
  subtitle,
  current,
  sections,
}: {
  title: string;
  subtitle: string;
  current: (typeof LEGAL_LINKS)[number]['to'];
  sections: LegalSectionDef[];
}) {
  const wide = useMediaQuery('(min-width: 1024px)', false);
  usePageMeta({ title, description: subtitle });
  return (
    <div className="mx-auto grid w-full max-w-[64rem] gap-x-14 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      <header className="fade-up lg:col-span-2">
        <h1 className="page-title">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <p className="mt-3 text-sm text-muted">
          Versión de los textos: <span className="tabular-nums">{LEGAL_VERSION}</span>. Vigente
          desde el <span className="tabular-nums">{formatLegalDate(LEGAL_EFFECTIVE_DATE)}</span>.
        </p>
        <div role="note" className="mt-5 border-y border-line py-3 text-sm text-muted">
          <p>
            <strong className="font-semibold text-text">
              Borrador pendiente de revisión legal
            </strong>
            . No es asesoría legal ni afirma el cumplimiento de ninguna norma.
          </p>
          <p className="mt-1.5 text-xs">
            <mark className={placeholderTag}>[PLACEHOLDER]</mark> es un dato que solo puede dar la
            titular del sitio.
          </p>
        </div>
        <nav aria-label="Textos legales" className="mb-8 mt-2 flex flex-wrap gap-x-7 text-sm">
          {LEGAL_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.to === current ? 'page' : undefined}
              className={`link-slide inline-flex min-h-11 items-center ${
                item.to === current ? 'text-text' : 'text-muted hover:text-text'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <nav
        aria-label="En esta página"
        className="mb-6 text-sm lg:sticky lg:top-24 lg:mb-0 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto"
      >
        {wide ? (
          <>
            {/* Desde 1024 px el título no es un control: el índice está siempre abierto. */}
            <p className={`${tocLabel} pb-2`}>En esta página</p>
            <TocList sections={sections} />
          </>
        ) : (
          <details>
            <summary className={`${tocLabel} flex min-h-11 cursor-pointer list-none items-center`}>
              En esta página
            </summary>
            <TocList sections={sections} />
          </details>
        )}
      </nav>

      <article className="font-read text-[1.1875rem] leading-[1.625] [&_ol]:max-w-[65ch] [&_p]:max-w-[65ch] [&_ul]:max-w-[65ch]">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-titulo`}
            className="scroll-mt-28 pb-10"
          >
            <h2
              id={`${section.id}-titulo`}
              className="mb-4 font-display text-xl font-semibold leading-snug text-text"
            >
              <span className="mr-2 tabular-nums text-muted">{index + 1}.</span>
              {section.title}
            </h2>
            <div className="flex flex-col gap-4 text-pretty">{section.body}</div>
          </section>
        ))}
      </article>
    </div>
  );
}
