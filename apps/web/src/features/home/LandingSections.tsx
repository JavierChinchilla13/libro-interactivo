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

/** Frase principal y presentación del universo (editables por la autora en «Portada y autora»), con el portal de luz. */
export function Hero({
  site,
  hasBook,
}: {
  site: PublicSiteResponse | undefined;
  hasBook: boolean;
}) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative grid items-center gap-10 py-4 md:grid-cols-[1.3fr_1fr] md:gap-8 md:py-14"
    >
      <div className="flex flex-col gap-6">
        <p className="eyebrow">Universo Memorias</p>
        <h1
          id="hero-title"
          className="text-gradient font-display text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl"
        >
          {site?.universe.headline ?? '[PLACEHOLDER] Frase principal del sitio'}
        </h1>
        <div className="max-w-prose text-lg text-muted">
          {site?.universe.introHtml ? (
            <SafeHtml html={site.universe.introHtml} />
          ) : (
            <p>[PLACEHOLDER] ¿Qué es el universo Memorias?</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          {hasBook ? (
            <a href="#libro" className={`${primaryLink} !min-h-12 !px-7 !text-base`}>
              Conoce el libro
            </a>
          ) : null}
          <a href="#comprar" className={`${secondaryLink} !min-h-12 !px-7 !text-base`}>
            Cómo comprar
          </a>
        </div>
      </div>
      <div aria-hidden="true" className="portal-float mx-auto w-36 md:ml-auto md:mr-6 md:w-64">
        <div className="portal" />
      </div>
    </section>
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
export function WikiPreview({
  tabs,
  lockMessage,
}: {
  tabs: PublicBookDetail['wikiTabs'];
  lockMessage: string;
}) {
  if (tabs.length === 0) return null;
  return (
    <Section id="wiki" eyebrow="Explora" title="Wiki del universo">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.kind}>
            <Card className="flex h-full flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold">{tab.title}</p>
                <span aria-hidden="true" className="text-lg">
                  {tab.locked ? '🔒' : '✦'}
                </span>
              </div>
              {tab.locked ? (
                <>
                  <span>
                    <Badge tone="warning">Bloqueado</Badge>
                  </span>
                  <p className="text-sm text-muted">{tab.lockedMessage ?? lockMessage}</p>
                </>
              ) : (
                <p className="text-sm text-muted">Abierto para todos</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Link to="/wiki" className={`${primaryLink} mt-6`}>
        Entrar a la wiki
      </Link>
    </Section>
  );
}

/** Solo el nombre de cada experiencia. Todas se ven cerradas a un visitante; con sesión, el avance está en el panel. */
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
  return (
    <Section id="experiencias" eyebrow="Juega" title="Vive una experiencia inmersiva">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {experiences.map((experience) => (
          <li key={experience.id}>
            <Card className="relative h-full overflow-hidden">
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-3 font-display text-7xl font-bold text-primary/10"
              >
                {String(experience.order).padStart(2, '0')}
              </span>
              <p className="relative text-sm text-muted">Quiz {experience.order}</p>
              <p className="relative font-display text-lg font-semibold">{experience.title}</p>
              {signedIn ? null : <p className="relative mt-3 text-sm text-muted">{lockMessage}</p>}
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        Cada experiencia se abre a medida que avanzas en tu lectura.
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
  if (books.length === 0) return null;
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
