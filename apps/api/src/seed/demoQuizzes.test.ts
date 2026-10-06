import { attemptResponseSchema, progressResponseSchema, quizContentSchema } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createProgressService } from '../services/progress.service.js';
import { cryptoRandomInt, validateQuizContent } from '../services/quiz-engine.js';
import { createQuizService } from '../services/quiz.service.js';
import { createQuizPublishService } from '../services/quizPublish.service.js';
import { demoQuizzes, seedDemoQuizzes } from './demoQuizzes.js';

useTestDb();

const clock = () => new Date();
const publisher = createQuizPublishService({
  clock,
  quizzes: createQuizService({
    progress: createProgressService({ requireQrUnlock: false }),
    clock,
    random: cryptoRandomInt,
  }),
});

describe('quizzes de ejemplo', () => {
  it('todos cumplen el esquema y la validación estricta', () => {
    for (const demo of demoQuizzes()) {
      expect(quizContentSchema.safeParse(demo.content).success, demo.slug).toBe(true);
      expect(validateQuizContent(demo.content).errors, demo.slug).toEqual([]);
    }
  });

  it('cubren los tres casos: una sola vez, con porcentajes y dos etapas con 5 ramas', () => {
    const [once, breakdown, branching] = demoQuizzes();
    expect(once?.content.settings.allowRetake).toBe(false);
    expect(breakdown?.content.settings.showBreakdown).toBe(true);
    const roots = branching!.content.stages.filter((stage) => !stage.conditionStageId);
    const branches = branching!.content.stages.filter((stage) => stage.conditionStageId);
    expect([roots.length, branches.length]).toEqual([1, 5]);
  });

  it('se cargan publicados, son idempotentes y se pueden jugar de punta a punta', async () => {
    const { app } = createTestHarness();
    const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
    await createUser();
    const actor = { userId: admin._id.toString(), role: 'ADMIN' as const };

    const first = await seedDemoQuizzes({ publisher, actor });
    expect(first.created).toEqual(['quiz-1', 'quiz-2', 'quiz-3']);
    const again = await seedDemoQuizzes({ publisher, actor });
    expect(again).toMatchObject({ created: [], existing: ['quiz-1', 'quiz-2', 'quiz-3'] });
    expect(await Quiz.countDocuments({ status: 'published', currentVersion: 1 })).toBe(3);
    expect(await QuizVersion.countDocuments()).toBe(3);

    const agent = await loginAgent(app);
    const progress = async () =>
      progressResponseSchema.parse(
        (await agent.get('/api/me/progress').query({ bookId: first.bookId }).expect(200)).body,
      );
    expect((await progress()).experiences.map((e) => e.status)).toEqual(['available', 'locked', 'locked']);

    // Juega los tres: siempre la primera respuesta (el de dos etapas pasa por una rama y termina en un poder).
    for (const quiz of await Quiz.find().sort({ order: 1 })) {
      let response = attemptResponseSchema.parse(
        (await agent.post(`/api/quizzes/${quiz._id.toString()}/attempts`).expect(200)).body,
      );
      for (let guard = 0; guard < 4 && response.status === 'in_progress'; guard += 1) {
        const { stage } = response;
        response = attemptResponseSchema.parse(
          (
            await agent
              .post(`/api/attempts/${response.attemptId}/stages/${stage.stageId}/answers`)
              .send({
                answers: stage.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id })),
              })
              .expect(200)
          ).body,
        );
      }
      expect(response.status).toBe('completed');
    }
    expect((await progress()).experiences.map((e) => e.status)).toEqual(['completed', 'completed', 'completed']);
  });
});
