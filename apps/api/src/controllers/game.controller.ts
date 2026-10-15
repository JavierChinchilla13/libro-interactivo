import type { GameChoiceRequest } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { GameService } from '../services/game.service.js';

export function createGameController(game: GameService) {
  const start: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, { bookId: string }>(res);
    res.json(await game.start(getAuth(res), params.bookId));
  };

  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, { sessionId: string }>(res);
    res.json(await game.get(getAuth(res), params.sessionId));
  };

  const choose: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<GameChoiceRequest, unknown, { sessionId: string }>(res);
    res.json(await game.choose(getAuth(res), params.sessionId, body.choiceId));
  };

  const listStories: RequestHandler = async (req, res) => {
    const bookId = typeof req.query['bookId'] === 'string' ? req.query['bookId'] : undefined;
    res.json(await game.listStories(bookId));
  };

  return { start, get, choose, listStories };
}
