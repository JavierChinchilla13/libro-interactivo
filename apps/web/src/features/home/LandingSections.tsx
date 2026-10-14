import {
  POST_CATEGORY_LABELS,
  type PostCard,
  type PublicReview,
  type PublicBookDetail,
  type PublicBookSummary,
  type PublicSiteResponse,
  type PurchaseLink,
} from '@libro/shared';
import { Link } from 'react-router';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { formatDate, formatShortDate } from '../../shared/lib/dates';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Badge } from '../../shared/ui/layout';
import { HERO_COVER_SIZES, Plate, PortraitPlate } from '../../shared/ui/Plate';
import { Section } from '../../shared/ui/Section';
import { ThreadItem, ThreadList } from '../../shared/ui/ThreadList';
import { ArrowUpRightIcon, LockIcon } from '../../shared/ui/icons';

const buttonLink = 'btn';
const primaryLink = `${buttonLink} btn-primary`;
const secondaryLink = `${buttonLink} btn-secondary`;

/** El titular del héroe con su última palabra en más peso (el texto lo escribe la autora; el cian es solo de acción). */
function LastWordEmphasis({ text }: { text: string }) {
  const trimmed = text.trimEnd();
  const space = trimmed.lastIndexOf(' ');
  if (space === -1) return <>{text}</>;
  return (
    <>
      {trimmed.slice(0, space + 1)}
      <span className="emph">{trimmed.slice(space + 1)}</span>
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
 * Cuatro elementos y la placa: titular, presentación y las dos acciones. Los botones no dependen de ningún dato: el
 * héroe se pinta de inmediato y solo los textos esperan. La acción principal es entrar con el libro en la mano
 * (crear cuenta o continuar la lectura). La placa muestra la portada real si el libro ya la tiene.
 */
export function Hero({
  site,
  cover,
  coverPending,
  signedIn,
  sessionReady,
  status,
}: {
  site: PublicSiteResponse | undefined;
  cover: PublicBookDetail['cover'];
  /** La lista de libros aún no llegó: no se sabe si hay portada ni de qué forma. */
  coverPending: boolean;
  signedIn: boolean;
  sessionReady: boolean;
  status: HeroStatus;
}) {
  const headline =
    status === 'error'
      ? 'Universo Memorias'
      : (site?.universe.headline ?? '[PLACEHOLDER] Frase principal del sitio');
  const cta = `${buttonLink} btn-lg w-full sm:w-auto`;
  return (
    <section
      aria-labelledby="hero-title"
      aria-busy={status === 'loading' || undefined}
      className="relative grid items-center gap-10 py-4 md:min-h-[min(80dvh,46rem)] md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-14 md:py-14"
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
            <h1 id="hero-title" className="display-title break-words">
              <LastWordEmphasis text={headline} />
            </h1>
            <div className="max-w-[var(--token-measure)] text-lg text-muted">
              {site?.universe.introHtml ? (
                <SafeHtml html={site.universe.introHtml} />
              ) : status === 'ready' ? (
                <p>[PLACEHOLDER] ¿Qué es el universo Memorias?</p>
              ) : null}
            </div>
          </>
        )}
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
      </div>
      {/* El hueco de la portada se reserva (la más alta posible en el celular) para que la página no salte al llegar
          la lista de libros, sea la portada alta, apaisada o la tipográfica. */}
      <div className="min-h-[min(90vw,22.5rem)] md:min-h-0">
        {coverPending ? null : (
          <Plate
            cover={cover}
            priority
            className="w-3/5 max-w-60 md:ml-auto md:w-full md:max-w-[19rem]"
            landscapeClassName="w-full max-w-md md:ml-auto"
            sizes={HERO_COVER_SIZES.tall}
            landscapeSizes={HERO_COVER_SIZES.landscape}
          />
        )}
      </div>
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
      <div className="flex flex-col items-start gap-4">
        <h2 id="cierre-title" className="section-title">
          Empieza con tu <span className="emph">libro</span>
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

/**
 * Ficha del libro destacado: la portada pegajosa a la izquierda (si el libro la tiene) y, a su derecha, el título, el
 * lema, los géneros en una línea, la sinopsis, la advertencia de contenido, la edad y el ISBN.
 */
export function BookSection({ book }: { book: PublicBookDetail }) {
  return (
    <Section
      id="libro"
      title={book.title}
      intro={book.tagline}
      aside={
        book.cover ? (
          <Plate
            cover={book.cover}
            className="mx-auto w-3/5 max-w-72 lg:w-full lg:max-w-none"
            landscapeClassName="mx-auto w-full max-w-xl lg:max-w-none"
            sizes="(min-width: 1024px) 440px, 90vw"
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {book.genres.length > 0 ? (
          <ul aria-label="Géneros" className="flex flex-wrap gap-x-6 gap-y-1">
            {book.genres.map((genre) => (
              <li key={genre} className="label">
                {genre}
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
      <ul className="reveal-children divide-y divide-line border-y border-line">
        {tabs.map((tab) => (
          <li key={tab.kind} className="py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-display text-2xl font-medium sm:text-[1.75rem]">{tab.title}</p>
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
              <p className="mt-2 text-muted">{tab.lockedMessage}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {needsGeneral ? <p className="mt-5 text-muted">{lockMessage}</p> : null}
      <Link to="/wiki" className={`${primaryLink} mt-8`}>
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
      emphasis="inmersiva"
      split
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
              <p className="text-xl font-semibold sm:text-2xl">{experience.title}</p>
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

/** Etiqueta pequeña con el tipo y la fecha de una publicación. */
function PostMeta({ post }: { post: PostCard }) {
  return (
    <span className="label tabular-nums">
      {POST_CATEGORY_LABELS[post.category]} · {formatShortDate(post.publishedAt)}
    </span>
  );
}

/**
 * Las últimas publicaciones destacadas por la autora: la más reciente con su imagen y su titular grande; las demás
 * como filas de texto con filete (si no hay, la sección no aparece).
 */
export function FeaturedPosts({ posts }: { posts: readonly PostCard[] }) {
  if (posts.length === 0) return null;
  const [lead, ...rest] = posts;
  return (
    <Section id="actualizaciones" title="Actualizaciones">
      <div
        className={`grid gap-10 ${rest.length > 0 ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16' : ''}`}
      >
        {lead ? (
          <Link to={`/actualizaciones/${lead.slug}`} className="group flex flex-col gap-4">
            {lead.thumbnail ? (
              <img
                src={thumbUrl(lead.thumbnail.url, 960)}
                alt={lead.thumbnail.alt}
                width={lead.thumbnail.width}
                height={lead.thumbnail.height}
                loading="lazy"
                className="img-frame aspect-video w-full rounded-token-xs object-cover"
              />
            ) : null}
            <PostMeta post={lead} />
            <span className="font-display text-3xl font-medium leading-tight group-hover:underline sm:text-4xl">
              {lead.title}
            </span>
            {lead.excerpt ? (
              <span className="max-w-[var(--token-measure)] font-read text-xl text-muted">
                {lead.excerpt}
              </span>
            ) : null}
          </Link>
        ) : null}
        {rest.length > 0 ? (
          <ul className="reveal-children divide-y divide-line self-start border-y border-line">
            {rest.map((post) => (
              <li key={post.id}>
                <Link
                  to={`/actualizaciones/${post.slug}`}
                  className="group flex flex-col gap-1.5 py-5"
                >
                  <PostMeta post={post} />
                  <span className="text-xl font-semibold leading-snug group-hover:underline">
                    {post.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Link to="/actualizaciones" className={`${secondaryLink} mt-8`}>
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
        {review.authorName}
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
          <li className="max-w-3xl border-l-2 border-border pl-6">
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

/**
 * «Conoce a la autora»: el retrato (su foto o, sin ella, una placa con su inicial) a la izquierda y, a su derecha, el
 * nombre en Cinzel, la biografía, sus enlaces y la invitación a escribirle (el formulario vive en `/contacto`).
 */
export function AuthorSection({ site }: { site: PublicSiteResponse | undefined }) {
  const author = site?.author;
  const name = author?.name ?? '[PLACEHOLDER] Nombre de la autora';
  return (
    <Section
      id="autora"
      title="Conoce a la autora"
      aside={
        <PortraitPlate
          photo={author?.photo}
          name={name}
          className="mx-auto w-3/5 max-w-72 lg:w-full lg:max-w-none"
        />
      }
    >
      <div className="flex flex-col gap-6">
        <h3 className="font-display text-3xl font-medium sm:text-4xl">{name}</h3>
        {author?.bioHtml ? (
          <SafeHtml html={author.bioHtml} />
        ) : (
          <p className="max-w-[var(--token-measure)] font-read text-[1.1875rem] text-muted">
            [PLACEHOLDER] Biografía de la autora.
          </p>
        )}
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {author?.publicEmail ? (
            <li>
              <a
                className="link-slide inline-flex min-h-11 items-center"
                href={`mailto:${author.publicEmail}`}
              >
                {author.publicEmail}
              </a>
            </li>
          ) : null}
          {site?.social.map((link) => (
            <li key={link.url}>
              <a
                className="link-slide inline-flex min-h-11 items-center"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <Link to="/contacto" className={`${secondaryLink} self-start`}>
          Escríbele a la autora
        </Link>
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

/** Una opción de compra: la fila entera es el enlace (flecha de «sale del sitio»); las notas van debajo. */
function PurchaseItem({ link }: { link: PurchaseLink }) {
  return (
    <li className="border-t border-line">
      {link.url ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-h-[4.5rem] items-center justify-between gap-4 py-4 text-xl font-semibold sm:text-2xl"
        >
          <span className="group-hover:underline">{link.label}</span>
          <ArrowUpRightIcon className="size-6 text-primary transition-transform duration-(--token-dur-fast) ease-token-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </a>
      ) : (
        <p className="flex min-h-[4.5rem] items-center py-4 text-xl font-semibold sm:text-2xl">
          {link.label}
        </p>
      )}
      {link.notes ? <p className="-mt-2 pb-4 text-muted">{link.notes}</p> : null}
    </li>
  );
}

/**
 * Cómo comprar: Costa Rica (envíos y compras presenciales) e internacional (Amazon). Todo sale del libro. El
 * encabezado va centrado y cada región llena su mitad con filas grandes: no es un botón perdido en una banda vacía.
 */
export function BuySection({ links }: { links: PurchaseLink[] }) {
  const regions = [
    { region: 'CR', title: 'Costa Rica' },
    { region: 'INTL', title: 'Internacional' },
  ] as const;
  const groups = regions
    .map((group) => ({ ...group, items: links.filter((link) => link.region === group.region) }))
    .filter((group) => group.items.length > 0);
  const two = groups.length > 1;
  return (
    <Section id="comprar" title="Cómo comprar el libro" tone="sunken" space="loose" align="center">
      {groups.length === 0 ? (
        <p className="text-center text-muted">
          [PLACEHOLDER] Pronto publicaremos dónde conseguir el libro.
        </p>
      ) : (
        <div className={`mx-auto grid gap-12 ${two ? 'md:grid-cols-2 md:gap-0' : 'max-w-xl'}`}>
          {groups.map((group, index) => (
            <div
              key={group.region}
              className={
                two ? (index > 0 ? 'md:border-l md:border-line md:pl-12' : 'md:pr-12') : ''
              }
            >
              <h3 className="mb-6 font-display text-2xl font-medium sm:text-[1.75rem]">
                {group.title}
              </h3>
              <ul className="border-b border-line">
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
