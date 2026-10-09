import {
  collectPostImages,
  parsePostData,
  postTemplates,
  type AdminPost,
  type ImageRef,
  type PostCard,
  type PostCategory,
  type PostDetail,
  type PostInput,
  type PostListQuery,
  type PostListResponse,
  type PostTemplate,
} from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { assertCloudinaryUrls } from '../lib/images.js';
import { duplicateKeyFields, isDuplicateKey } from '../lib/mongoErrors.js';
import { firstParagraphText, sanitizeRichHtml } from '../lib/sanitize.js';
import { Book } from '../models/Book.js';
import { Post } from '../models/Post.js';
import { escapeRegex } from '../lib/text.js';

type PostLean = NonNullable<Awaited<ReturnType<typeof loadLean>>>;

async function loadLean(id: string) {
  return Post.findById(id).lean();
}

function toCard(post: PostLean): PostCard {
  return {
    id: post._id.toString(),
    slug: post.slug,
    title: post.title,
    template: post.template,
    category: post.category,
    ...(post.thumbnail ? { thumbnail: post.thumbnail as ImageRef } : {}),
    excerpt: post.excerpt ?? '',
    publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
    ...(post.eventAt ? { eventAt: post.eventAt.toISOString() } : {}),
    featured: post.featured,
    ...(post.bookId ? { bookId: post.bookId.toString() } : {}),
  };
}

const toDetail = (post: PostLean): PostDetail => ({
  ...toCard(post),
  data: (post.data ?? {}) as Record<string, unknown>,
});

function toAdmin(post: PostLean): AdminPost {
  const { publishedAt: _fallback, ...detail } = toDetail(post);
  void _fallback;
  return {
    ...detail,
    // En el panel `publishedAt` puede faltar (borrador sin fecha).
    ...(post.publishedAt ? { publishedAt: post.publishedAt.toISOString() } : {}),
    status: post.status,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

/**
 * Actualizaciones. El panel las crea con una plantilla; el público solo ve las **publicadas** cuya fecha ya llegó
 * (una fecha futura = programada, aún invisible). Los datos de cada plantilla se validan con su esquema en `shared`
 * (completos para publicar, flexibles para un borrador) y todo el HTML se sanea al guardar.
 */
export function createPostService(deps: { clock: Clock }) {
  function conflict(error: unknown): never {
    if (isDuplicateKey(error) && duplicateKeyFields(error).includes('slug')) {
      throw new AppError('CONFLICT', 'Ya existe una actualización con ese slug');
    }
    throw error;
  }

  /** Valida y normaliza los datos de la plantilla: defaults aplicados, HTML saneado e imágenes de Cloudinary. */
  function prepareData(template: PostTemplate, data: unknown, publishing: boolean) {
    const parsed = parsePostData(template, data, publishing);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new AppError('VALIDATION', `Los datos de la plantilla no son válidos (${detail})`);
    }
    const clean = { ...(parsed.data as Record<string, unknown>) };
    for (const field of postTemplates[template].htmlFields) {
      const value = clean[field];
      if (typeof value === 'string') clean[field] = sanitizeRichHtml(value);
    }
    return clean;
  }

  async function prepare(input: PostInput, existing?: PostLean) {
    if (input.bookId && !(await Book.exists({ _id: input.bookId }))) {
      throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    }
    const publishing = input.status === 'published';
    const data = prepareData(input.template, input.data, publishing);
    const images = collectPostImages(data);
    assertCloudinaryUrls([...images.map((image) => image.url), input.thumbnail?.url]);

    const body = typeof data['bodyHtml'] === 'string' ? data['bodyHtml'] : '';
    const venue = typeof data['venue'] === 'string' ? data['venue'] : '';
    const startsAt = typeof data['startsAt'] === 'string' ? new Date(data['startsAt']) : undefined;
    // Al publicar sin fecha: la que ya tenía o ahora. Un borrador conserva la fecha que se le haya puesto.
    const publishedAt = input.publishedAt
      ? new Date(input.publishedAt)
      : publishing
        ? (existing?.publishedAt ?? deps.clock())
        : undefined;
    const thumbnail = input.thumbnail ?? images[0];

    return {
      bookId: input.bookId,
      slug: input.slug,
      title: input.title,
      template: input.template,
      data,
      category: (input.category ?? postTemplates[input.template].defaultCategory) as PostCategory,
      thumbnail,
      excerpt: firstParagraphText(body) || venue,
      eventAt:
        input.template === 'event' && startsAt && !Number.isNaN(+startsAt) ? startsAt : undefined,
      status: input.status,
      publishedAt,
      featured: input.featured,
    };
  }

  // --- Panel --------------------------------------------------------------------------------------------------------

  async function adminList(filter: {
    status?: string | undefined;
    category?: string | undefined;
    q?: string | undefined;
  }): Promise<AdminPost[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query['status'] = filter.status;
    if (filter.category) query['category'] = filter.category;
    if (filter.q) query['title'] = { $regex: escapeRegex(filter.q), $options: 'i' };
    const posts = await Post.find(query).sort({ updatedAt: -1 }).lean();
    return posts.map(toAdmin);
  }

  async function adminGet(id: string): Promise<AdminPost> {
    const post = await loadLean(id);
    if (!post) throw new AppError('NOT_FOUND', 'No encontramos esa actualización');
    return toAdmin(post);
  }

  async function create(authorId: string, input: PostInput): Promise<AdminPost> {
    const doc = await prepare(input);
    try {
      const post = await Post.create({ ...doc, authorId });
      return adminGet(post._id.toString());
    } catch (error) {
      return conflict(error);
    }
  }

  /** Reemplaza la actualización completa (cambiar de plantilla incluido: los datos nuevos se validan). */
  async function replace(id: string, input: PostInput): Promise<AdminPost> {
    const current = await loadLean(id);
    if (!current) throw new AppError('NOT_FOUND', 'No encontramos esa actualización');
    const doc = await prepare(input, current);
    const set = Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined));
    const unset = Object.fromEntries(
      Object.entries(doc)
        .filter(([, value]) => value === undefined)
        .map(([key]) => [key, 1]),
    );
    try {
      await Post.updateOne(
        { _id: id },
        { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
      );
    } catch (error) {
      return conflict(error);
    }
    return adminGet(id);
  }

  // --- Público ------------------------------------------------------------------------------------------------------

  /** Solo publicadas cuya fecha ya llegó. */
  const visible = () => ({ status: 'published' as const, publishedAt: { $lte: deps.clock() } });

  async function publicList(query: PostListQuery): Promise<PostListResponse> {
    const filter: Record<string, unknown> = { ...visible() };
    if (query.category) filter['category'] = query.category;
    if (query.featured !== undefined) filter['featured'] = query.featured;
    // Las de un libro, y también las de toda la saga.
    if (query.bookId) filter['bookId'] = { $in: [query.bookId, null] };
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ publishedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      Post.countDocuments(filter),
    ]);
    return { posts: posts.map(toCard), total, page: query.page, pageSize: query.pageSize };
  }

  async function publicGet(slug: string): Promise<PostDetail> {
    const post = await Post.findOne({ slug, ...visible() }).lean();
    if (!post) throw new AppError('NOT_FOUND', 'No encontramos esa publicación');
    return toDetail(post);
  }

  return { adminList, adminGet, create, replace, publicList, publicGet };
}

export type PostService = ReturnType<typeof createPostService>;
