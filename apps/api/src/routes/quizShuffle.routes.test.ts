import { attemptResponseSchema, type QuizContent, type StagePayload } from '@libro/shared';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import {
  createBook,
  createQuiz,
  simpleContent,
  twoStageContent,
} from '../test-utils/quizFixtures.js';
import { seededRandom } from '../test-utils/random.js';
import { answerOrderFor, questionOrderFor } from '../services/quiz-engine.js';

useTestDb();

/** Etapas con respuestas barajadas (los constructores de pruebas no barajan por defecto: dependen del orden). */
const shuffled = (content: QuizContent, pinLastAnswer = false): QuizContent => ({
  ...content,
  stages: content.stages.map((stage) => ({
    ...stage,
    shuffleAnswers: true,
    questions: stage.questions.map((question) => ({
      ...question,
      answers: question.answers.map((answer, index, all) =>
        pinLastAnswer && index === all.length - 1
          ? { ...answer, text: '[PLACEHOLDER] Ninguna de las anteriores', pinLast: true }
          : answer,
      ),
    })),
  })),
});

async function world(content: QuizContent, seed = 11) {
  const harness = createTestHarness({ random: seededRandom(seed) });
  const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const user = await createUser();
  const book = await createBook();
  const quiz = await createQuiz({ bookId: book._id, order: 1, content, publishedBy: admin._id });
  const agent = await loginAgent(harness.app);
  return { ...harness, user, book, quiz, agent, id: quiz._id.toString() };
}

const start = async (agent: TestAgent, id: string) =>
  attemptResponseSchema.parse((await agent.post(`/api/quizzes/${id}/attempts`).expect(200)).body);
const stageOf = (response: ReturnType<typeof attemptResponseSchema.parse>): StagePayload => {
  if (response.status !== 'in_progress') throw new Error('Se esperaba una etapa');
  return response.stage;
};
const texts = (stage: StagePayload) => stage.questions.map((q) => q.answers.map((a) => a.text));
const authored = (content: QuizContent, stageIndex = 0) =>
  (content.stages[stageIndex]?.questions ?? []).map((q) => q.answers.map((a) => a.text));

/** Responde cada pregunta con la respuesta cuyo texto es `text` (el texto «Respuesta N» suma al resultado rN). */
const answerByText = (stage: StagePayload, text: string) => ({
  answers: stage.questions.map((q) => ({
    questionId: q.id,
    answerId: (q.answers.find((a) => a.text.endsWith(text)) ?? q.answers[0])!.id,
  })),
});

describe('barajado de respuestas (intentos)', () => {
  it('las respuestas llegan barajadas (permutación), reproducible con semilla, y no se filtra ningún resultKey', async () => {
    const content = shuffled(simpleContent({ questions: 4 }));
    const { agent, id } = await world(content);
    const response = await start(agent, id);
    const stage = stageOf(response);
    const order = texts(stage);
    expect(order.map((row) => [...row].sort())).toEqual(
      authored(content).map((row) => [...row].sort()),
    );
    expect(order).not.toEqual(authored(content)); // con esta semilla cambia el orden en alguna pregunta
    expect(JSON.stringify(response)).not.toMatch(/resultKey|pinLast|answerOrder/);

    // Misma semilla = mismo orden: se reproduce lo que consume el servidor (primero preguntas, luego respuestas).
    const random = seededRandom(11);
    const firstStage = content.stages[0]!;
    questionOrderFor(firstStage, random);
    const expected = answerOrderFor(firstStage, random) ?? [];
    for (const question of stage.questions) {
      expect(question.answers.map((a) => a.id)).toEqual(
        expected.find((item) => item.questionId === question.id)?.answerIds,
      );
    }
  });

  it('el orden se guarda en el intento (solo ids) y al reanudar es exactamente el mismo', async () => {
    const content = shuffled(simpleContent({ questions: 3 }));
    const { agent, id } = await world(content);
    const first = stageOf(await start(agent, id));
    const resumed = stageOf(await start(agent, id));
    expect(resumed).toEqual(first);
    const stored = await QuizAttempt.findOne({ quizId: id }).lean();
    const saved = stored?.stages[0]?.answerOrder ?? [];
    for (const question of first.questions) {
      expect(saved.find((item) => item.questionId === question.id)?.answerIds).toEqual(
        question.answers.map((a) => a.id),
      );
    }
    expect(JSON.stringify(stored?.stages[0]?.answerOrder)).not.toMatch(/resultKey|r1|r2|r3/);
  });

  it('el resultado es el mismo con las respuestas barajadas (se responde por id, no por posición)', async () => {
    const content = shuffled(simpleContent({ questions: 5 }));
    const { agent, id } = await world(content, 1);
    const seen = new Set<string>();
    for (let round = 0; round < 4; round += 1) {
      const stage = stageOf(await start(agent, id));
      seen.add(JSON.stringify(texts(stage)));
      const attemptId = (
        await QuizAttempt.findOne({ quizId: id, status: 'in_progress' }).lean()
      )?._id.toString();
      const done = await agent
        .post(`/api/attempts/${attemptId}/stages/${stage.stageId}/answers`)
        .send(answerByText(stage, 'Respuesta 2'))
        .expect(200);
      expect(done.body.status).toBe('completed');
      expect(done.body.result.key).toBe('r2');
    }
    expect(seen.size).toBeGreaterThan(1); // cada intento nuevo tiene su propio orden
  });

  it('«Dejar al final» queda siempre al final, intento tras intento', async () => {
    const content = shuffled(simpleContent({ questions: 3 }), true);
    const { agent, id } = await world(content, 5);
    for (let round = 0; round < 8; round += 1) {
      const stage = stageOf(await start(agent, id));
      for (const question of stage.questions) {
        expect(question.answers.at(-1)?.text).toBe('[PLACEHOLDER] Ninguna de las anteriores');
      }
      const attemptId = (
        await QuizAttempt.findOne({ quizId: id, status: 'in_progress' }).lean()
      )?._id.toString();
      await agent
        .post(`/api/attempts/${attemptId}/stages/${stage.stageId}/answers`)
        .send(answerByText(stage, 'Respuesta 1'))
        .expect(200);
    }
  });

  it('un quiz publicado sin el campo se lee como «barajar»: los intentos nuevos sí barajan', async () => {
    const content = shuffled(simpleContent({ questions: 4 }));
    // Como lo guardaba una versión publicada antes de existir la opción: sin `shuffleAnswers`.
    const legacy = JSON.parse(JSON.stringify(content)) as QuizContent;
    for (const stage of legacy.stages)
      delete (stage as { shuffleAnswers?: boolean }).shuffleAnswers;
    const { agent, id } = await world(legacy);
    expect(texts(stageOf(await start(agent, id)))).not.toEqual(authored(content));
  });

  it('la etapa que no baraja entrega el orden de la autora y no guarda orden', async () => {
    const content = simpleContent({ questions: 3 });
    const { agent, id } = await world(content);
    expect(texts(stageOf(await start(agent, id)))).toEqual(authored(content));
    expect(
      (await QuizAttempt.findOne({ quizId: id }).lean())?.stages[0]?.answerOrder,
    ).toBeUndefined();
  });

  it('un intento empezado antes del cambio no mueve sus respuestas, aunque el quiz ya baraje', async () => {
    const content = shuffled(twoStageContent());
    const { agent, id, user, book, quiz } = await world(content, 3);
    const version = quiz.currentVersion;
    // Intento creado como lo hacía el servidor antes: sin `answerOrder`.
    const { QuizVersion } = await import('../models/QuizVersion.js');
    const versionDoc = await QuizVersion.findOne({ quizId: quiz._id, version }).lean();
    const firstStage = content.stages[0]!;
    const order = firstStage.questions.map((q) => q.id);
    await QuizAttempt.create({
      userId: user._id,
      bookId: book._id,
      quizId: quiz._id,
      quizVersionId: versionDoc?._id,
      version,
      attemptNumber: 1,
      status: 'in_progress',
      stages: [{ stageId: firstStage.id, questionOrder: order }],
      isTest: false,
      startedAt: new Date(),
      expireAt: new Date(Date.now() + 86_400_000),
    });
    const resumed = stageOf(await start(agent, id));
    expect(texts(resumed)).toEqual(authored(content));
    // Se puede reanudar las veces que sea: nada cambia.
    expect(stageOf(await start(agent, id))).toEqual(resumed);
    expect(
      (await QuizAttempt.findOne({ quizId: id }).lean())?.stages[0]?.answerOrder,
    ).toBeUndefined();

    // Al terminar la primera etapa, la siguiente (que la lectora nunca vio) sí se entrega barajada y guardada.
    const attemptId = (await QuizAttempt.findOne({ quizId: id }).lean())?._id.toString();
    const next = await agent
      .post(`/api/attempts/${attemptId}/stages/${firstStage.id}/answers`)
      .send(answerByText(resumed, 'Respuesta 1'))
      .expect(200);
    const nextStage = stageOf(attemptResponseSchema.parse(next.body));
    const saved = await QuizAttempt.findOne({ quizId: id }).lean();
    expect(saved?.stages[0]?.answerOrder).toBeUndefined(); // lo ya vivido no se reescribe
    for (const question of nextStage.questions) {
      expect(
        saved?.stages[1]?.answerOrder?.find((item) => item.questionId === question.id)?.answerIds,
      ).toEqual(question.answers.map((a) => a.id));
    }
  });
});
