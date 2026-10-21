import {
  attemptResponseSchema,
  quizValidationResponseSchema,
  type QuizContent,
  type StagePayload,
} from '@libro/shared';
import type { Types } from 'mongoose';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { staffWorld } from '../test-utils/admin.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import {
  createBook,
  createQuiz,
  simpleContent,
  twoStageContent,
} from '../test-utils/quizFixtures.js';

useTestDb();

const field = (bookId: Types.ObjectId, over: Record<string, unknown> = {}) =>
  WikiEntry.create({
    bookId,
    kind: 'power_field',
    slug: 'mente',
    name: 'Mente',
    nameNormalized: 'mente',
    letter: 'M',
    visualKey: 'neural',
    order: 1,
    status: 'published',
    ...over,
  });

describe('avisos al validar un quiz con campo de poder', () => {
  async function validateWith(
    fieldSlug: string,
    setup: (bookId: Types.ObjectId) => Promise<unknown>,
  ) {
    const { admin } = await staffWorld();
    const book = await createBook();
    await setup(book._id);
    const content = simpleContent();
    content.results[0] = { ...content.results[0]!, fieldSlug };
    const quiz = await createQuiz({ bookId: book._id, order: 1, content });
    const res = await admin.post(`/api/admin/quizzes/${quiz.id}/validate`).expect(200);
    return quizValidationResponseSchema.parse(res.body);
  }

  it('un campo publicado con fondo no da avisos', async () => {
    const result = await validateWith('mente', (bookId) => field(bookId));
    expect(result.valid).toBe(true);
    expect(result.warnings.filter((w) => w.code.startsWith('FIELD_'))).toEqual([]);
  });

  it('un campo inexistente, en borrador o sin fondo avisa, pero el quiz sigue siendo válido', async () => {
    const missing = await validateWith('no-existe', async () => undefined);
    expect(missing.valid).toBe(true);
    expect(missing.warnings.map((w) => w.code)).toContain('FIELD_NOT_FOUND');
  });

  it('un campo en borrador avisa como inexistente y uno sin fondo animado lo dice', async () => {
    const draft = await validateWith('mente', (bookId) => field(bookId, { status: 'draft' }));
    expect(draft.warnings.map((w) => w.code)).toContain('FIELD_NOT_FOUND');
  });

  it('un campo sin clave visual avisa que no tendrá fondo', async () => {
    const plain = await validateWith('mente', (bookId) => field(bookId, { visualKey: undefined }));
    expect(plain.valid).toBe(true);
    expect(plain.warnings.map((w) => w.code)).toContain('FIELD_WITHOUT_VISUAL');
  });
});

describe('regla 3: el campo no se adelanta en una etapa intermedia', () => {
  it('un resultado intermedio con campo no filtra nada al pasar a la siguiente etapa', async () => {
    const harness = createTestHarness();
    const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
    await createUser();
    const book = await createBook();
    await field(book._id, { slug: 'fuego', name: 'Fuego', visualKey: 'rain' });
    const content: QuizContent = twoStageContent();
    content.results = content.results.map((result) => ({ ...result, fieldSlug: 'fuego' }));
    const quiz = await createQuiz({ bookId: book._id, order: 1, content, publishedBy: admin._id });
    const agent = await loginAgent(harness.app);

    const started = await agent.post(`/api/quizzes/${quiz.id}/attempts`).expect(200);
    const first = attemptResponseSchema.parse(started.body);
    if (first.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    const stage: StagePayload = first.stage;
    const next = await agent
      .post(`/api/attempts/${first.attemptId}/stages/${stage.stageId}/answers`)
      .send({
        answers: stage.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id })),
      })
      .expect(200);
    const parsed = attemptResponseSchema.parse(next.body);
    expect(parsed.status).toBe('in_progress');
    expect(JSON.stringify([started.body, next.body])).not.toMatch(
      /visual|fieldSlug|"fuego"|Fuego|rain/,
    );
  });
});

describe('RATE_LIMIT_MULTIPLIER', () => {
  /** Tope de ingresos que anuncia el API (el arnés de pruebas ya trae topes altos: se compara la proporción). */
  const loginLimit = async (env: Record<string, string>) => {
    const { app } = createTestHarness({ env });
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    return Number(String(res.headers['ratelimit-policy'] ?? '').split(';')[0]);
  };

  it('en pruebas y desarrollo multiplica el tope del ingreso; sin la variable no cambia nada', async () => {
    const base = await loginLimit({});
    expect(base).toBeGreaterThan(0);
    expect(await loginLimit({ RATE_LIMIT_MULTIPLIER: '20' })).toBe(base * 20);
  });
});

describe('wiki pública: campos bloqueados y en borrador no dan su fondo', () => {
  it('un campo bloqueado llega sin datos (ni `visualKey`) y su ficha responde 403; uno en borrador no aparece', async () => {
    const harness = createTestHarness();
    const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
    const book = await createBook();
    await Book.updateOne(
      { _id: book._id },
      {
        $set: {
          wikiSections: [{ kind: 'power_field', title: 'Poderes', order: 1, enabled: true }],
        },
      },
    );
    const quiz = await createQuiz({
      bookId: book._id,
      order: 1,
      content: simpleContent(),
      publishedBy: admin._id,
    });
    const locked = await field(book._id, {
      slug: 'secreto',
      name: 'Campo secreto',
      visualKey: 'neon',
      unlockAfter: { kind: 'quiz', refId: quiz._id },
      lockedDisplay: 'show',
    });
    const draft = await field(book._id, {
      slug: 'borrador',
      name: 'Campo en borrador',
      visualKey: 'rain',
      status: 'draft',
    });
    const list = await request(harness.app)
      .get('/api/wiki/entries')
      .query({ bookId: book.id, kind: 'power_field' })
      .expect(200);
    expect(list.body.entries).toEqual([
      { locked: true, id: locked.id, kind: 'power_field', order: 1 },
    ]);
    expect(JSON.stringify(list.body)).not.toMatch(/neon|secreto|visualKey|borrador|rain/i);
    expect((await request(harness.app).get(`/api/wiki/entries/${locked.id}`)).status).toBe(403);
    expect((await request(harness.app).get(`/api/wiki/entries/${draft.id}`)).status).toBe(404);
  });
});

describe('quiz: reanudar un intento y aislamiento entre libros', () => {
  async function world() {
    const harness = createTestHarness();
    const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
    await createUser();
    const a = await createBook({ slug: 'libro-a' });
    const b = await Book.create({
      slug: 'libro-b',
      title: '[PLACEHOLDER] Libro B',
      order: 2,
      status: 'published',
    });
    return { ...harness, admin, a, b, agent: await loginAgent(harness.app) };
  }
  const withField = (slug: string): QuizContent => {
    const content = simpleContent();
    content.results = content.results.map((result) => ({ ...result, fieldSlug: slug }));
    return content;
  };
  const finish = async (agent: TestAgent, quizId: string) => {
    const started = await agent.post(`/api/quizzes/${quizId}/attempts`).expect(200);
    const first = attemptResponseSchema.parse(started.body);
    if (first.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    const done = await agent
      .post(`/api/attempts/${first.attemptId}/stages/${first.stage.stageId}/answers`)
      .send({
        answers: first.stage.questions.map((q) => ({
          questionId: q.id,
          answerId: q.answers[0]!.id,
        })),
      })
      .expect(200);
    return attemptResponseSchema.parse(done.body);
  };
  const global = (over: Record<string, unknown>) =>
    WikiEntry.create({
      kind: 'power_field',
      slug: 'mente',
      nameNormalized: 'mente',
      letter: 'M',
      order: 1,
      status: 'published',
      ...over,
    });

  it('reanudar un intento en curso no entrega `visual` ni `fieldSlug`', async () => {
    const { agent, a, admin } = await world();
    await field(a._id, { slug: 'mente', visualKey: 'neural' });
    const quiz = await createQuiz({
      bookId: a._id,
      order: 1,
      content: withField('mente'),
      publishedBy: admin._id,
    });
    const first = await agent.post(`/api/quizzes/${quiz.id}/attempts`).expect(200);
    const resumed = await agent.post(`/api/quizzes/${quiz.id}/attempts`).expect(200);
    expect(resumed.body.attemptId).toBe(first.body.attemptId);
    expect(JSON.stringify([first.body, resumed.body])).not.toMatch(
      /visual|fieldSlug|neural|"mente"/,
    );
  });

  it('un campo de OTRO libro con el mismo slug no se aplica; uno de toda la saga sí', async () => {
    const { agent, a, b, admin } = await world();
    await field(b._id, { slug: 'mente', visualKey: 'rain' });
    const quiz = await createQuiz({
      bookId: a._id,
      order: 1,
      content: withField('mente'),
      publishedBy: admin._id,
    });
    const other = await finish(agent, quiz.id);
    expect(JSON.stringify(other)).not.toContain('visual');

    await global({ name: 'Mente de la saga', visualKey: 'constellation' });
    const quiz2 = await createQuiz({
      bookId: a._id,
      order: 2,
      content: withField('mente'),
      publishedBy: admin._id,
    });
    const done = await finish(agent, quiz2.id);
    expect(done.status === 'completed' && done.result.visual).toEqual({
      key: 'constellation',
      fieldName: 'Mente de la saga',
    });
  });

  it('si existe el campo del libro y el de la saga con el mismo slug, manda el del libro', async () => {
    const { agent, a, admin } = await world();
    await global({ name: 'Mente global', visualKey: 'rain' });
    await field(a._id, { slug: 'mente', name: 'Mente del libro', visualKey: 'neon' });
    const quiz = await createQuiz({
      bookId: a._id,
      order: 1,
      content: withField('mente'),
      publishedBy: admin._id,
    });
    const done = await finish(agent, quiz.id);
    expect(done.status === 'completed' && done.result.visual).toEqual({
      key: 'neon',
      fieldName: 'Mente del libro',
    });
  });
});
