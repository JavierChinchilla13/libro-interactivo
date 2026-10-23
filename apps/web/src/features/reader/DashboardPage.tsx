import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { heightUrl } from '../../shared/lib/cloudinary';
import { Alert, EmptyState } from '../../shared/ui/layout';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { useSession } from '../auth/session';
import { publicApi, publicKeys } from '../home/api';
import { HowItWorks } from './HowItWorks';
import { LibraryBookCard, type LibraryEntry } from './LibraryBookCard';
import { nextHref } from './nextStep';
import { useLibrary } from './useLibrary';

/** Orden de «Tus libros»: primero lo que tiene un paso por hacer, luego lo abierto, lo bloqueado y lo que viene. */
export function sortLibrary(entries: readonly LibraryEntry[]): LibraryEntry[] {
  const rank = (entry: LibraryEntry) =>
    entry.access === 'open'
      ? entry.progress?.nextExperience
        ? 0
        : 1
      : entry.access === 'locked'
        ? 2
        : 3;
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.book.order - b.book.order);
}

function GridSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[27rem] animate-pulse motion-reduce:animate-none rounded-token-xl border border-line bg-surface md:h-[19rem]"
    />
  );
}

const shortcut =
  'flex items-center justify-between gap-4 border-t border-line py-4 transition-colors first:border-t-0 hover:text-primary active:bg-surface-alt/40';

/**
 * Entrada del panel de la lectora: saludo con su avance, «Tus libros» (cada libro con el estado que decide el
 * servidor), qué es Universo Memorias y atajos. El hilo de experiencias de cada libro vive en `/panel/libros/:slug`.
 */
export function DashboardPage() {
  const session = useSession();
  const library = useLibrary();
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });

  const entries = sortLibrary(library.data?.books ?? []);
  const open = entries.filter((entry) => entry.access === 'open');
  const done = open.reduce((sum, entry) => sum + (entry.progress?.done ?? 0), 0);
  const total = open.reduce((sum, entry) => sum + (entry.progress?.total ?? 0), 0);
  const next = open.find((entry) => entry.progress?.nextExperience);
  const nextStep = next?.progress?.nextExperience;
  const href = next ? nextHref(next) : undefined;

  const subtitle = library.data
    ? open.length > 0
      ? `${done} de ${total} experiencias abiertas en ${open.length === 1 ? 'tu libro' : `${open.length} libros`}`
      : entries.length > 0
        ? 'Escanea el QR de tu libro para abrir el primer quiz.'
        : undefined
    : undefined;

  const universe = site.data?.universe;
  const hasUniverse = Boolean(universe?.headline || universe?.introHtml);
  // La primera imagen de la autora es el ambiente del saludo; la segunda (si hay) acompaña «Qué es el universo».
  const ambient = universe?.headerImages?.[0];
  const image = universe?.headerImages?.[1];
  const noneOpen = library.data !== undefined && open.length === 0;

  return (
    <div className="flex flex-col gap-14 md:gap-20">
      <div className="flex flex-col gap-8">
        <header className="fade-up relative isolate">
          {ambient ? (
            <img
              src={heightUrl(ambient.url, 360)}
              alt=""
              width={ambient.width}
              height={ambient.height}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="greeting-ambient"
            />
          ) : null}
          <h1 className="page-title greeting-title">{`Hola, ${session.data?.name ?? ''}`}</h1>
          {subtitle ? <p className="mt-2 text-base text-muted">{subtitle}</p> : null}
          {nextStep && href ? (
            <Link to={href} className="btn btn-primary btn-lg mt-6">
              Seguir con {nextStep.title}
            </Link>
          ) : null}
        </header>

        {noneOpen && entries.length > 0 ? <HowItWorks /> : null}

        <section aria-labelledby="tus-libros" className="flex flex-col gap-4">
          <h2 id="tus-libros" className="section-title text-2xl">
            Tus libros
          </h2>
          {library.isPending ? <GridSkeleton /> : null}
          {library.isError ? (
            <div className="flex flex-col items-start gap-3">
              <Alert>{errorMessage(library.error)}</Alert>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void library.refetch()}
              >
                Reintentar
              </button>
            </div>
          ) : null}
          {library.data && entries.length === 0 ? (
            <EmptyState title="Todavía no hay libros disponibles">Vuelve pronto.</EmptyState>
          ) : null}
          {entries.length === 1 && entries[0] ? (
            <LibraryBookCard entry={entries[0]} featured priority />
          ) : null}
          {entries.length > 1 ? (
            <ul
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Tus libros"
            >
              {entries.map((entry, index) => {
                const lead = index === 0 && entry.access === 'open';
                return (
                  // La tarjeta grande puede ser lo primero que se pinta: no se anima. Las demás entran escalonadas.
                  <li
                    key={entry.book.id}
                    className={lead ? 'sm:col-span-2 lg:col-span-3' : index === 0 ? '' : 'reveal'}
                    style={
                      index > 0 ? ({ '--i': Math.min(index - 1, 4) } as CSSProperties) : undefined
                    }
                  >
                    <LibraryBookCard entry={entry} featured={lead} priority={index === 0} />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>

      {library.data && !noneOpen ? <HowItWorks /> : null}

      <nav aria-label="Atajos" className="border-t border-line pt-2">
        <ul>
          <li>
            <Link to="/panel/resultados" className={shortcut}>
              <span>
                <span className="block font-semibold">Mis resultados</span>
                <span className="text-sm text-muted">Todo lo que has descubierto.</span>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
          <li>
            <Link to="/wiki" className={shortcut}>
              <span>
                <span className="block font-semibold">Wiki del universo</span>
                <span className="text-sm text-muted">Personajes, campos y lugares.</span>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
          <li>
            <Link to="/panel/extras" className={shortcut}>
              <span>
                <span className="block font-semibold">Capítulos extra</span>
                <span className="text-sm text-muted">Se abren al terminar un libro.</span>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        </ul>
      </nav>
      {hasUniverse && universe ? (
        <section
          aria-labelledby="que-es"
          className="grid grid-cols-1 items-center gap-6 border-t border-line pt-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-10"
        >
          <div className="flex flex-col gap-3">
            <p className="label">El universo</p>
            <h2 id="que-es" className="section-title text-2xl">
              {universe.headline ?? 'Universo Memorias'}
            </h2>
            {universe.introHtml ? <SafeHtml html={universe.introHtml} /> : null}
          </div>
          {image ? (
            <img
              src={heightUrl(image.url, 420)}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
              className="max-h-72 w-full rounded-token-xl border border-line object-cover"
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
