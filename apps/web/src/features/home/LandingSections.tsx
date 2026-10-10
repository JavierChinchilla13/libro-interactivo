import type {
  PostCard,
  PublicReview,
  PublicBookDetail,
  PublicBookSummary,
  PublicSiteResponse,
  PurchaseLink,
} from '@libro/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { formatDate } from '../../shared/lib/dates';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Badge, Card } from '../../shared/ui/layout';
import { PostCardItem } from '../posts/PostsPage';
import { ContactForm } from './ContactForm';

const buttonLink = 'btn';
const primaryLink = `${buttonLink} btn-primary`;
const secondaryLink = `${buttonLink} btn-secondary`;

function Section({
  id,
  title,
  eyebrow,
  intro,
  children,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      {eyebrow ? (
        <p aria-hidden="true" className="eyebrow mb-2">
          {eyebrow}
        </p>
      ) : null}
      <h2 id={`${id}-title`} className="section-title">
        {title}
      </h2>
      {intro ? <p className="mt-3 max-w-prose text-muted">{intro}</p> : null}
      <div className="mt-7">{children}</div>
    </section>
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
 * Frase principal y presentación del universo (editables por la autora en «Portada y autora»), con el portal de luz.
 * El portal y los botones no dependen de ningún dato: el héroe se pinta de inmediato y solo los textos esperan.
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
  const cta = `${buttonLink} !min-h-12 !px-7 !text-base w-full sm:w-auto`;
  const textLink =
    'inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted underline underline-offset-4 transition hover:text-text';
  return (
    <section
      aria-labelledby="hero-title"
      aria-busy={status === 'loading' || undefined}
      className="relative grid items-center gap-10 py-4 md:grid-cols-[1.3fr_1fr] md:gap-8 md:py-14"
    >
      <div className="flex flex-col gap-6">
        <p className="eyebrow">Universo Memorias</p>
        {status === 'loading' ? (
          <>
            <h1 id="hero-title" className="sr-only">
              Universo Memorias
            </h1>
            <div className="flex flex-col gap-3">
              <Bar className="h-10 w-11/12 sm:h-12 lg:h-14" />
              <Bar className="h-10 w-2/3 sm:h-12 lg:h-14" />
            </div>
            <div className="flex max-w-prose flex-col gap-2.5">
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-10/12" />
              <Bar className="h-4 w-7/12" />
            </div>
          </>
        ) : (
          <>
            <h1
              id="hero-title"
              className="text-gradient font-display text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl"
            >
              {headline}
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
      </div>
      <div aria-hidden="true" className="portal-float mx-auto w-36 md:ml-auto md:mr-6 md:w-64">
        <div className="portal" />
      </div>
    </section>
  );
}

/**
 * Cierre de la página: la puerta del inicio vuelve a aparecer en reposo y la acción principal se repite, para que la
 * última impresión sea la invitación a entrar y no el formulario de contacto.
 */
export function ClosingBand({
  signedIn,
  sessionReady,
}: {
  signedIn: boolean;
  sessionReady: boolean;
}) {
  return (
    <section aria-labelledby="cierre-title" className="glass rounded-token-lg px-6 py-10 sm:px-10">
      <div className="grid items-center gap-8 sm:grid-cols-[auto_1fr]">
        <div aria-hidden="true" className="mx-auto w-20 sm:w-24">
          <div className="portal" />
        </div>
        <div className="flex flex-col items-start gap-4">
          <h2 id="cierre-title" className="section-title">
            La puerta se abre con tu libro
          </h2>
          <p className="max-w-prose text-muted">
            {signedIn
              ? 'Tu avance te espera en el panel.'
              : 'Tu ejemplar trae un código QR: escanéalo y empieza por el primer quiz.'}
          </p>
          {sessionReady ? (
            signedIn ? (
              <Link to="/panel" className={`${primaryLink} !min-h-12 !px-7 !text-base`}>
                Ir a mi panel
              </Link>
            ) : (
              <Link to="/registro" className={`${primaryLink} !min-h-12 !px-7 !text-base`}>
                Crear mi cuenta
              </Link>
            )
          ) : null}
        </div>
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
      className="flex min-h-[70dvh] flex-col gap-6"
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="glass h-44 rounded-token-lg motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

/** Ficha del libro destacado: portada con marco de luz, géneros, sinopsis, advertencia de contenido, edad e ISBN. */
export function BookSection({ book }: { book: PublicBookDetail }) {
  return (
    <Section id="libro" eyebrow="El libro" title={book.title} intro={book.tagline}>
      <div className="grid gap-8 sm:grid-cols-[minmax(0,15rem)_1fr]">
        {book.cover ? (
          <img
            src={thumbUrl(book.cover.url, 480)}
            alt={book.cover.alt}
            width={book.cover.width}
            height={book.cover.height}
            className="glow-frame h-auto w-full max-w-60 rounded-token-lg"
          />
        ) : null}
        <div className="flex flex-col gap-5">
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
              className="rounded-token-lg border border-warning/30 border-l-4 border-l-warning bg-warning/5 p-4 text-sm"
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
 * Vista previa de la wiki. Una pestaña con regla se ve «bloqueada» con el mensaje de la autora y **nada más**:
 * el contenido real lo entrega el servidor solo a quien ya avanzó.
 */
/** Cinzel luce en títulos cortos; una frase larga se lee mejor en la letra del sistema (Regla de la Serifa Escasa). */
export const SHORT_TITLE_MAX = 28;
export const cardTitleClass = (title: string) =>
  title.length > SHORT_TITLE_MAX
    ? 'font-sans text-base font-semibold'
    : 'font-display text-lg font-semibold';

/** Candado dibujado (cerrado o abierto): un solo trazo, hereda el color del texto. */
function LockIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d={open ? 'M8 11V8a4 4 0 0 1 7.5-2' : 'M8 11V8a4 4 0 0 1 8 0v3'} />
    </svg>
  );
}

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
    <Section id="wiki" eyebrow="Explora" title="Wiki del universo">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.kind}>
            <Card className="flex h-full flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className={cardTitleClass(tab.title)}>{tab.title}</p>
                <span aria-hidden="true" className={tab.locked ? 'text-muted' : 'text-primary'}>
                  <LockIcon open={!tab.locked} />
                </span>
              </div>
              {tab.locked ? (
                <>
                  <span>
                    <Badge tone="warning">Bloqueado</Badge>
                  </span>
                  {tab.lockedMessage ? (
                    <p className="text-sm text-muted">{tab.lockedMessage}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted">Abierto para todos</p>
              )}
            </Card>
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
 * Solo el nombre de cada experiencia. A un visitante se le dice qué falta para abrir cada una: la primera se abre con
 * el QR del libro y las demás al completar la anterior; el texto de bloqueo de la autora se dice una sola vez.
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
    <Section id="experiencias" eyebrow="Juega" title="Vive una experiencia inmersiva">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
        {experiences.map((experience) => {
          const opensFirst = !signedIn && experience.order === first;
          return (
            <li key={experience.id}>
              <Card
                className={`flex h-full flex-col gap-1 ${opensFirst ? '!border-primary/60 shadow-glow' : ''}`}
              >
                <p className="text-sm text-muted">Quiz {experience.order}</p>
                <p className={cardTitleClass(experience.title)}>{experience.title}</p>
                {signedIn ? null : (
                  <p
                    className={`mt-2 flex items-center gap-2 text-sm ${opensFirst ? 'text-primary' : 'text-muted'}`}
                  >
                    <LockIcon open={opensFirst} />
                    {opensFirst
                      ? 'Se abre con el QR de tu libro'
                      : `Antes, completa el Quiz ${experience.order - 1}`}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-muted">
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

/** Las últimas publicaciones destacadas por la autora (si no hay ninguna, la sección no aparece). */
export function FeaturedPosts({ posts }: { posts: readonly PostCard[] }) {
  if (posts.length === 0) return null;
  return (
    <Section id="actualizaciones" eyebrow="Novedades" title="Actualizaciones">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
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
  return (
    <Section id="resenas" eyebrow="Lo que dicen" title="Reseñas de lectores">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <Card as="div" className="relative flex h-full flex-col gap-3 overflow-hidden">
              <span
                aria-hidden="true"
                className="absolute -top-4 right-3 font-display text-8xl leading-none text-primary/15"
              >
                “
              </span>
              {review.rating ? (
                <p
                  role="img"
                  aria-label={`${review.rating} de 5 estrellas`}
                  className="text-lg text-warning"
                >
                  {'★'.repeat(review.rating)}
                  <span className="text-muted/50">{'★'.repeat(5 - review.rating)}</span>
                </p>
              ) : null}
              <blockquote className="relative flex-1 text-[0.95rem] leading-relaxed">
                “{review.text}”
              </blockquote>
              <p className="text-sm font-medium">
                — {review.authorName}
                {review.source ? (
                  <span className="font-normal text-muted"> · {review.source}</span>
                ) : null}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** «Conoce a la autora» y el formulario de contacto. */
export function AuthorSection({ site }: { site: PublicSiteResponse | undefined }) {
  const author = site?.author;
  return (
    <Section id="autora" eyebrow="La autora" title="Conoce a la autora">
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            {author?.photo ? (
              <img
                src={thumbUrl(author.photo.url, 240)}
                alt={author.photo.alt}
                width={120}
                height={120}
                className="glow-frame size-28 rounded-full object-cover"
              />
            ) : null}
            <p className="font-display text-xl font-semibold">
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
        <Card as="div">
          <h3 className="mb-4 font-display text-xl font-semibold">Escríbeme</h3>
          <ContactForm />
        </Card>
      </div>
    </Section>
  );
}

/** Secuencia de publicación: las portadas de la saga; los libros que vienen se marcan «Próximamente». */
export function SagaSection({ books }: { books: PublicBookSummary[] }) {
  // Un solo libro no es una secuencia: ya tiene su propia sección.
  if (books.length < 2) return null;
  return (
    <Section id="saga" eyebrow="La saga" title="Secuencia de publicación">
      <ul
        aria-label="Libros de la saga"
        className="-mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-4"
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
                className="glow-frame aspect-[2/3] h-auto w-full rounded-token object-cover"
              />
            ) : null}
            <p className="mt-3 font-display font-semibold">{book.title}</p>
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
    <Section id="comprar" eyebrow="Consíguelo" title="Cómo comprar el libro">
      {groups.length === 0 ? (
        <p className="text-muted">[PLACEHOLDER] Pronto publicaremos dónde conseguir el libro.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.region}>
              <h3 className="mb-4 font-display text-xl font-semibold">{group.title}</h3>
              <ul className="flex flex-col gap-4">
                {group.items.map((link, index) => (
                  <PurchaseItem key={`${link.label}-${index}`} link={link} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
