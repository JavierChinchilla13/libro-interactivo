import type { FanArtInput, ReviewInput } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { FanArtService, ReviewService } from '../services/community.service.js';

/** `/fan-arts` y `/reviews`: solo lo publicado (y, en fan arts, con el permiso del artista confirmado). */
export function createPublicCommunityController(fanArts: FanArtService, reviews: ReviewService) {
  const listFanArts: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { bookId?: string }>(res);
    res
      .set('Cache-Control', 'public, max-age=60')
      .json({ fanArts: await fanArts.publicList(query.bookId) });
  };
  const listReviews: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { bookId?: string; limit: number }>(res);
    res
      .set('Cache-Control', 'public, max-age=60')
      .json({ reviews: await reviews.publicList(query.bookId, query.limit) });
  };
  return { listFanArts, listReviews };
}

interface FanArtParams {
  fanArtId: string;
}
interface ReviewParams {
  reviewId: string;
}
interface AdminFilter {
  status?: string;
  bookId?: string;
}

export function createAdminFanArtController(fanArts: FanArtService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, AdminFilter>(res);
    res.json({ fanArts: await fanArts.adminList(query) });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, FanArtParams>(res);
    res.json(await fanArts.adminGet(params.fanArtId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<FanArtInput>(res);
    res.status(201).json(await fanArts.create(getAuth(res).userId, body));
  };
  const replace: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<FanArtInput, unknown, FanArtParams>(res);
    res.json(await fanArts.replace(params.fanArtId, body));
  };
  return { list, get, create, replace };
}

export function createAdminReviewController(reviews: ReviewService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, AdminFilter>(res);
    res.json({ reviews: await reviews.adminList(query) });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, ReviewParams>(res);
    res.json(await reviews.adminGet(params.reviewId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<ReviewInput>(res);
    res.status(201).json(await reviews.create(getAuth(res).userId, body));
  };
  const replace: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<ReviewInput, unknown, ReviewParams>(res);
    res.json(await reviews.replace(params.reviewId, body));
  };
  return { list, get, create, replace };
}
