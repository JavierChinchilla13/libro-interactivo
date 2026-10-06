import type { CreateAccessTokenRequest, ExtraInput, ExtraUploadUrlRequest } from '@libro/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { AccessService } from '../services/access.service.js';
import type { ExtraService } from '../services/extra.service.js';

/** Mensaje único para cualquier código que no sirva (inexistente, alterado, revocado, sin publicar). */
const INVALID_CODE = 'Este código no es válido';

export function createAccessController(access: AccessService) {
  const resolve: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, { token: string }>(res);
    const found = await access.resolve(params.token);
    if (!found) throw new AppError('TOKEN_INVALID', INVALID_CODE);
    res.set('Cache-Control', 'no-store').json(found);
  };

  const redeem: RequestHandler = async (_req, res) => {
    const { body } = getInput<{ token: string }>(res);
    const redeemed = await access.redeem(getAuth(res).userId, body.token);
    if (!redeemed) throw new AppError('TOKEN_INVALID', INVALID_CODE);
    res.set('Cache-Control', 'no-store').json(redeemed);
  };

  return { resolve, redeem };
}

interface TokenParams {
  tokenId: string;
}

export function createAdminAccessController(access: AccessService) {
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<CreateAccessTokenRequest>(res);
    res.status(201).json(await access.create(getAuth(res), body));
  };
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { bookId?: string }>(res);
    res.json({ tokens: await access.list(query.bookId) });
  };
  const revoke: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<{ reason?: string }, unknown, TokenParams>(res);
    res.json(await access.revoke(getAuth(res), params.tokenId, body.reason));
  };
  const rotate: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, TokenParams>(res);
    res.status(201).json(await access.rotate(getAuth(res), params.tokenId));
  };
  // El archivo contiene el token: nunca se guarda en cachés.
  const svg: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, TokenParams>(res);
    const file = await access.downloadSvg(params.tokenId);
    res
      .set({
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      })
      .send(file.body);
  };
  const pdf: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, TokenParams>(res);
    const file = await access.downloadPdf(params.tokenId);
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      })
      .send(file.body);
  };
  return { create, list, revoke, rotate, svg, pdf };
}

interface ExtraParams {
  extraId: string;
}

export function createAdminExtraController(extras: ExtraService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { bookId: string }>(res);
    res.json({ extras: await extras.list(query.bookId) });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, ExtraParams>(res);
    res.json(await extras.get(params.extraId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<ExtraInput>(res);
    res.status(201).json(await extras.create(body));
  };
  const replace: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<ExtraInput, unknown, ExtraParams>(res);
    res.json(await extras.replace(params.extraId, body));
  };
  const uploadUrl: RequestHandler = async (_req, res) => {
    const { body } = getInput<ExtraUploadUrlRequest>(res);
    res.set('Cache-Control', 'no-store').json(await extras.createUploadUrl(body));
  };
  const preview: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, ExtraParams>(res);
    res.set('Cache-Control', 'no-store').json(await extras.preview(params.extraId));
  };
  return { list, get, create, replace, uploadUrl, preview };
}

export function createReaderExtraController(extras: ExtraService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { bookId: string }>(res);
    res
      .set('Cache-Control', 'no-store')
      .json(await extras.listForReader(getAuth(res).userId, query.bookId));
  };
  const open: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, ExtraParams>(res);
    res
      .set('Cache-Control', 'no-store')
      .json(await extras.open(getAuth(res).userId, params.extraId));
  };
  return { list, open };
}
