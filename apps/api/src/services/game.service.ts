import type { AdminGameStoriesResponse, GameSessionResponse } from '@libro/shared';
import { applyChoice, indexScenes, toPublicScene, type Story } from '@libro/game-core';
import { Types } from 'mongoose';
import { addDays, type Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { GameSession, type GameSessionDoc } from '../models/GameSession.js';
import { GameStory } from '../models/GameStory.js';
import { isStaff, type Actor, type ProgressService } from './progress.service.js';

export interface GameDeps {
  progress: ProgressService;
  clock: Clock;
}

/** Una partida abandonada se limpia sola pasado este tiempo (TTL). */
const SESSION_TTL_DAYS = 30;

type StoryLean = {
  _id: Types.ObjectId;
  bookId: Types.ObjectId;
  title: string;
  startSceneId: string;
  scenes: unknown;
  endings: unknown;
};

function toStory(doc: StoryLean): Story {
  return {
    title: doc.title,
    startSceneId: doc.startSceneId,
    scenes: doc.scenes as Story['scenes'],
    endings: doc.endings as Story['endings'],
  };
}

/**
 * Juego (Nivel A). El servidor es la autoridad: entrega UNA escena a la vez, sin los destinos de las decisiones, y solo
 * deja elegir entre las decisiones de la escena actual. Cada partida fija la versión de la historia con la que empezó.
 */
export function createGameService(deps: GameDeps) {
  const { progress, clock } = deps;

  async function storyOfSession(session: Pick<GameSessionDoc, 'storyId'>) {
    const doc = await GameStory.findById(session.storyId).lean();
    if (!doc) throw new AppError('NOT_FOUND', 'No encontramos ese juego');
    return { doc: doc as unknown as StoryLean, story: toStory(doc as unknown as StoryLean) };
  }

  function respond(
    session: Pick<
      GameSessionDoc,
      'id' | 'bookId' | 'status' | 'attemptNumber' | 'isTest' | 'currentSceneId'
    >,
    title: string,
    story: Story,
  ): GameSessionResponse {
    const scene = indexScenes(story).get(session.currentSceneId);
    if (!scene) throw new AppError('INTERNAL', 'La escena actual no existe en la historia');
    return {
      sessionId: session.id,
      bookId: session.bookId.toString(),
      title,
      status: session.status,
      attemptNumber: session.attemptNumber,
      isTest: session.isTest,
      scene: toPublicScene(story, scene),
    };
  }

  /** La partida debe ser de la persona (o, para el personal, una de prueba suya). Mismo 404 si no existe o es ajena. */
  async function ownSession(actor: Actor, sessionId: string): Promise<GameSessionDoc> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new AppError('NOT_FOUND', 'No encontramos esa partida');
    }
    const session = await GameSession.findOne({ _id: sessionId, userId: actor.userId });
    if (!session) throw new AppError('NOT_FOUND', 'No encontramos esa partida');
    return session;
  }

  return {
    /**
     * Inicia la partida del libro (o reanuda la que está en curso). Exige que el juego esté desbloqueado. El personal
     * del sitio juega partidas de prueba que no cuentan.
     */
    async start(actor: Actor, bookId: string): Promise<GameSessionResponse> {
      if (!Types.ObjectId.isValid(bookId))
        throw new AppError('NOT_FOUND', 'No encontramos ese juego');
      const storyDoc = (await progress.assertGameAccess(actor, bookId)) as unknown as StoryLean;
      const story = toStory(storyDoc);
      const isTest = isStaff(actor.role);

      const open = await GameSession.findOne({
        userId: actor.userId,
        bookId,
        status: 'in_progress',
        isTest,
      });
      if (open && open.storyId.toString() === storyDoc._id.toString()) {
        return respond(open, storyDoc.title, story);
      }
      if (open) {
        // La historia cambió de versión: la partida vieja se cierra y se empieza de nuevo.
        open.status = 'abandoned';
        open.endedAt = clock();
        open.set('expireAt', undefined);
        await open.save();
      }

      const attemptNumber =
        (await GameSession.countDocuments({ userId: actor.userId, bookId, isTest })) + 1;
      const now = clock();
      try {
        const session = await GameSession.create({
          userId: actor.userId,
          bookId,
          storyId: storyDoc._id,
          storyVersion: 1,
          attemptNumber,
          status: 'in_progress',
          currentSceneId: story.startSceneId,
          path: [],
          isTest,
          startedAt: now,
          expireAt: addDays(now, SESSION_TTL_DAYS),
        });
        return respond(session, storyDoc.title, story);
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // Dos inicios simultáneos: gana el índice único y el segundo reanuda esa partida.
        const existing = await GameSession.findOne({
          userId: actor.userId,
          bookId,
          status: 'in_progress',
          isTest,
        });
        if (!existing) throw error;
        return respond(existing, storyDoc.title, story);
      }
    },

    /** Escena actual (reanudar). */
    async get(actor: Actor, sessionId: string): Promise<GameSessionResponse> {
      const session = await ownSession(actor, sessionId);
      const { doc, story } = await storyOfSession(session);
      return respond(session, doc.title, story);
    },

    /**
     * Aplica una decisión. 404 si la partida no es suya, 409 si ya terminó, 400 si la decisión no es de la escena actual.
     * La actualización está condicionada a la escena actual: un doble envío no avanza dos veces.
     */
    async choose(actor: Actor, sessionId: string, choiceId: string): Promise<GameSessionResponse> {
      const session = await ownSession(actor, sessionId);
      if (session.status !== 'in_progress') {
        throw new AppError('CONFLICT', 'Esta partida ya terminó. Empieza una nueva.');
      }
      const { doc, story } = await storyOfSession(session);
      const result = applyChoice(story, session.currentSceneId, choiceId);
      if (!result.ok) {
        throw new AppError('VALIDATION', 'Esa decisión no corresponde a la escena actual');
      }
      const now = clock();
      const status = result.ending
        ? result.ending.kind === 'completed'
          ? ('completed' as const)
          : ('failed' as const)
        : ('in_progress' as const);

      const updated = await GameSession.findOneAndUpdate(
        { _id: session._id, status: 'in_progress', currentSceneId: session.currentSceneId },
        {
          $set: {
            currentSceneId: result.scene.id,
            status,
            ...(result.ending ? { endingKey: result.ending.key, endedAt: now } : {}),
          },
          $push: { path: { sceneId: session.currentSceneId, choiceId, at: now } },
          ...(result.ending ? { $unset: { expireAt: 1 } } : {}),
        },
        { returnDocument: 'after' },
      );
      if (!updated) {
        // Otra petición ya avanzó la partida: se devuelve su estado actual (el doble envío es inofensivo).
        const current = await ownSession(actor, sessionId);
        return respond(current, doc.title, story);
      }
      if (status === 'completed' && !session.isTest && result.ending) {
        await progress.recordGameCompletion({
          userId: actor.userId,
          bookId: session.bookId.toString(),
          storyId: session.storyId.toString(),
          sessionId: session.id,
          endingKey: result.ending.key,
          at: now,
        });
      }
      return respond(updated, doc.title, story);
    },

    /** Panel (solo lectura): historias cargadas por libro. */
    async listStories(bookId?: string): Promise<AdminGameStoriesResponse> {
      const stories = await GameStory.find(bookId ? { bookId } : {})
        .sort({ bookId: 1, version: -1 })
        .lean();
      return {
        stories: stories.map((story) => ({
          id: story._id.toString(),
          bookId: story.bookId.toString(),
          version: story.version,
          status: story.status,
          title: story.title,
          sceneCount: Array.isArray(story.scenes) ? story.scenes.length : 0,
          endingCount: Array.isArray(story.endings) ? story.endings.length : 0,
          sourceHash: story.sourceHash,
        })),
      };
    },
  };
}

export type GameService = ReturnType<typeof createGameService>;
