import type { CardInput, CardReorderRequest, CardUploadSignatureRequest } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { CardService } from '../services/card.service.js';

interface CardParams {
  cardId: string;
}

/** `/admin/cards`: cartas con QR, solo administradores. La firma de subida no se guarda en cachés. */
export function createAdminCardController(cards: CardService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, { bookId: string }>(res);
    res.set('Cache-Control', 'private, no-store').json({ cards: await cards.list(query.bookId) });
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, CardParams>(res);
    res.set('Cache-Control', 'private, no-store').json(await cards.get(params.cardId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<CardInput>(res);
    res.status(201).json(await cards.create(getAuth(res).userId, body));
  };
  const replace: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<CardInput, unknown, CardParams>(res);
    res.json(await cards.replace(params.cardId, body));
  };
  const reorder: RequestHandler = async (_req, res) => {
    const { body } = getInput<CardReorderRequest>(res);
    res.json({ cards: await cards.reorder(body) });
  };
  const uploadSignature: RequestHandler = async (_req, res) => {
    const { body } = getInput<CardUploadSignatureRequest>(res);
    res.set('Cache-Control', 'no-store').json(await cards.signUpload(body.bookId));
  };
  return { list, get, create, replace, reorder, uploadSignature };
}

/** `/cards`: lo que ve el lector. Siempre `private, no-store`: la URL de la imagen no se cachea en ningún lado. */
export function createReaderCardController(cards: CardService) {
  const list: RequestHandler = async (_req, res) => {
    const { userId, role } = getAuth(res);
    res.set('Cache-Control', 'private, no-store').json(await cards.listForReader({ userId, role }));
  };
  const open: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, CardParams>(res);
    const { userId, role } = getAuth(res);
    res
      .set('Cache-Control', 'private, no-store')
      .json(await cards.openForReader({ userId, role }, params.cardId));
  };
  return { list, open };
}
