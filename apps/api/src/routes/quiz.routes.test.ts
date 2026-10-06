import {
  apiErrorSchema,
  attemptResponseSchema,
  progressResponseSchema,
  quizIntroResponseSchema,
  quizResultsResponseSchema,
  resultsListResponseSchema,
  type AttemptResponse,
  type QuizContent,
  type StagePayload,
} from '@libro/shared';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { UserProgress } from '../models/UserProgress.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import {
  createBook,
  createQuiz,
  publishDirect,
  simpleContent,
  twoStageContent,
} from '../test-utils/quizFixtures.js';
import { seededRandom } from '../test-utils/random.js';

useTestDb();

/** Responde cada pregunta con la respuesta número `index` (en los fixtures, la `i` suma al resultado `r{i+1}`). */
const answersAt = (stage: StagePayload, index: number) => ({
  answers: stage.questions.map((question) => ({
    questionId: question.id,
    answerId: question.answers[index]!.id,
  })),
});

const stageOf = (response: AttemptResponse): StagePayload => {
  if (response.status !== 'in_progress') throw new Error('Se esperaba una etapa en curso');
  return response.stage;
};

async function startAttempt(agent: TestAgent, quizId: string): Promise<AttemptResponse> {
  const res = await agent.post(`/api/quizzes/${quizId}/attempts`).expect(200);
  return attemptResponseSchema.parse(res.body);
}

async function submit(agent: TestAgent, attemptId: string, stage: StagePayload, index: number) {
  const res = await agent
    .post(`/api/attempts/${attemptId}/stages/${stage.stageId}/answers`)
    .send(answersAt(stage, index))
    .expect(200);
  return attemptResponseSchema.parse(res.body);
}

/** Juega un quiz de una etapa de principio a fin eligiendo siempre la respuesta `index`. */
async function playSimple(agent: TestAgent, quizId: string, index = 0) {
  const started = await startAttempt(agent, quizId);
  return submit(agent, started.attemptId, stageOf(started), index);
}

async function world(
  options: { random?: ReturnType<typeof seededRandom>; env?: Record<string, string> } = {},
) {
  const harness = createTestHarness({
    ...(options.random ? { random: options.random } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const user = await createUser();
  const book = await createBook();
  const make = (
    order: number,
    content: QuizContent = simpleContent({ title: `[PLACEHOLDER] Quiz ${order}` }),
  ) => createQuiz({ bookId: book._id, order, content, publishedBy: admin._id });
  return { ...harness, admin, user, book, make, agent: await loginAgent(harness.app) };
}

async function codeOf(res: request.Response) {
  return apiErrorSchema.parse(res.body).error.code;
}

describe('acceso a los quizzes', () => {
  it('exige sesión en todos los endpoints del lector', async () => {
    const { app, make } = await world();
    const quiz = await make(1);
    const id = quiz._id.toString();
    await request(app).get(`/api/quizzes/${id}`).expect(401);
    await request(app).post(`/api/quizzes/${id}/attempts`).expect(401);
    await request(app)
      .post(`/api/attempts/${id}/stages/etapa-1/answers`)
      .send({ answers: [] })
      .expect(401);
    await request(app).get('/api/me/results').query({ bookId: id }).expect(401);
    await request(app).get(`/api/me/results/${id}`).expect(401);
    await request(app).get('/api/me/progress').query({ bookId: id }).expect(401);
  });

  it('valida los parámetros con 400 y responde 404 para un quiz inexistente o sin publicar', async () => {
    const { agent, book } = await world();
    expect((await agent.get('/api/quizzes/no-es-un-id')).status).toBe(400);
    expect((await agent.get('/api/quizzes/670000000000000000000099')).status).toBe(404);
    const draft = await createQuiz({ bookId: book._id, order: 9, content: simpleContent() });
    expect((await agent.get(`/api/quizzes/${draft._id.toString()}`)).status).toBe(404);
  });

  it('no abre un quiz de un libro sin publicar', async () => {
    const { agent, make, book } = await world();
    const quiz = await make(1);
    await book.updateOne({ status: 'draft' });
    expect((await agent.get(`/api/quizzes/${quiz._id.toString()}`)).status).toBe(404);
  });

  it('un quiz posterior responde 403 NOT_UNLOCKED SIN contenido hasta completar el anterior', async () => {
    const { agent, make } = await world();
    const first = await make(1);
    const second = await make(2, simpleContent({ title: '[PLACEHOLDER] Segundo secreto' }));
    const secondId = second._id.toString();

    for (const res of [
      await agent.get(`/api/quizzes/${secondId}`),
      await agent.post(`/api/quizzes/${secondId}/attempts`),
    ]) {
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('NOT_UNLOCKED');
      expect(JSON.stringify(res.body)).not.toMatch(/secreto|etapa|pregunta|resultKey/i);
    }
    expect(await QuizAttempt.countDocuments()).toBe(0);

    await playSimple(agent, first._id.toString());
    const intro = quizIntroResponseSchema.parse(
      (await agent.get(`/api/quizzes/${secondId}`).expect(200)).body,
    );
    expect(intro.title).toBe('[PLACEHOLDER] Segundo secreto');
  });

  it('no se puede saltar la progresión con un intento ya iniciado ni con un id ajeno', async () => {
    const { app, agent, make, user } = await world();
    const first = await make(1);
    const started = await startAttempt(agent, first._id.toString());
    // Otra persona no puede responder en el intento de esta.
    await createUser({ email: 'otra@ejemplo.com' });
    const other = await loginAgent(app, 'otra@ejemplo.com');
    const res = await other
      .post(`/api/attempts/${started.attemptId}/stages/etapa-1/answers`)
      .send(answersAt(stageOf(started), 0));
    expect(res.status).toBe(404);
    expect(await QuizAttempt.countDocuments({ userId: user._id, status: 'completed' })).toBe(0);
  });
});

describe('POST /api/quizzes/:id/attempts', () => {
  it('entrega las preguntas barajadas por el servidor y SIN resultKey ni resultados', async () => {
    const { agent, make } = await world({ random: seededRandom(5) });
    const quiz = await make(1, simpleContent({ questions: 8, results: 4 }));
    const res = await agent.post(`/api/quizzes/${quiz._id.toString()}/attempts`).expect(200);
    const started = attemptResponseSchema.parse(res.body);
    const stage = stageOf(started);

    const defined = quiz.draft?.stages as { questions: { id: string }[] }[];
    const original = defined[0]!.questions.map((question) => question.id);
    expect(stage.questions.map((question) => question.id).sort()).toEqual([...original].sort());
    expect(stage.questions.map((question) => question.id)).not.toEqual(original);

    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/resultKey|"r[1-4]"|Descripci|reveal|facts|media|distribution/);
  });

  it('reanuda el intento abierto con el mismo orden, sin crear otro', async () => {
    const { agent, make } = await world();
    const quiz = await make(1, simpleContent({ questions: 8 }));
    const a = await startAttempt(agent, quiz._id.toString());
    const b = await startAttempt(agent, quiz._id.toString());
    expect(b.attemptId).toBe(a.attemptId);
    expect(stageOf(b).questions.map((q) => q.id)).toEqual(stageOf(a).questions.map((q) => q.id));
    expect(await QuizAttempt.countDocuments()).toBe(1);
  });

  it('dos "iniciar" simultáneos terminan en un solo intento abierto', async () => {
    const { agent, make } = await world();
    const quiz = await make(1);
    const url = `/api/quizzes/${quiz._id.toString()}/attempts`;
    const results = await Promise.all([agent.post(url), agent.post(url), agent.post(url)]);
    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(new Set(results.map((res) => (res.body as { attemptId: string }).attemptId)).size).toBe(
      1,
    );
    expect(await QuizAttempt.countDocuments()).toBe(1);
  });

  it('el intento abierto tiene expireAt (TTL) y al completarlo desaparece', async () => {
    const { agent, make } = await world();
    const quiz = await make(1);
    const started = await startAttempt(agent, quiz._id.toString());
    expect((await QuizAttempt.findById(started.attemptId))?.expireAt).toBeInstanceOf(Date);
    await submit(agent, started.attemptId, stageOf(started), 0);
    const done = await QuizAttempt.findById(started.attemptId).lean();
    expect(done?.status).toBe('completed');
    expect(done?.expireAt).toBeUndefined();
  });
});

describe('responder y obtener el resultado', () => {
  it('cuenta, devuelve el resultado ganador y registra el progreso', async () => {
    const { agent, make, user } = await world();
    const quiz = await make(1);
    const completed = await playSimple(agent, quiz._id.toString(), 1); // todo "b" → r2
    expect(completed.status).toBe('completed');
    if (completed.status !== 'completed') return;
    expect(completed.result).toMatchObject({ key: 'r2', title: '[PLACEHOLDER] r2' });
    expect(completed.result.distribution).toBeUndefined();

    const attempt = await QuizAttempt.findById(completed.attemptId).lean();
    expect(attempt).toMatchObject({
      status: 'completed',
      finalResultKey: 'r2',
      isTest: false,
      attemptNumber: 1,
    });
    expect(attempt?.stages[0]?.tally).toEqual([{ resultKey: 'r2', count: 3 }]);

    const progress = await UserProgress.findOne({ userId: user._id }).lean();
    expect(progress?.completed).toHaveLength(1);
    expect(progress?.completed[0]).toMatchObject({ kind: 'quiz', currentResultKey: 'r2' });
    expect(progress?.bookCompletedAt).toBeUndefined();
  });

  it('el empate se resuelve entre los empatados y queda registrado', async () => {
    const { agent, make } = await world({ random: seededRandom(11) });
    const quiz = await make(1, simpleContent({ questions: 2, results: 3 }));
    const started = await startAttempt(agent, quiz._id.toString());
    const stage = stageOf(started);
    const [q1, q2] = stage.questions;
    const res = await agent
      .post(`/api/attempts/${started.attemptId}/stages/${stage.stageId}/answers`)
      .send({
        answers: [
          { questionId: q1!.id, answerId: q1!.answers[0]!.id },
          { questionId: q2!.id, answerId: q2!.answers[2]!.id },
        ],
      })
      .expect(200);
    const body = attemptResponseSchema.parse(res.body);
    if (body.status !== 'completed') throw new Error('Debía completarse');
    expect(['r1', 'r3']).toContain(body.result.key);
    const attempt = await QuizAttempt.findById(started.attemptId).lean();
    expect(attempt?.stages[0]?.tiedKeys?.sort()).toEqual(['r1', 'r3']);
  });

  it('rechaza respuestas incompletas, repetidas, ajenas o de otra pregunta con 400', async () => {
    const { agent, make } = await world();
    const quiz = await make(1);
    const started = await startAttempt(agent, quiz._id.toString());
    const stage = stageOf(started);
    const url = `/api/attempts/${started.attemptId}/stages/${stage.stageId}/answers`;
    const [q1, q2, q3] = stage.questions;
    const a = (q: typeof q1, i: number) => ({ questionId: q!.id, answerId: q!.answers[i]!.id });

    const bodies = [
      { answers: [a(q1, 0), a(q2, 0)] }, // falta una
      { answers: [a(q1, 0), a(q1, 1), a(q2, 0), a(q3, 0)] }, // repetida
      { answers: [a(q1, 0), a(q2, 0), { questionId: 'inventada', answerId: 'x' }] },
      { answers: [a(q1, 0), a(q2, 0), { questionId: q3!.id, answerId: q1!.answers[0]!.id }] },
      { answers: [] },
      {},
    ];
    for (const body of bodies) {
      const res = await agent.post(url).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await codeOf(res)).toBe('VALIDATION');
    }
    expect((await QuizAttempt.findById(started.attemptId))?.status).toBe('in_progress');
  });

  it('una etapa que no es la en curso responde 409 y un intento terminado no admite más respuestas', async () => {
    const { agent, make } = await world();
    const quiz = await make(1);
    const started = await startAttempt(agent, quiz._id.toString());
    const stage = stageOf(started);

    const wrong = await agent
      .post(`/api/attempts/${started.attemptId}/stages/otra-etapa/answers`)
      .send(answersAt(stage, 0));
    expect(wrong.status).toBe(409);

    await submit(agent, started.attemptId, stage, 0);
    const again = await agent
      .post(`/api/attempts/${started.attemptId}/stages/${stage.stageId}/answers`)
      .send(answersAt(stage, 1));
    expect(again.status).toBe(409);
    expect((await QuizAttempt.findById(started.attemptId))?.finalResultKey).toBe('r1');
  });

  it('dos envíos simultáneos de la misma etapa: solo uno cuenta', async () => {
    const { agent, make } = await world();
    const quiz = await make(1);
    const started = await startAttempt(agent, quiz._id.toString());
    const stage = stageOf(started);
    const url = `/api/attempts/${started.attemptId}/stages/${stage.stageId}/answers`;
    const statuses = (
      await Promise.all([
        agent.post(url).send(answersAt(stage, 0)),
        agent.post(url).send(answersAt(stage, 2)),
      ])
    ).map((res) => res.status);
    expect(statuses.sort()).toEqual([200, 409]);
    expect(await UserProgress.countDocuments()).toBe(1);
  });

  it('un quiz de dos etapas ejecuta solo la rama que corresponde', async () => {
    const { agent, make } = await world();
    const quiz = await make(1, twoStageContent());
    const started = await startAttempt(agent, quiz._id.toString());
    const first = stageOf(started);
    expect(first.stageId).toBe('etapa-1');

    const second = await submit(agent, started.attemptId, first, 1); // todo "b" → agua
    const branch = stageOf(second);
    expect(branch.stageId).toBe('etapa-agua');
    expect(JSON.stringify(second)).not.toMatch(/fuego|resultKey|poder-/);

    // La rama de fuego no se puede responder aunque se conozca su id.
    const wrongBranch = await agent
      .post(`/api/attempts/${started.attemptId}/stages/etapa-fuego/answers`)
      .send(answersAt(branch, 0));
    expect(wrongBranch.status).toBe(409);

    const done = await submit(agent, started.attemptId, branch, 1);
    expect(done).toMatchObject({ status: 'completed', result: { key: 'poder-a2' } });
    const attempt = await QuizAttempt.findById(started.attemptId).lean();
    expect(attempt?.stages.map((entry) => entry.stageId)).toEqual(['etapa-1', 'etapa-agua']);
    expect(attempt?.finalResultKey).toBe('poder-a2');
  });
});

describe('reglas por quiz: reintentos y porcentajes', () => {
  it('con allowRetake=true se puede repetir: historial completo, resultado vigente = el último, progreso conservado', async () => {
    const { agent, make, user } = await world();
    const quiz = await make(1);
    const id = quiz._id.toString();
    await playSimple(agent, id, 0); // r1
    await playSimple(agent, id, 2); // r3

    const res = await agent.get(`/api/me/results/${id}`).expect(200);
    const results = quizResultsResponseSchema.parse(res.body);
    expect(results.allowRetake).toBe(true);
    expect(results.current.result.key).toBe('r3');
    expect(results.history.map((h) => [h.attemptNumber, h.resultTitle])).toEqual([
      [2, '[PLACEHOLDER] r3'],
      [1, '[PLACEHOLDER] r1'],
    ]);

    const progress = await UserProgress.findOne({ userId: user._id }).lean();
    expect(progress?.completed).toHaveLength(1);
    expect(progress?.completed[0]?.currentResultKey).toBe('r3');
    const intro = quizIntroResponseSchema.parse(
      (await agent.get(`/api/quizzes/${id}`).expect(200)).body,
    );
    expect(intro).toMatchObject({ status: 'completed', completedCount: 2, canStart: true });
  });

  it('con allowRetake=false el segundo intento responde 409 y el resultado queda definitivo', async () => {
    const { agent, make } = await world();
    const quiz = await make(1, simpleContent({ settings: { allowRetake: false } }));
    const id = quiz._id.toString();
    await playSimple(agent, id, 1);

    const second = await agent.post(`/api/quizzes/${id}/attempts`);
    expect(second.status).toBe(409);
    expect(await codeOf(second)).toBe('CONFLICT');
    expect(await QuizAttempt.countDocuments({ quizId: id })).toBe(1);

    const intro = quizIntroResponseSchema.parse(
      (await agent.get(`/api/quizzes/${id}`).expect(200)).body,
    );
    expect(intro).toMatchObject({ allowRetake: false, canStart: false, status: 'completed' });
    const results = quizResultsResponseSchema.parse(
      (await agent.get(`/api/me/results/${id}`).expect(200)).body,
    );
    expect(results.current.result.key).toBe('r2');
  });

  it('un quiz de una sola vez deja continuar con el siguiente', async () => {
    const { agent, make } = await world();
    const once = await make(1, simpleContent({ settings: { allowRetake: false } }));
    const next = await make(2);
    await playSimple(agent, once._id.toString());
    await agent.get(`/api/quizzes/${next._id.toString()}`).expect(200);
  });

  it('cambiar la regla y volver a publicar rige desde la siguiente publicación', async () => {
    const { agent, make, admin } = await world();
    const content = simpleContent({ settings: { allowRetake: false } });
    const quiz = await make(1, content);
    const id = quiz._id.toString();
    await playSimple(agent, id);
    expect((await agent.post(`/api/quizzes/${id}/attempts`)).status).toBe(409);

    // La autora cambia la regla en el borrador: mientras no se publique, sigue valiendo la anterior.
    await Quiz.updateOne({ _id: id }, { $set: { 'settings.allowRetake': true } });
    expect((await agent.post(`/api/quizzes/${id}/attempts`)).status).toBe(409);

    await publishDirect(id, admin._id, {
      ...content,
      settings: { ...content.settings, allowRetake: true },
    });
    expect((await agent.post(`/api/quizzes/${id}/attempts`)).status).toBe(200);
  });

  it('showBreakdown devuelve el porcentaje de cada resultado (suma 100); sin él, nunca', async () => {
    const { agent, make } = await world({ random: seededRandom(3) });
    const withBreakdown = await make(
      1,
      simpleContent({ questions: 3, settings: { showBreakdown: true } }),
    );
    const without = await make(2, simpleContent({ questions: 3 }));

    // 2 respuestas "a" + 1 "b" → r1 67 %, r2 33 %
    const started = await startAttempt(agent, withBreakdown._id.toString());
    const stage = stageOf(started);
    const idx = [0, 0, 1];
    const res = await agent
      .post(`/api/attempts/${started.attemptId}/stages/${stage.stageId}/answers`)
      .send({
        answers: stage.questions.map((q, i) => ({
          questionId: q.id,
          answerId: q.answers[idx[i]!]!.id,
        })),
      })
      .expect(200);
    const body = attemptResponseSchema.parse(res.body);
    if (body.status !== 'completed') throw new Error('Debía completarse');
    expect(body.result.key).toBe('r1');
    const shown = body.result.distribution ?? [];
    expect(shown.map((row) => [row.key, row.percent])).toEqual(
      expect.arrayContaining([
        ['r1', 67],
        ['r2', 33],
      ]),
    );
    expect(shown.reduce((sum, row) => sum + row.percent, 0)).toBe(100);

    const stored = await agent.get(`/api/me/results/${withBreakdown._id.toString()}`).expect(200);
    expect(quizResultsResponseSchema.parse(stored.body).current.result.distribution).toHaveLength(
      2,
    );

    const plain = await playSimple(agent, without._id.toString(), 0);
    expect(JSON.stringify(plain)).not.toContain('distribution');
    const plainStored = await agent.get(`/api/me/results/${without._id.toString()}`).expect(200);
    expect(JSON.stringify(plainStored.body)).not.toContain('distribution');
  });
});

describe('resultado narrativo', () => {
  const narrative = (): QuizContent => {
    const content = simpleContent();
    content.settings = {
      allowRetake: true,
      showBreakdown: false,
      revealIntro: { lines: ['[PLACEHOLDER] Decodificando…'], effect: 'glitch' },
    };
    content.results[0] = {
      ...content.results[0]!,
      media: {
        kind: 'video',
        video: {
          provider: 'cloudinary',
          publicId: 'quiz/r1',
          url: 'https://res.cloudinary.com/[cloud]/video/upload/quiz/r1',
          width: 640,
          height: 360,
          durationSeconds: 4,
          alt: '[PLACEHOLDER]',
        },
      },
      reveal: { lines: ['[PLACEHOLDER] Línea secreta'], effect: 'brillo' },
      facts: [{ label: 'Detalle', value: '[PLACEHOLDER] dato secreto' }],
    };
    return content;
  };

  it('la secuencia, los datos y el media NO viajan antes de completar y sí después', async () => {
    const { agent, make } = await world();
    const quiz = await make(1, narrative());
    const id = quiz._id.toString();

    const intro = await agent.get(`/api/quizzes/${id}`).expect(200);
    const started = await agent.post(`/api/quizzes/${id}/attempts`).expect(200);
    for (const res of [intro, started]) {
      expect(JSON.stringify(res.body)).not.toMatch(
        /secret|Decodificando|video|glitch|brillo|facts|reveal/i,
      );
    }

    const done = await submit(
      agent,
      (started.body as { attemptId: string }).attemptId,
      stageOf(attemptResponseSchema.parse(started.body)),
      0,
    );
    if (done.status !== 'completed') throw new Error('Debía completarse');
    expect(done.result.revealIntro?.lines).toEqual(['[PLACEHOLDER] Decodificando…']);
    expect(done.result.reveal?.effect).toBe('brillo');
    expect(done.result.facts?.[0]?.label).toBe('Detalle');
    expect(done.result.media?.kind).toBe('video');
  });
});

describe('versiones inmutables', () => {
  it('editar y publicar no altera un intento ya empezado ni los resultados guardados', async () => {
    const { agent, make, admin } = await world();
    const content = simpleContent({ title: '[PLACEHOLDER] Versión uno' });
    const quiz = await make(1, content);
    const id = quiz._id.toString();

    const started = await startAttempt(agent, id); // fija la versión 1
    const edited: QuizContent = {
      ...content,
      title: '[PLACEHOLDER] Versión dos',
      results: content.results.map((result) =>
        result.key === 'r1' ? { ...result, title: '[PLACEHOLDER] r1 cambiado' } : result,
      ),
    };
    await publishDirect(id, admin._id, edited);

    const done = await submit(agent, started.attemptId, stageOf(started), 0);
    if (done.status !== 'completed') throw new Error('Debía completarse');
    expect(done.result.title).toBe('[PLACEHOLDER] r1'); // versión 1
    expect((await QuizAttempt.findById(started.attemptId))?.version).toBe(1);

    const next = await startAttempt(agent, id);
    expect((await QuizAttempt.findById(next.attemptId))?.version).toBe(2);
    const second = await submit(agent, next.attemptId, stageOf(next), 0);
    if (second.status !== 'completed') throw new Error('Debía completarse');
    expect(second.result.title).toBe('[PLACEHOLDER] r1 cambiado');

    const results = quizResultsResponseSchema.parse(
      (await agent.get(`/api/me/results/${id}`).expect(200)).body,
    );
    expect(results.history.map((h) => [h.version, h.resultTitle])).toEqual([
      [2, '[PLACEHOLDER] r1 cambiado'],
      [1, '[PLACEHOLDER] r1'],
    ]);
  });
});

describe('modo prueba (EDITOR y ADMIN)', () => {
  it('el administrador juega cualquier quiz en modo prueba y no deja rastro en progreso ni resultados', async () => {
    const { app, make, book, admin } = await world();
    await make(1);
    const second = await make(2);
    const adminAgent = await loginAgent(app, 'admin@ejemplo.com');

    const done = await playSimple(adminAgent, second._id.toString()); // sin completar el 1.º
    expect(done.status).toBe('completed');
    const attempt = await QuizAttempt.findById(done.attemptId).lean();
    expect(attempt?.isTest).toBe(true);
    expect(await UserProgress.countDocuments({ userId: admin._id })).toBe(0);

    const list = resultsListResponseSchema.parse(
      (await adminAgent.get('/api/me/results').query({ bookId: book._id.toString() }).expect(200))
        .body,
    );
    expect(list.results).toEqual([]);
    await adminAgent.get(`/api/me/results/${second._id.toString()}`).expect(404);
  });

  it('un quiz de una sola vez se puede probar las veces que haga falta', async () => {
    const { app, make } = await world();
    const quiz = await make(1, simpleContent({ settings: { allowRetake: false } }));
    const adminAgent = await loginAgent(app, 'admin@ejemplo.com');
    await playSimple(adminAgent, quiz._id.toString());
    await playSimple(adminAgent, quiz._id.toString());
  });

  it('los intentos de prueba no cuentan para los de una sola vez de las lectoras', async () => {
    const { app, agent, make } = await world();
    const quiz = await make(1, simpleContent({ settings: { allowRetake: false } }));
    const adminAgent = await loginAgent(app, 'admin@ejemplo.com');
    await playSimple(adminAgent, quiz._id.toString());
    await playSimple(agent, quiz._id.toString());
  });
});

describe('GET /api/me/progress', () => {
  it('muestra locked / available / completed por quiz y el intento en curso', async () => {
    const { agent, make, book } = await world();
    const q1 = await make(1);
    const q2 = await make(2);
    await make(3);
    const query = { bookId: book._id.toString() };
    const read = async () =>
      progressResponseSchema.parse(
        (await agent.get('/api/me/progress').query(query).expect(200)).body,
      );

    expect((await read()).experiences.map((e) => e.status)).toEqual([
      'available',
      'locked',
      'locked',
    ]);

    await startAttempt(agent, q1._id.toString());
    expect((await read()).experiences[0]).toMatchObject({ status: 'available', inProgress: true });

    await playSimple(agent, q1._id.toString());
    expect((await read()).experiences.map((e) => e.status)).toEqual([
      'completed',
      'available',
      'locked',
    ]);

    await playSimple(agent, q2._id.toString());
    const progress = await read();
    expect(progress.experiences.map((e) => e.status)).toEqual([
      'completed',
      'completed',
      'available',
    ]);
    expect(progress.bookCompleted).toBe(false);
    expect(JSON.stringify(progress)).not.toMatch(/resultKey|stages/);
  });

  it('valida el bookId y responde 404 si el libro no está publicado', async () => {
    const { agent, book } = await world();
    expect((await agent.get('/api/me/progress')).status).toBe(400);
    await book.updateOne({ status: 'draft' });
    expect(
      (await agent.get('/api/me/progress').query({ bookId: book._id.toString() })).status,
    ).toBe(404);
  });
});

describe('GET /api/me/results', () => {
  it('lista el resultado vigente de cada quiz completado, en orden, y solo los propios', async () => {
    const { app, agent, make, book } = await world();
    const q1 = await make(1);
    const q2 = await make(2);
    await playSimple(agent, q1._id.toString(), 2);
    await playSimple(agent, q2._id.toString(), 0);
    await playSimple(agent, q2._id.toString(), 1);

    const res = await agent
      .get('/api/me/results')
      .query({ bookId: book._id.toString() })
      .expect(200);
    const { results } = resultsListResponseSchema.parse(res.body);
    expect(results.map((r) => [r.order, r.resultTitle, r.attemptsCompleted])).toEqual([
      [1, '[PLACEHOLDER] r3', 1],
      [2, '[PLACEHOLDER] r2', 2],
    ]);

    await createUser({ email: 'otra@ejemplo.com' });
    const other = await loginAgent(app, 'otra@ejemplo.com');
    const empty = await other
      .get('/api/me/results')
      .query({ bookId: book._id.toString() })
      .expect(200);
    expect(resultsListResponseSchema.parse(empty.body).results).toEqual([]);
    await other.get(`/api/me/results/${q1._id.toString()}`).expect(404);
  });
});

describe('desbloqueo por QR (REQUIRE_QR_UNLOCK)', () => {
  it('apagado por defecto: solo rigen los prerrequisitos', async () => {
    const { agent, make } = await world();
    const quiz = await make(1);
    await agent.get(`/api/quizzes/${quiz._id.toString()}`).expect(200);
  });

  it('encendido: sin canje responde 403 NOT_UNLOCKED y con el desbloqueo registrado abre', async () => {
    const { agent, make, user, book } = await world({ env: { REQUIRE_QR_UNLOCK: 'true' } });
    const quiz = await make(1);
    const url = `/api/quizzes/${quiz._id.toString()}`;
    const denied = await agent.get(url);
    expect(denied.status).toBe(403);
    expect(await codeOf(denied)).toBe('NOT_UNLOCKED');

    const status = async () =>
      progressResponseSchema.parse(
        (await agent.get('/api/me/progress').query({ bookId: book._id.toString() }).expect(200))
          .body,
      ).experiences[0]?.status;
    expect(await status()).toBe('locked');

    await UserProgress.create({
      userId: user._id,
      bookId: book._id,
      unlocked: [{ kind: 'quiz', refId: quiz._id, at: new Date() }],
    });
    await agent.get(url).expect(200);
    expect(await status()).toBe('available');
  });
});

describe('contrato', () => {
  it('ninguna respuesta del lector incluye campos internos de la definición del quiz', async () => {
    const { agent, make, book } = await world();
    const quiz = await make(1, twoStageContent());
    const id = quiz._id.toString();
    const bodies: unknown[] = [];
    bodies.push((await agent.get(`/api/quizzes/${id}`)).body);
    const started = await agent.post(`/api/quizzes/${id}/attempts`);
    bodies.push(started.body);
    const parsed = attemptResponseSchema.parse(started.body);
    const next = await agent
      .post(`/api/attempts/${parsed.attemptId}/stages/etapa-1/answers`)
      .send(answersAt(stageOf(parsed), 0));
    bodies.push(next.body);
    bodies.push((await agent.get('/api/me/progress').query({ bookId: book._id.toString() })).body);
    for (const body of bodies)
      expect(JSON.stringify(body)).not.toMatch(/resultKey|conditionResultKey|producesFinal/);
  });
});
