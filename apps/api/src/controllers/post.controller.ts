import type { PostInput, PostListQuery } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { PostService } from '../services/post.service.js';

/** `/posts`: las actualizaciones que ya se pueden ver (publicadas y con la fecha cumplida). */
export function createPublicPostController(posts: PostService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, PostListQuery>(res);
    res.set('Cache-Control', 'public, max-age=60').json(await posts.publicList(query));
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, { slug: string }>(res);
    res.set('Cache-Control', 'public, max-age=60').json(await posts.publicGet(params.slug));
  };
  return { list, get };
}

interface PostParams {
  postId: string;
}

export function createAdminPostController(posts: PostService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { status?: string; category?: string; q?: string }>(res);
    res.json({ posts: await posts.adminList(query) });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, PostParams>(res);
    res.json(await posts.adminGet(params.postId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<PostInput>(res);
    res.status(201).json(await posts.create(getAuth(res).userId, body));
  };
  const replace: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<PostInput, unknown, PostParams>(res);
    res.json(await posts.replace(params.postId, body));
  };
  return { list, get, create, replace };
}
