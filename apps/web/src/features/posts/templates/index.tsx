import type {
  AnnouncementPostData,
  EventPostData,
  FeaturedImagePostData,
  GalleryPostData,
  InvitationPostData,
  PostDetail,
  PostTemplate,
  TextPostData,
} from '@libro/shared';
import { useState, type ComponentType } from 'react';
import { Link } from 'react-router';
import { thumbUrl } from '../../../shared/lib/cloudinary';
import { formatDateTime } from '../../../shared/lib/dates';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { Card } from '../../../shared/ui/layout';
import { Lightbox } from './Lightbox';
import { PostFrame, PostHeader, primaryLink, secondaryLink, templateData } from './parts';

/**
 * Una plantilla = un componente. Para agregar otra: su esquema en `@libro/shared`, su componente aquí y su
 * formulario en el panel; la base de datos no cambia (el post guarda `template` y `data`).
 */

/** `preview`: dentro del panel el título baja a h2 (la página ya tiene su h1). */
export interface ViewProps {
  post: PostDetail;
  preview?: boolean | undefined;
}

function Body({ html }: { html: string | undefined }) {
  return html ? <SafeHtml html={html} /> : null;
}

/** Texto simple: título, fecha y cuerpo. */
function TextPost({ post, preview }: ViewProps) {
  const data = templateData<TextPostData>('text', post.data);
  return (
    <PostFrame>
      <PostHeader post={post} preview={preview} />
      <Body html={data.bodyHtml} />
    </PostFrame>
  );
}

/** Imagen destacada: imagen ancha arriba con su pie, y el texto. */
function FeaturedImagePost({ post, preview }: ViewProps) {
  const data = templateData<FeaturedImagePostData>('featured_image', post.data);
  return (
    <PostFrame>
      <PostHeader post={post} preview={preview} />
      {data.image ? (
        <figure className="-mx-4 sm:mx-0">
          <img
            src={thumbUrl(data.image.url, 1200)}
            alt={data.image.alt}
            width={data.image.width}
            height={data.image.height}
            className="h-auto w-full sm:rounded-token-lg"
          />
          {data.caption ? (
            <figcaption className="px-4 pt-2 text-sm text-muted sm:px-0">{data.caption}</figcaption>
          ) : null}
        </figure>
      ) : null}
      <Body html={data.bodyHtml} />
    </PostFrame>
  );
}

/** Galería: cuadrícula de fotos; al tocar una se abre ampliada con flechas. */
function GalleryPost({ post, preview }: ViewProps) {
  const data = templateData<GalleryPostData>('gallery', post.data);
  const [open, setOpen] = useState<number | null>(null);
  const items = data.images ?? [];
  return (
    <PostFrame>
      <PostHeader post={post} preview={preview} />
      <Body html={data.bodyHtml} />
      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, index) => (
            <li key={`${item.image.publicId}-${index}`}>
              <button
                type="button"
                onClick={() => setOpen(index)}
                aria-label={`Ampliar foto ${index + 1}${item.caption ? `: ${item.caption}` : ''}`}
                className="block w-full overflow-hidden rounded-token border border-border"
              >
                <img
                  src={thumbUrl(item.image.url, 400)}
                  alt={item.image.alt}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length > 0 ? (
        <p className="text-sm text-muted">Toca una foto para verla grande.</p>
      ) : null}
      {open !== null ? (
        <Lightbox items={items} index={open} onChange={setOpen} onClose={() => setOpen(null)} />
      ) : null}
    </PostFrame>
  );
}

/** Evento: ficha con fecha, lugar, dirección, mapa y más información. */
function EventPost({ post, preview }: ViewProps) {
  const data = templateData<EventPostData>('event', post.data);
  return (
    <PostFrame>
      <PostHeader post={post} preview={preview} />
      <Card as="div" className="flex flex-col gap-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          {data.startsAt ? (
            <div>
              <dt className="text-xs text-muted">Fecha</dt>
              <dd className="font-medium">
                {formatDateTime(data.startsAt)}
                {data.endsAt ? (
                  <span className="block text-sm text-muted">
                    hasta {formatDateTime(data.endsAt)}
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {data.venue ? (
            <div>
              <dt className="text-xs text-muted">Lugar</dt>
              <dd className="font-medium">{data.venue}</dd>
            </div>
          ) : null}
          {data.address ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Dirección</dt>
              <dd>{data.address}</dd>
            </div>
          ) : null}
        </dl>
        {data.mapUrl || data.link ? (
          <div className="flex flex-wrap gap-3">
            {data.mapUrl ? (
              <a
                href={data.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={secondaryLink}
              >
                Ver mapa
              </a>
            ) : null}
            {data.link ? (
              <a href={data.link} target="_blank" rel="noopener noreferrer" className={primaryLink}>
                Más información
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>
      <Body html={data.bodyHtml} />
    </PostFrame>
  );
}

/** Invitación: imagen, texto y un botón de acción con fecha límite opcional. */
function InvitationPost({ post, preview }: ViewProps) {
  const data = templateData<InvitationPostData>('invitation', post.data);
  return (
    <PostFrame>
      <PostHeader post={post} preview={preview} />
      {data.image ? (
        <img
          src={thumbUrl(data.image.url, 1000)}
          alt={data.image.alt}
          width={data.image.width}
          height={data.image.height}
          className="h-auto w-full rounded-token-lg border border-border"
        />
      ) : null}
      <Body html={data.bodyHtml} />
      {data.ctaLabel && data.ctaUrl ? (
        <div className="flex flex-col items-start gap-2">
          <a href={data.ctaUrl} target="_blank" rel="noopener noreferrer" className={primaryLink}>
            {data.ctaLabel}
          </a>
          {data.deadline ? (
            <p className="text-sm text-muted">Fecha límite: {formatDateTime(data.deadline)}</p>
          ) : null}
        </div>
      ) : null}
    </PostFrame>
  );
}

/** Anuncio de contenido nuevo: capítulo extra o libro. Un extra aclara que se desbloquea al completar el libro. */
function AnnouncementPost({ post, preview }: ViewProps) {
  const data = templateData<AnnouncementPostData>('announcement', post.data);
  const isExtra = data.announces !== 'book';
  return (
    <PostFrame>
      <PostHeader post={post} preview={preview} />
      <Card as="div" className="flex flex-col items-start gap-3">
        {data.image ? (
          <img
            src={thumbUrl(data.image.url, 480)}
            alt={data.image.alt}
            width={data.image.width}
            height={data.image.height}
            className="h-auto max-h-60 w-auto max-w-full rounded-token"
          />
        ) : null}
        <p className="text-sm font-medium text-muted">Nuevo contenido disponible</p>
        <p className="font-display text-xl font-semibold">
          {isExtra ? 'Capítulo extra' : 'Libro nuevo'}
        </p>
        {isExtra ? (
          <p className="text-sm text-muted">Se desbloquea al completar todo el libro.</p>
        ) : null}
        <Link to={isExtra ? '/panel/extras' : '/'} className={primaryLink}>
          {data.ctaLabel ?? 'Ver ahora'}
        </Link>
      </Card>
      <Body html={data.bodyHtml} />
    </PostFrame>
  );
}

export const postViews: Record<PostTemplate, ComponentType<ViewProps>> = {
  text: TextPost,
  featured_image: FeaturedImagePost,
  gallery: GalleryPost,
  event: EventPost,
  invitation: InvitationPost,
  announcement: AnnouncementPost,
};

/** Pinta una publicación con la plantilla que eligió la autora. Sirve igual para la vista previa del panel. */
export function PostView({ post, preview }: ViewProps) {
  const View = postViews[post.template];
  return <View post={post} preview={preview} />;
}
