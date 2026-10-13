import type {
  PostCard,
  PublicReview,
  PublicBookDetail,
  PublicBookSummary,
  PublicSiteResponse,
  PurchaseLink,
} from '@libro/shared';
import { Link } from 'react-router';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { formatDate } from '../../shared/lib/dates';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Badge } from '../../shared/ui/layout';
import { Section } from '../../shared/ui/Section';
import { ThreadItem, ThreadList } from '../../shared/ui/ThreadList';
import { PostCardItem } from '../posts/PostsPage';
import { ContactForm } from './ContactForm';
import { LockIcon } from '../../shared/ui/icons';
import { Thread } from '../../shared/ui/Thread';

const buttonLink = 'btn';
const primaryLink = `${buttonLink} btn-primary`;
const secondaryLink = `${buttonLink} btn-secondary`;

/** El titular del héroe con su última palabra en el color de acción (el texto lo escribe la autora). */
function LastWordAccent({ text }: { text: string }) {
  const trimmed = text.trimEnd();
  const space = trimmed.lastIndexOf(' ');
  if (space === -1) return <>{text}</>;
  return (
    <>
      {trimmed.slice(0, space + 1)}
      <span className="text-primary">{trimmed.slice(space + 1)}</span>
    </>
  );
}

export type HeroStatus = 'loading' | 'error' | 'ready';

/** Barra de relleno mientras llega un texto (no ocupa lectura para lectores de pantalla). */
function Bar({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-full bg-surface-alt/70 motion-safe:animate-pulse ${className}`}
    />
  );
}

/**
 * Frase principal y presentación del universo (editables por la autora en «Portada y autora»).
 * Los botones no dependen de ningún dato: el héroe se pinta de inmediato y solo los textos esperan.
 * La acción principal es entrar con el libro en la mano (crear cuenta o continuar la lectura).
 */
export function Hero({
  site,
  hasBook,
  signedIn,
  sessionReady,
  status,
}: {
  site: PublicSiteResponse | undefined;
  hasBook: boolean;
  signedIn: boolean;
  sessionReady: boolean;
  status: HeroStatus;
}) {
  const headline =
    status === 'error'
      ? 'Universo Memorias'
      : (site?.universe.headline ?? '[PLACEHOLDER] Frase principal del sitio');
  const cta = `${buttonLink} btn-lg w-full sm:w-auto`;
  const textLink =
    'link-slide inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted hover:text-text';
  return (
    <section
      aria-labelledby="hero-title"
      aria-busy={status === 'loading' || undefined}
      className="relative grid items-center gap-10 py-4 md:min-h-[min(80dvh,46rem)] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-12 md:py-14"
    >
      <div className="flex max-w-3xl flex-col gap-6">
        {status === 'loading' ? (
          <>
            <h1 id="hero-title" className="sr-only">
              Universo Memorias
            </h1>
            {/* Dos renglones con la altura real del titular (display): al llegar el texto, la página no se mueve. */}
            <div className="flex flex-col gap-[calc(var(--token-text-display)*0.15)]">
              <Bar className="h-[calc(var(--token-text-display)*0.95)] w-11/12" />
              <Bar className="h-[calc(var(--token-text-display)*0.95)] w-2/3" />
            </div>
            <div className="flex max-w-prose flex-col gap-2.5">
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-10/12" />
              <Bar className="h-4 w-7/12" />
            </div>
          </>
        ) : (
          <>
            <h1 id="hero-title" className="display-title">
              <LastWordAccent text={headline} />
            </h1>
            <div className="max-w-prose text-lg text-muted">
              {site?.universe.introHtml ? (
                <SafeHtml html={site.universe.introHtml} />
              ) : status === 'ready' ? (
                <p>[PLACEHOLDER] ¿Qué es el universo Memorias?</p>
              ) : null}
            </div>
          </>
        )}
        {!signedIn && sessionReady ? (
          <p className="max-w-prose text-base text-text">
            Escanea el código QR de tu ejemplar y abre tu primer quiz.
          </p>
        ) : null}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
          {!sessionReady ? (
            <>
              <Bar className="h-12 w-full sm:w-72" />
              <Bar className="h-12 w-full sm:w-44" />
            </>
          ) : signedIn ? (
            <Link to="/panel" className={`${primaryLink} ${cta}`}>
              Continuar mi lectura
            </Link>
          ) : (
            <>
              <Link to="/registro" className={`${primaryLink} ${cta}`}>
                Tengo el libro: crear mi cuenta
              </Link>
              <Link to="/ingresar" className={`${secondaryLink} ${cta}`}>
                Ya tengo cuenta
              </Link>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {hasBook ? (
            <a href="#libro" className={textLink}>
              Conoce el libro
            </a>
          ) : null}
          <a href="#comprar" className={textLink}>
            Cómo comprar el libro
          </a>
        </div>
        <Thread orientation="horizontal" animated className="mt-2 w-full max-w-md md:hidden" />
      </div>
      <Thread
        orientation="vertical"
        animated
        className="hidden w-full max-w-sm justify-self-end md:block"
      />
    </section>
  );
}

/**
 * Cierre de la página: la acción principal se repite, para que la última impresión sea la invitación a empezar y
 * no el formulario de contacto.
 */
export function ClosingBand({
  signedIn,
  sessionReady,
}: {
  signedIn: boolean;
  sessionReady: boolean;
}) {
  return (
    <section
      aria-labelledby="cierre-title"
      className="section-band-raised flex min-h-[min(70dvh,40rem)] flex-col justify-center py-section-loose"
    >
      <div aria-hidden="true" className="mb-6 flex flex-col items-start pl-[0.2rem]">
        <span className="h-14 w-px bg-linear-to-b from-unlit/0 to-lit" />
        <span className="size-3.5 rounded-full border-2 border-lit bg-lit shadow-lit" />
      </div>
      <div className="flex flex-col items-start gap-4">
        <h2 id="cierre-title" className="section-title">
          Empieza con tu <span className="text-primary">libro</span>
        </h2>
        <p className="max-w-prose text-muted">
          {signedIn
            ? 'Tu avance te espera en el panel.'
            : 'Tu ejemplar trae un código QR: escanéalo y empieza por el primer quiz.'}
        </p>
        {sessionReady ? (
          signedIn ? (
            <Link to="/panel" className={`${primaryLink} btn-lg`}>
              Ir a mi panel
            </Link>
          ) : (
            <Link to="/registro" className={`${primaryLink} btn-lg`}>
              Crear mi cuenta
            </Link>
          )
        ) : null}
      </div>
    </section>
  );
}

/** Relleno de altura fija mientras llegan las secciones: la página no salta cuando aparecen. */
export function SectionsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando el contenido"
      className="flex min-h-[70dvh] flex-col gap-6 py-section-regular"
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="surface h-44 rounded-token-lg motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

/** Ficha del libro destacado: portada, géneros, sinopsis, advertencia de contenido, edad e ISBN. */
export function BookSection({ book }: { book: PublicBookDetail }) {
  return (
    <Section id="libro" title={book.title} intro={book.tagline}>
      <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14">
        {book.cover ? (
          <img
            src={thumbUrl(book.cover.url, 640)}
            alt={book.cover.alt}
            width={book.cover.width}
            height={book.cover.height}
            className="img-frame h-auto w-full max-w-72 rounded-token-md md:max-w-none"
          />
        ) : null}
        <div className="flex max-w-prose flex-col gap-5">
          {book.genres.length > 0 ? (
            <ul aria-label="Géneros" className="flex flex-wrap gap-2">
              {book.genres.map((genre) => (
                <li key={genre}>
                  <Badge>{genre}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {book.synopsis ? <SafeHtml html={book.synopsis} /> : null}
          {book.contentWarning || book.minAge !== undefined ? (
            <aside
              aria-label="Advertencia de contenido sensible"
              className="border-l-2 border-warning pl-4 text-sm"
            >
              <p className="font-semibold text-warning">Advertencia de contenido sensible</p>
              {book.contentWarning ? <SafeHtml html={book.contentWarning} /> : null}
              {book.minAge !== undefined ? (
                <p className="mt-1">Recomendado para mayores de {book.minAge} años.</p>
              ) : null}
            </aside>
          ) : null}
          {book.isbn ? <p className="text-sm text-muted">ISBN: {book.isbn}</p> : null}
        </div>
      </div>
    </Section>
  );
}

/**
 * Vista previa de la wiki, como un índice. Una pestaña con regla se ve «bloqueada» con el mensaje de la autora y
 * **nada más**: el contenido real lo entrega el servidor solo a quien ya avanzó.
 */
export function WikiPreview({
  tabs,
  lockMessage,
}: {
  tabs: PublicBookDetail['wikiTabs'];
  lockMessage: string;
}) {
  if (tabs.length === 0) return null;
  // El texto general de bloqueo se dice una sola vez; cada pestaña solo repite el suyo si la autora le puso uno propio.
  const needsGeneral = tabs.some((tab) => tab.locked && !tab.lockedMessage);
  return (
    <Section id="wiki" title="Wiki del universo" tone="raised" space="regular">
      <ul className="reveal-children max-w-3xl divide-y divide-line border-y border-line">
        {tabs.map((tab) => (
          <li key={tab.kind} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-xl font-semibold">{tab.title}</p>
              {tab.locked ? (
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <LockIcon className="size-4" />
                  Bloqueado
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-primary">
                  <LockIcon open className="size-4" />
                  Abierto para todos
                </p>
              )}
            </div>
            {tab.locked && tab.lockedMessage ? (
              <p className="mt-1 text-sm text-muted">{tab.lockedMessage}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {needsGeneral ? <p className="mt-4 text-sm text-muted">{lockMessage}</p> : null}
      <Link to="/wiki" className={`${primaryLink} mt-6`}>
        Entrar a la wiki
      </Link>
    </Section>
  );
}

/**
 * Las experiencias del libro como pasos de un mismo hilo. A un visitante se le dice qué falta para abrir cada una:
 * la primera se abre con el QR del libro y las demás al completar la anterior; el texto de bloqueo de la autora se
 * dice una sola vez.
 */
export function Experiences({
  experiences,
  lockMessage,
  signedIn,
}: {
  experiences: PublicBookDetail['experiences'];
  lockMessage: string;
  signedIn: boolean;
}) {
  if (experiences.length === 0) return null;
  const first = Math.min(...experiences.map((experience) => experience.order));
  return (
    <Section
      id="experiencias"
      title="Vive una experiencia inmersiva"
      accent="inmersiva"
      numeral="01"
      tone="sunken"
      space="loose"
      tall
    >
      <ThreadList>
        {experiences.map((experience) => {
          const opensFirst = !signedIn && experience.order === first;
          return (
            <ThreadItem
              key={experience.id}
              state={signedIn ? 'neutral' : opensFirst ? 'lit' : 'unlit'}
            >
              <p className="label tabular-nums">Quiz {experience.order}</p>
              <p className="text-lg font-semibold">{experience.title}</p>
              {signedIn ? null : (
                <p
                  className={`mt-2 flex items-center gap-2 text-sm ${opensFirst ? 'text-primary' : 'text-muted'}`}
                >
                  <LockIcon open={opensFirst} className="size-4" />
                  {opensFirst
                    ? 'Se abre con el QR de tu libro'
                    : `Antes, completa el Quiz ${experience.order - 1}`}
                </p>
              )}
            </ThreadItem>
          );
        })}
      </ThreadList>
      <p className="mt-6 text-sm text-muted">
        {signedIn ? 'Cada experiencia se abre a medida que avanzas en tu lectura.' : lockMessage}
      </p>
      {signedIn ? (
        <Link to="/panel" className={`${primaryLink} mt-4`}>
          Ver mi avance
        </Link>
      ) : null}
    </Section>
  );
}

/** Las últimas publicaciones destacadas por la autora: una grande y las demás a su lado (si no hay, no aparece). */
export function FeaturedPosts({ posts }: { posts: readonly PostCard[] }) {
  if (posts.length === 0) return null;
  const [lead, ...rest] = posts;
  return (
    <Section id="actualizaciones" title="Actualizaciones">
      <ul
        className={`reveal-children grid gap-5 ${rest.length > 0 ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : 'max-w-xl'}`}
      >
        {lead ? <PostCardItem key={lead.id} post={lead} className="lg:row-span-2" /> : null}
        {rest.map((post) => (
          <PostCardItem key={post.id} post={post} />
        ))}
      </ul>
      <Link to="/actualizaciones" className={`${secondaryLink} mt-6`}>
        Ver todas las actualizaciones
      </Link>
    </Section>
  );
}

/** Reseñas que la autora eligió mostrar. Son texto plano: React lo escapa, nunca se interpreta como HTML. */
export function ReviewsSection({ reviews }: { reviews: readonly PublicReview[] }) {
  if (reviews.length === 0) return null;
  const [lead, ...rest] = reviews;
  const attribution = (review: PublicReview) => (
    <>
      <p className="text-sm font-medium">
        — {review.authorName}
        {review.source ? <span className="font-normal text-muted"> · {review.source}</span> : null}
      </p>
      {review.rating ? (
        <p className="text-sm tabular-nums text-muted">Valoración: {review.rating} de 5</p>
      ) : null}
    </>
  );
  return (
    <Section id="resenas" title="Reseñas de lectores" tone="raised">
      <ul className="flex flex-col gap-10">
        {lead ? (
          <li className="max-w-3xl border-l-2 border-primary/50 pl-6">
            <blockquote className="font-read text-2xl leading-snug sm:text-3xl">
              “{lead.text}”
            </blockquote>
            <div className="mt-4 flex flex-col gap-1">{attribution(lead)}</div>
          </li>
        ) : null}
        {rest.length > 0 ? (
          <li className="list-none">
            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((review) => (
                <li key={review.id} className="border-l border-line pl-4">
                  <blockquote className="font-read text-lg leading-relaxed">
                    “{review.text}”
                  </blockquote>
                  <div className="mt-3 flex flex-col gap-1">{attribution(review)}</div>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
      </ul>
    </Section>
  );
}

/** «Conoce a la autora» y el formulario de contacto. */
export function AuthorSection({ site }: { site: PublicSiteResponse | undefined }) {
  const author = site?.author;
  return (
    <Section id="autora" title="Conoce a la autora" numeral="03">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-0">
        <div className="flex flex-col gap-5 lg:pr-10">
          <div className="flex items-center gap-4">
            {author?.photo ? (
              <img
                src={thumbUrl(author.photo.url, 240)}
                alt={author.photo.alt}
                width={120}
                height={120}
                className="img-frame size-28 rounded-token-xl object-cover"
              />
            ) : null}
            <p className="text-xl font-semibold">
              {author?.name ?? '[PLACEHOLDER] Nombre de la autora'}
            </p>
          </div>
          {author?.bioHtml ? (
            <SafeHtml html={author.bioHtml} />
          ) : (
            <p className="text-muted">[PLACEHOLDER] Biografía de la autora.</p>
          )}
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {author?.publicEmail ? (
              <li>
                <a className="underline" href={`mailto:${author.publicEmail}`}>
                  {author.publicEmail}
                </a>
              </li>
            ) : null}
            {site?.social.map((link) => (
              <li key={link.url}>
                <a className="underline" href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:border-l lg:border-line lg:pl-10">
          <h3 className="mb-4 text-xl font-semibold">Escríbeme</h3>
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}

/** Secuencia de publicación: las portadas de la saga; los libros que vienen se marcan «Próximamente». */
export function SagaSection({ books }: { books: PublicBookSummary[] }) {
  // Un solo libro no es una secuencia: ya tiene su propia sección.
  if (books.length < 2) return null;
  return (
    <Section id="saga" title="Secuencia de publicación" tone="sunken">
      <ul
        aria-label="Libros de la saga"
        className="-mx-4 flex scroll-px-4 snap-x gap-5 overflow-x-auto px-4 pb-4"
        tabIndex={0}
      >
        {books.map((book) => (
          <li key={book.id} className="w-40 shrink-0 snap-start">
            {book.cover ? (
              <img
                src={thumbUrl(book.cover.url, 320)}
                alt={book.cover.alt}
                width={book.cover.width}
                height={book.cover.height}
                loading="lazy"
                className="img-frame aspect-[2/3] h-auto w-full rounded-token object-cover"
              />
            ) : null}
            <p className="mt-3 font-semibold">{book.title}</p>
            {book.status === 'upcoming' ? (
              <>
                <Badge tone="warning">Próximamente</Badge>
                {book.releaseDate ? (
                  <p className="mt-1 text-sm text-muted">{formatDate(book.releaseDate)}</p>
                ) : null}
              </>
            ) : (
              <Badge tone="success">Publicado</Badge>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PurchaseItem({ link }: { link: PurchaseLink }) {
  return (
    <li className="flex flex-col gap-1">
      {link.url ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${primaryLink} self-start`}
        >
          {link.label}
        </a>
      ) : (
        <p className="font-medium">{link.label}</p>
      )}
      {link.notes ? <p className="text-sm text-muted">{link.notes}</p> : null}
    </li>
  );
}

/** Cómo comprar: Costa Rica (envíos y compras presenciales) e internacional (Amazon). Todo sale del libro. */
export function BuySection({ links }: { links: PurchaseLink[] }) {
  const regions = [
    { region: 'CR', title: 'Costa Rica' },
    { region: 'INTL', title: 'Internacional' },
  ] as const;
  const groups = regions
    .map((group) => ({ ...group, items: links.filter((link) => link.region === group.region) }))
    .filter((group) => group.items.length > 0);
  return (
    <Section
      id="comprar"
      title="Cómo comprar el libro"
      numeral="02"
      tone="sunken"
      space="loose"
      tall
    >
      {groups.length === 0 ? (
        <p className="text-muted">[PLACEHOLDER] Pronto publicaremos dónde conseguir el libro.</p>
      ) : (
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-0">
          {groups.map((group, index) => (
            <div
              key={group.region}
              className={index > 0 ? 'sm:border-l sm:border-line sm:pl-10' : 'sm:pr-10'}
            >
              <h3 className="mb-4 text-xl font-semibold">{group.title}</h3>
              <ul className="flex flex-col gap-4">
                {group.items.map((link, i) => (
                  <PurchaseItem key={`${link.label}-${i}`} link={link} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
