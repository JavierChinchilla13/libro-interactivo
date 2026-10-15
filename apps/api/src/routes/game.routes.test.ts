import {
  adminGameStoryResponseSchema,
  apiErrorSchema,
  gameSessionResponseSchema,
  progressResponseSchema,
  type GameSessionResponse,
} from '@libro/shared';
import { libro1Story } from '@libro/game-core';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../models/GameSession.js';
import { UserProgress } from '../models/UserProgress.js';
import { seedGameStory } from '../seed/gameStory.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

async function world(env: Record<string, string> = {}) {
  const harness = createTestHarness({ env });
  const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const user = await createUser();
  const book = await createBook();
  const story = await seedGameStory({ bookId: book.id, story: libro1Story });
  return { ...harness, admin, user, book, story, agent: await loginAgent(harness.app) };
}

const start = async (agent: TestAgent, bookId: string): Promise<GameSessionResponse> => {
  const res = await agent.post(`/api/game/${bookId}/sessions`).expect(200);
  return gameSessionResponseSchema.parse(res.body);
};

const choose = (agent: TestAgent, sessionId: string, choiceId: string) =>
  agent.post(`/api/game/sessions/${sessionId}/choices`).send({ choiceId });

const play = async (agent: TestAgent, bookId: string, choices: string[]) => {
  let session = await start(agent, bookId);
  for (const choiceId of choices) {
    const res = await choose(agent, session.sessionId, choiceId).expect(200);
    session = gameSessionResponseSchema.parse(res.body);
  }
  return session;
};

const WIN = ['derecha', 'escaleras', 'ruta-a', 'esconderse', 'seguir'];

describe('juego: acceso', () => {
  it('exige sesión', async () => {
    const { app, book } = await world();
    await request(app).post(`/api/game/${book.id}/sessions`).expect(401);
    await request(app).get('/api/game/sessions/670000000000000000000001').expect(401);
    await request(app)
      .post('/api/game/sessions/670000000000000000000001/choices')
      .send({ choiceId: 'x' })
      .expect(401);
  });

  it('valida identificadores y responde 404 si el libro no tiene juego', async () => {
    const { agent } = await world();
    expect((await agent.post('/api/game/no-es-un-id/sessions')).status).toBe(400);
    const res = await agent.post('/api/game/670000000000000000000099/sessions');
    expect(res.status).toBe(404);
  });

  it('responde 403 NOT_UNLOCKED sin contenido mientras falte un quiz y abre al completarlo', async () => {
    const { agent, admin, book, user } = await world();
    const quiz = await createQuiz({
      bookId: book._id,
      order: 1,
      content: simpleContent({ title: '[PLACEHOLDER] Quiz 1' }),
      publishedBy: admin._id,
    });
    const res = await agent.post(`/api/game/${book.id}/sessions`);
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_UNLOCKED');
    expect(JSON.stringify(res.body)).not.toContain('PLACEHOLDER');

    const intro = await agent.get(`/api/quizzes/${quiz.id}`).expect(200);
    expect(intro.body).toBeTruthy();
    await UserProgress.create({
      userId: user._id,
      bookId: book._id,
      completed: [
        { kind: 'quiz', refId: quiz._id, firstCompletedAt: new Date(), currentAttemptId: quiz._id },
      ],
    });
    expect((await agent.post(`/api/game/${book.id}/sessions`)).status).toBe(200);
  });

  it('con QR obligatorio exige canjear el código del juego', async () => {
    const { agent, book, story, user } = await world({ REQUIRE_QR_UNLOCK: 'true' });
    expect((await agent.post(`/api/game/${book.id}/sessions`)).status).toBe(403);
    await UserProgress.create({
      userId: user._id,
      bookId: book._id,
      unlocked: [{ kind: 'game', refId: story.id, at: new Date() }],
    });
    expect((await agent.post(`/api/game/${book.id}/sessions`)).status).toBe(200);
  });
});

describe('juego: partida', () => {
  it('entrega solo la escena inicial y nunca revela a dónde lleva cada decisión', async () => {
    const { agent, book } = await world();
    const session = await start(agent, book.id);
    expect(session.status).toBe('in_progress');
    expect(session.scene.id).toBe('s01-pasillos');
    expect(session.scene.choices.map((c) => c.id)).toEqual(['derecha', 'izquierda']);
    const raw = JSON.stringify(session);
    expect(raw).not.toContain('nextSceneId');
    expect(raw).not.toContain('fin-derrumbe');
    expect(raw).not.toContain('s02-plantas');
  });

  it('recorre una ruta buena hasta la evacuación y registra el avance', async () => {
    const { agent, book, user } = await world();
    const done = await play(agent, book.id, WIN);
    expect(done.status).toBe('completed');
    expect(done.scene.ending).toMatchObject({ key: 'evacuacion', kind: 'completed' });
    expect(done.scene.choices).toEqual([]);

    const progress = await UserProgress.findOne({ userId: user._id, bookId: book._id }).lean();
    expect(progress?.completed.map((c) => c.kind)).toContain('game');
    expect(progress?.bookCompletedAt).toBeInstanceOf(Date);
    const view = await agent.get('/api/me/progress').query({ bookId: book.id }).expect(200);
    const parsed = progressResponseSchema.parse(view.body);
    expect(parsed.experiences.at(-1)).toMatchObject({ kind: 'game', status: 'completed' });
    expect(parsed.bookCompleted).toBe(true);
  });

  it('una mala decisión termina en un final fallido y permite empezar de nuevo', async () => {
    const { agent, book } = await world();
    const failed = await play(agent, book.id, ['izquierda']);
    expect(failed.status).toBe('failed');
    expect(failed.scene.ending).toMatchObject({ key: 'derrumbe', kind: 'failed' });
    // La partida terminada no acepta más decisiones.
    const after = await choose(agent, failed.sessionId, 'derecha');
    expect(after.status).toBe(409);
    // Nueva partida desde el inicio, con otro número de intento.
    const again = await start(agent, book.id);
    expect(again.sessionId).not.toBe(failed.sessionId);
    expect(again.attemptNumber).toBe(2);
    expect(again.scene.id).toBe('s01-pasillos');
  });

  it('rechaza una decisión que no pertenece a la escena actual y no avanza', async () => {
    const { agent, book } = await world();
    const session = await start(agent, book.id);
    const res = await choose(agent, session.sessionId, 'esconderse');
    expect(res.status).toBe(400);
    const same = await agent.get(`/api/game/sessions/${session.sessionId}`).expect(200);
    expect(gameSessionResponseSchema.parse(same.body).scene.id).toBe('s01-pasillos');
  });

  it('reanuda la partida en curso en lugar de crear otra', async () => {
    const { agent, book } = await world();
    const first = await start(agent, book.id);
    await choose(agent, first.sessionId, 'derecha').expect(200);
    const resumed = await start(agent, book.id);
    expect(resumed.sessionId).toBe(first.sessionId);
    expect(resumed.scene.id).toBe('s02-plantas');
    expect(await GameSession.countDocuments({})).toBe(1);
  });

  it('un doble envío de la misma decisión no avanza dos veces', async () => {
    const { agent, book } = await world();
    const session = await start(agent, book.id);
    const [a, b] = await Promise.all([
      choose(agent, session.sessionId, 'derecha'),
      choose(agent, session.sessionId, 'derecha'),
    ]);
    expect([a.status, b.status].every((status) => status === 200 || status === 400)).toBe(true);
    const stored = await GameSession.findById(session.sessionId).lean();
    expect(stored?.path).toHaveLength(1);
    expect(stored?.currentSceneId).toBe('s02-plantas');
  });

  it('la partida de otra persona responde 404 (sin pistas)', async () => {
    const { app, agent, book } = await world();
    const session = await start(agent, book.id);
    await createUser({ email: 'otra@ejemplo.com' });
    const other = await loginAgent(app, 'otra@ejemplo.com');
    expect((await other.get(`/api/game/sessions/${session.sessionId}`)).status).toBe(404);
    expect((await choose(other, session.sessionId, 'derecha')).status).toBe(404);
  });

  it('las partidas de prueba del personal no cuentan en el avance', async () => {
    const { app, admin, book } = await world();
    const staff = await loginAgent(app, 'admin@ejemplo.com');
    const done = await play(staff, book.id, WIN);
    expect(done.isTest).toBe(true);
    expect(done.status).toBe('completed');
    expect(await UserProgress.countDocuments({ userId: admin._id })).toBe(0);
  });

  it('el panel de administración lista la historia (solo ADMIN)', async () => {
    const { app, agent, book } = await world();
    expect((await agent.get('/api/admin/game-stories')).status).toBe(403);
    const staff = await loginAgent(app, 'admin@ejemplo.com');
    const res = await staff.get('/api/admin/game-stories').query({ bookId: book.id }).expect(200);
    const list = adminGameStoryResponseSchema.parse(res.body).stories;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'published', version: 1 });
    expect(list[0]?.sceneCount).toBeGreaterThan(10);
  });
});

describe('seed del juego', () => {
  it('es idempotente y no repite la historia', async () => {
    const { book } = await world();
    const again = await seedGameStory({ bookId: book.id, story: libro1Story });
    expect(again.created).toBe(false);
    const changed = await seedGameStory({
      bookId: book.id,
      story: { ...libro1Story, title: '[PLACEHOLDER] Otro título' },
    });
    expect(changed).toMatchObject({ created: true, version: 2 });
  });
});

describe('QR del juego', () => {
  it('se crea para la historia, se resuelve sin sesión y al canjearlo abre el juego en la cuenta', async () => {
    const { app, agent, book, story } = await world({ REQUIRE_QR_UNLOCK: 'true' });
    const staff = await loginAgent(app, 'admin@ejemplo.com');
    const created = await staff
      .post('/api/admin/access-tokens')
      .send({ kind: 'game', refId: story.id })
      .expect(201);
    expect(created.body.target).toEqual({ kind: 'game', refId: story.id });
    const dup = await staff
      .post('/api/admin/access-tokens')
      .send({ kind: 'game', refId: story.id });
    expect(dup.status).toBe(409);

    // Sin canjear, el juego está bloqueado.
    expect((await agent.post(`/api/game/${book.id}/sessions`)).status).toBe(403);

    // El código se resuelve sin sesión (solo el nombre) y al canjearlo el juego queda abierto en la cuenta.
    const { buildAccessToken } = await import('../lib/accessToken.js');
    const { parseEnv } = await import('../config/env.js');
    const token = buildAccessToken(
      created.body.id,
      parseEnv({ NODE_ENV: 'test' }).ACCESS_TOKEN_SECRET,
    );
    const resolved = await request(app).get(`/api/access/resolve/${token}`).expect(200);
    expect(resolved.body).toMatchObject({ valid: true, kind: 'game' });
    await agent.post('/api/access/redeem').send({ token }).expect(200);
    expect((await agent.post(`/api/game/${book.id}/sessions`)).status).toBe(200);
  });
});
