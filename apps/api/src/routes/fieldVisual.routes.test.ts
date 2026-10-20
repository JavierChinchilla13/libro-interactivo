import {
  attemptResponseSchema,
  publicWikiEntriesResponseSchema,
  publicWikiEntryResponseSchema,
  wikiEntryResponseSchema,
  type QuizContent,
  type StagePayload,
} from '@libro/shared';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { staffWorld, validEntry } from '../test-utils/admin.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

describe('campo de poder: fondo animado (admin)', () => {
  it('un campo de poder guarda su clave visual; otro tipo o una clave desconocida se rechazan', async () => {
    const { admin } = await staffWorld();
    const ok = await admin
      .post('/api/admin/wiki')
      .send(
        validEntry({
          kind: 'power_field',
          slug: 'agitacion',
          name: 'Agitación',
          visualKey: 'rain',
        }),
      )
      .expect(201);
    expect(wikiEntryResponseSchema.parse(ok.body).visualKey).toBe('rain');

    const character = await admin
      .post('/api/admin/wiki')
      .send(validEntry({ kind: 'character', slug: 'ana', name: 'Ana', visualKey: 'rain' }));
    expect(character.status).toBe(400);
    const unknown = await admin.post('/api/admin/wiki').send(
      validEntry({
        kind: 'power_field',
        slug: 'otro',
        name: 'Otro',
        visualKey: 'fuegos' as never,
      }),
    );
    expect(unknown.status).toBe(400);
  });
});

describe('campo de poder: wiki pública', () => {
  it('el campo abierto entrega su clave visual; una entrada bloqueada no entrega nada', async () => {
    const harness = createTestHarness();
    const book = await createBook();
    await Book.updateOne(
      { _id: book._id },
      {
        $set: {
          wikiSections: [{ kind: 'power_field', title: 'Poderes', order: 1, enabled: true }],
        },
      },
    );
    const open = await WikiEntry.create({
      bookId: book._id,
      kind: 'power_field',
      slug: 'mente',
      name: 'Mente',
      nameNormalized: 'mente',
      letter: 'M',
      visualKey: 'neural',
      order: 1,
      status: 'published',
    });
    const list = await request(harness.app)
      .get('/api/wiki/entries')
      .query({ bookId: book.id, kind: 'power_field' })
      .expect(200);
    const parsed = publicWikiEntriesResponseSchema.parse(list.body);
    expect(parsed.entries[0]).toMatchObject({ locked: false, visualKey: 'neural' });

    const detail = await request(harness.app).get(`/api/wiki/entries/${open.id}`).expect(200);
    expect(publicWikiEntryResponseSchema.parse(detail.body).entry.visualKey).toBe('neural');
  });
});

describe('resultado del quiz con campo animado', () => {
  async function world(
    fieldSlug: string | undefined,
    fieldStatus: 'published' | 'draft' = 'published',
  ) {
    const harness = createTestHarness();
    const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
    await createUser();
    const book = await createBook();
    await WikiEntry.create({
      bookId: book._id,
      kind: 'power_field',
      slug: 'transformacion',
      name: 'Transformación',
      nameNormalized: 'transformacion',
      letter: 'T',
      visualKey: 'gradient',
      order: 1,
      status: fieldStatus,
    });
    const content: QuizContent = simpleContent();
    if (fieldSlug) content.results[0] = { ...content.results[0]!, fieldSlug };
    const quiz = await createQuiz({ bookId: book._id, order: 1, content, publishedBy: admin._id });
    return { ...harness, quiz, agent: await loginAgent(harness.app) };
  }

  const play = async (agent: TestAgent, quizId: string) => {
    const started = await agent.post(`/api/quizzes/${quizId}/attempts`).expect(200);
    const first = attemptResponseSchema.parse(started.body);
    if (first.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    const stage: StagePayload = first.stage;
    const done = await agent
      .post(`/api/attempts/${first.attemptId}/stages/${stage.stageId}/answers`)
      .send({
        answers: stage.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id })),
      })
      .expect(200);
    return { started, done };
  };

  it('antes de terminar no viaja nada del campo; al terminar llega solo la clave visual y el nombre', async () => {
    const { agent, quiz } = await world('transformacion');
    const intro = await agent.get(`/api/quizzes/${quiz.id}`).expect(200);
    const { started, done } = await play(agent, quiz.id);
    for (const res of [intro, started]) {
      expect(JSON.stringify(res.body)).not.toMatch(/visual|gradient|transformacion|Transformaci/i);
    }
    const result = attemptResponseSchema.parse(done.body);
    if (result.status !== 'completed') throw new Error('Debía completarse');
    expect(result.result.visual).toEqual({ key: 'gradient', fieldName: 'Transformación' });
    // El `slug` del campo nunca llega al lector.
    expect(JSON.stringify(done.body)).not.toMatch(/fieldSlug|"transformacion"/);

    const again = await agent.get(`/api/me/results/${quiz.id}`).expect(200);
    expect(again.body.current.result.visual).toEqual({
      key: 'gradient',
      fieldName: 'Transformación',
    });
  });

  it('sin campo asignado o con el campo sin publicar, el resultado no lleva fondo animado', async () => {
    const without = await world(undefined);
    const a = await play(without.agent, without.quiz.id);
    expect(JSON.stringify(a.done.body)).not.toContain('visual');
  });

  it('un campo en borrador no da fondo animado', async () => {
    const draft = await world('transformacion', 'draft');
    const b = await play(draft.agent, draft.quiz.id);
    expect(JSON.stringify(b.done.body)).not.toContain('visual');
  });
});
