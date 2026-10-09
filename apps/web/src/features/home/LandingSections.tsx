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

const buttonLink =
  'inline-flex min-h-11 items-center justify-center rounded-token px-4 text-sm font-semibold';
const primaryLink = `${buttonLink} bg-primary text-primary-contrast`;
const secondaryLink = `${buttonLink} border border-border bg-surface text-text`;

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <h2 id={`${id}-title`} className="font-display text-2xl font-bold sm:text-3xl">
        {title}
      </h2>
      {intro ? <p className="mt-1 text-muted">{intro}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Frase principal y presentación del universo (editables por la autora en «Ajustes del sitio»). */
export function Hero({
  site,
  hasBook,
}: {
  site: PublicSiteResponse | undefined;
  hasBook: boolean;
}) {
  return (
    <section aria-labelledby="hero-title" className="space-y-4 py-4 sm:py-8">
      <p className="text-sm font-medium uppercase tracking-wide text-muted">Universo Memorias</p>
      <h1 id="hero-title" className="font-display text-3xl font-bold sm:text-5xl">
        {site?.universe.headline ?? '[PLACEHOLDER] Frase principal del sitio'}
      </h1>
      <div className="max-w-prose">
        {site?.universe.introHtml ? (
          <SafeHtml html={site.universe.introHtml} />
        ) : (
          <p className="text-muted">[PLACEHOLDER] ¿Qué es el universo Memorias?</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {hasBook ? (
          <a href="#libro" className={primaryLink}>
            Conoce el libro
          </a>
        ) : null}
        <a href="#comprar" className={secondaryLink}>
          Cómo comprar
        </a>
      </div>
    </section>
  );
}

/** Ficha del libro destacado: portada, géneros, sinopsis, advertencia de contenido sensible, edad e ISBN. */
export function BookSection({ book }: { book: PublicBookDetail }) {
  return (
    <Section id="libro" title={book.title} intro={book.tagline}>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_1fr]">
        {book.cover ? (
          <img
            src={thumbUrl(book.cover.url, 480)}
            alt={book.cover.alt}
            width={book.cover.width}
            height={book.cover.height}
            className="h-auto w-full max-w-56 rounded-token-lg border border-border"
          />
        ) : null}
        <div className="flex flex-col gap-4">
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
              className="rounded-token border border-border bg-surface-alt p-4 text-sm"
            >
              <p className="font-semibold">Advertencia de contenido sensible</p>
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
    <Section id="wiki" title="Wiki del universo">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.kind}>
            <Card className="h-full">
              <p className="font-semibold">{tab.title}</p>
              {tab.locked ? (
                <>
                  <Badge tone="warning">Bloqueado</Badge>
                  <p className="mt-2 text-sm text-muted">{tab.lockedMessage ?? lockMessage}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Abierto para todos</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Link to="/wiki" className={`${primaryLink} mt-4`}>
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
    <Section id="experiencias" title="Vive una experiencia inmersiva">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {experiences.map((experience) => (
          <li key={experience.id}>
            <Card className="h-full">
              <p className="text-sm text-muted">Quiz {experience.order}</p>
              <p className="font-semibold">{experience.title}</p>
              {signedIn ? null : <p className="mt-2 text-sm text-muted">{lockMessage}</p>}
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        Cada experiencia se abre a medida que avanzas en tu lectura.
      </p>
      {signedIn ? (
        <Link to="/panel" className={`${primaryLink} mt-3`}>
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
    <Section id="actualizaciones" title="Actualizaciones">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCardItem key={post.id} post={post} />
        ))}
      </ul>
      <Link to="/actualizaciones" className={`${secondaryLink} mt-4`}>
        Ver todas las actualizaciones
      </Link>
    </Section>
  );
}

/** Reseñas que la autora eligió mostrar. Son texto plano: React lo escapa, nunca se interpreta como HTML. */
export function ReviewsSection({ reviews }: { reviews: readonly PublicReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <Section id="resenas" title="Reseñas de lectores">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <Card as="div" className="flex h-full flex-col gap-3">
              {review.rating ? (
                <p role="img" aria-label={`${review.rating} de 5 estrellas`} className="text-lg">
                  {'★'.repeat(review.rating)}
                  <span className="text-muted">{'★'.repeat(5 - review.rating)}</span>
                </p>
              ) : null}
              <blockquote className="flex-1 text-sm">“{review.text}”</blockquote>
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
    <Section id="autora" title="Conoce a la autora">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {author?.photo ? (
              <img
                src={thumbUrl(author.photo.url, 240)}
                alt={author.photo.alt}
                width={120}
                height={120}
                className="size-28 rounded-full border border-border object-cover"
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
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
        <div>
          <h3 className="mb-3 font-semibold">Escríbeme</h3>
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}

/** Secuencia de publicación: las portadas de la saga; los libros que vienen se marcan «Próximamente». */
export function SagaSection({ books }: { books: PublicBookSummary[] }) {
  if (books.length === 0) return null;
  return (
    <Section id="saga" title="Secuencia de publicación">
      <ul
        aria-label="Libros de la saga"
        className="flex snap-x gap-4 overflow-x-auto pb-2"
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
                className="h-auto w-full rounded-token border border-border"
              />
            ) : null}
            <p className="mt-2 font-semibold">{book.title}</p>
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
    <Section id="comprar" title="Cómo comprar el libro">
      {groups.length === 0 ? (
        <p className="text-muted">[PLACEHOLDER] Pronto publicaremos dónde conseguir el libro.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.region}>
              <h3 className="mb-3 font-semibold">{group.title}</h3>
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
