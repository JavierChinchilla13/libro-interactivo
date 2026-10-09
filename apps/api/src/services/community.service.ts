import type {
  AdminFanArt,
  AdminReview,
  FanArtInput,
  ImageRef,
  PublicFanArt,
  PublicReview,
  ReviewInput,
} from '@libro/shared';
import { AppError } from '../lib/errors.js';
import { assertCloudinaryUrls } from '../lib/images.js';
import { Book } from '../models/Book.js';
import { FanArt } from '../models/FanArt.js';
import { Review } from '../models/Review.js';

type FanArtLean = NonNullable<Awaited<ReturnType<typeof loadFanArt>>>;
type ReviewLean = NonNullable<Awaited<ReturnType<typeof loadReview>>>;

async function loadFanArt(id: string) {
  return FanArt.findById(id).lean();
}
async function loadReview(id: string) {
  return Review.findById(id).lean();
}

async function assertBook(bookId: string | undefined) {
  if (bookId && !(await Book.exists({ _id: bookId }))) {
    throw new AppError('NOT_FOUND', 'No encontramos ese libro');
  }
}

/** Las de un libro, y también las de toda la saga. */
const forBook = (bookId: string | undefined) => (bookId ? { bookId: { $in: [bookId, null] } } : {});

function toPublicFanArt(art: FanArtLean): PublicFanArt {
  return {
    id: art._id.toString(),
    ...(art.title ? { title: art.title } : {}),
    image: art.image as ImageRef,
    artistName: art.artistName,
    ...(art.artistLink ? { artistLink: art.artistLink } : {}),
    ...(art.bookId ? { bookId: art.bookId.toString() } : {}),
    order: art.order,
  };
}

function toAdminFanArt(art: FanArtLean): AdminFanArt {
  return {
    ...toPublicFanArt(art),
    permissionConfirmed: art.permissionConfirmed,
    ...(art.permissionNote ? { permissionNote: art.permissionNote } : {}),
    status: art.status,
    createdAt: art.createdAt.toISOString(),
    updatedAt: art.updatedAt.toISOString(),
  };
}

function toPublicReview(review: ReviewLean): PublicReview {
  return {
    id: review._id.toString(),
    text: review.text,
    authorName: review.authorName,
    ...(review.source ? { source: review.source } : {}),
    ...(review.rating ? { rating: review.rating } : {}),
    ...(review.bookId ? { bookId: review.bookId.toString() } : {}),
    order: review.order,
  };
}

function toAdminReview(review: ReviewLean): AdminReview {
  return {
    ...toPublicReview(review),
    status: review.status,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

/** Quita las claves sin valor (`$unset`) y deja las que sí lo tienen (`$set`) al reemplazar un documento. */
function setAndUnset(doc: Record<string, unknown>) {
  const set = Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined));
  const unset = Object.fromEntries(
    Object.entries(doc)
      .filter(([, value]) => value === undefined)
      .map(([key]) => [key, 1]),
  );
  return { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) };
}

/**
 * Fan arts. La autora los carga y archiva; el público solo ve los **publicados con el permiso del artista
 * confirmado** (se comprueban las dos cosas aunque el estado diga «publicado»). Nada se borra.
 */
export function createFanArtService() {
  const document = (input: FanArtInput) => ({
    bookId: input.bookId,
    title: input.title || undefined,
    image: input.image,
    artistName: input.artistName,
    artistLink: input.artistLink,
    permissionConfirmed: input.permissionConfirmed,
    permissionNote: input.permissionNote || undefined,
    order: input.order,
    status: input.status,
  });

  async function prepare(input: FanArtInput) {
    await assertBook(input.bookId);
    assertCloudinaryUrls([input.image.url]);
    return document(input);
  }

  async function adminList(filter: { status?: string | undefined; bookId?: string | undefined }) {
    const query: Record<string, unknown> = {};
    if (filter.status) query['status'] = filter.status;
    if (filter.bookId) query['bookId'] = filter.bookId;
    const arts = await FanArt.find(query).sort({ order: 1, _id: 1 }).lean();
    return arts.map(toAdminFanArt);
  }

  async function adminGet(id: string): Promise<AdminFanArt> {
    const art = await loadFanArt(id);
    if (!art) throw new AppError('NOT_FOUND', 'No encontramos ese fan art');
    return toAdminFanArt(art);
  }

  async function create(userId: string, input: FanArtInput): Promise<AdminFanArt> {
    const art = await FanArt.create({ ...(await prepare(input)), createdBy: userId });
    return adminGet(art._id.toString());
  }

  async function replace(id: string, input: FanArtInput): Promise<AdminFanArt> {
    if (!(await FanArt.exists({ _id: id }))) {
      throw new AppError('NOT_FOUND', 'No encontramos ese fan art');
    }
    await FanArt.updateOne({ _id: id }, setAndUnset(await prepare(input)));
    return adminGet(id);
  }

  async function publicList(bookId: string | undefined): Promise<PublicFanArt[]> {
    const arts = await FanArt.find({
      status: 'published',
      permissionConfirmed: true,
      ...forBook(bookId),
    })
      .sort({ order: 1, _id: 1 })
      .limit(200)
      .lean();
    return arts.map(toPublicFanArt);
  }

  return { adminList, adminGet, create, replace, publicList };
}

/** Reseñas de lectores cargadas por la autora; el público ve solo las publicadas. */
export function createReviewService() {
  const document = (input: ReviewInput) => ({
    bookId: input.bookId,
    text: input.text,
    authorName: input.authorName,
    source: input.source || undefined,
    rating: input.rating,
    order: input.order,
    status: input.status,
  });

  async function adminList(filter: { status?: string | undefined; bookId?: string | undefined }) {
    const query: Record<string, unknown> = {};
    if (filter.status) query['status'] = filter.status;
    if (filter.bookId) query['bookId'] = filter.bookId;
    const reviews = await Review.find(query).sort({ order: 1, _id: 1 }).lean();
    return reviews.map(toAdminReview);
  }

  async function adminGet(id: string): Promise<AdminReview> {
    const review = await loadReview(id);
    if (!review) throw new AppError('NOT_FOUND', 'No encontramos esa reseña');
    return toAdminReview(review);
  }

  async function create(userId: string, input: ReviewInput): Promise<AdminReview> {
    await assertBook(input.bookId);
    const review = await Review.create({ ...document(input), createdBy: userId });
    return adminGet(review._id.toString());
  }

  async function replace(id: string, input: ReviewInput): Promise<AdminReview> {
    if (!(await Review.exists({ _id: id }))) {
      throw new AppError('NOT_FOUND', 'No encontramos esa reseña');
    }
    await assertBook(input.bookId);
    await Review.updateOne({ _id: id }, setAndUnset(document(input)));
    return adminGet(id);
  }

  async function publicList(bookId: string | undefined, limit: number): Promise<PublicReview[]> {
    const reviews = await Review.find({ status: 'published', ...forBook(bookId) })
      .sort({ order: 1, _id: 1 })
      .limit(limit)
      .lean();
    return reviews.map(toPublicReview);
  }

  return { adminList, adminGet, create, replace, publicList };
}

export type FanArtService = ReturnType<typeof createFanArtService>;
export type ReviewService = ReturnType<typeof createReviewService>;
