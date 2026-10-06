import { attemptResponseSchema } from '@libro/shared';
import type TestAgent from 'supertest/lib/agent.js';

/** Juega un quiz de una etapa de principio a fin con la primera respuesta de cada pregunta (cuenta como completado). */
export async function playQuizToEnd(agent: TestAgent, quizId: string) {
  const started = attemptResponseSchema.parse(
    (await agent.post(`/api/quizzes/${quizId}/attempts`).expect(200)).body,
  );
  if (started.status !== 'in_progress') throw new Error('Se esperaba una etapa en curso');
  const done = await agent
    .post(`/api/attempts/${started.attemptId}/stages/${started.stage.stageId}/answers`)
    .send({
      answers: started.stage.questions.map((q) => ({
        questionId: q.id,
        answerId: q.answers[0]?.id,
      })),
    })
    .expect(200);
  return attemptResponseSchema.parse(done.body);
}
