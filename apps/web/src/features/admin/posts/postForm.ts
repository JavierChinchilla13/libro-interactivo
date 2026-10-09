import {
  postTemplates,
  type AdminPost,
  type ImageRefInput,
  type PostCategory,
  type PostInputPayload,
  type PostStatus,
  type PostTemplate,
} from '@libro/shared';
import { isoToLocal, localToIso } from '../../../shared/lib/dates';
import { slugify } from '../errors';

/** Datos de la plantilla tal como los edita el formulario (las fechas son texto `datetime-local`). */
export type PostFormData = Record<string, unknown>;

export interface PostForm {
  title: string;
  slug: string;
  /** Mientras no se toque el slug, sigue al título. */
  slugTouched: boolean;
  template: PostTemplate;
  data: PostFormData;
  category: PostCategory;
  bookId: string;
  thumbnail: ImageRefInput | undefined;
  status: PostStatus;
  /** Hora de Costa Rica (`datetime-local`). */
  publishedAt: string;
  featured: boolean;
}

/** Campos de cada plantilla que son fecha y hora. */
const DATE_FIELDS: Record<PostTemplate, readonly string[]> = {
  text: [],
  featured_image: [],
  gallery: [],
  event: ['startsAt', 'endsAt'],
  invitation: ['deadline'],
  announcement: [],
};

export function emptyPostForm(template: PostTemplate): PostForm {
  return {
    title: '',
    slug: '',
    slugTouched: false,
    template,
    data: template === 'announcement' ? { announces: 'extra' } : {},
    category: postTemplates[template].defaultCategory,
    bookId: '',
    thumbnail: undefined,
    status: 'draft',
    publishedAt: '',
    featured: false,
  };
}

export function formFromPost(post: AdminPost): PostForm {
  const data: PostFormData = { ...post.data };
  for (const field of DATE_FIELDS[post.template]) {
    data[field] = isoToLocal(typeof data[field] === 'string' ? data[field] : undefined);
  }
  return {
    title: post.title,
    slug: post.slug,
    slugTouched: true,
    template: post.template,
    data,
    category: post.category,
    bookId: post.bookId ?? '',
    thumbnail: post.thumbnail,
    status: post.status,
    publishedAt: isoToLocal(post.publishedAt),
    featured: post.featured,
  };
}

/** Lo que no se escribió no viaja: texto vacío, fotos sin imagen y fechas sin valor se omiten. */
export function dataToPayload(template: PostTemplate, data: PostFormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      const text = value.trim();
      if (text === '' || text === '<p></p>') continue;
      out[key] = DATE_FIELDS[template].includes(key) ? localToIso(text) : value;
    } else if (key === 'images' && Array.isArray(value)) {
      out[key] = value
        .filter((item: { image?: unknown }) => item.image !== undefined)
        .map((item: { image: unknown; caption?: string }) => ({
          image: item.image,
          ...(item.caption?.trim() ? { caption: item.caption.trim() } : {}),
        }));
    } else if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

export function payloadFromForm(form: PostForm): PostInputPayload {
  const publishedAt = localToIso(form.publishedAt);
  return {
    ...(form.bookId ? { bookId: form.bookId } : {}),
    slug: form.slug || slugify(form.title),
    title: form.title.trim(),
    template: form.template,
    data: dataToPayload(form.template, form.data),
    category: form.category,
    ...(form.thumbnail ? { thumbnail: form.thumbnail } : {}),
    status: form.status,
    ...(publishedAt ? { publishedAt } : {}),
    featured: form.featured,
  };
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
};

/** Una publicada con fecha futura es «Programada»: aún no la ve nadie. */
export function statusLabel(post: Pick<AdminPost, 'status' | 'publishedAt'>, now = Date.now()) {
  if (post.status === 'published' && post.publishedAt && Date.parse(post.publishedAt) > now) {
    return 'Programada';
  }
  return STATUS_LABEL[post.status];
}
