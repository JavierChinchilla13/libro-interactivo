import {
  apiErrorSchema,
  attemptResponseSchema,
  publishQuizResponseSchema,
  quizValidationResponseSchema,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { UserProgress } from '../models/UserProgress.js';
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

async function world() {
  const { app } = createTestHarness();
  await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  await createUser({ email: 'editora@ejemplo.com', role: 'EDITOR' });
  await createUser();
  const book = await createBook();
  return {
    app,
    book,
    admin: await loginAgent(app, 'admin@ejemplo.com'),
    editor: await loginAgent(app, 'editora@ejemplo.com'),
    reader: await loginAgent(app),
  };
}

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;

describe('permisos de /api/admin/quizzes', () => {
  it('sin sesión 401, lector 403, EDITOR y ADMIN permitidos', async () => {
    const { app, book, admin, editor, reader } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const url = `/api/admin/quizzes/${quiz._id.toString()}/validate`;
    await request(app).post(url).expect(401);
    expect((await reader.post(url)).status).toBe(403);
    expect(code(await reader.post(url))).toBe('FORBIDDEN');
    await editor.post(url).expect(200);
    await admin.post(url).expect(200);
  });

  it('el lector tampoco puede publicar ni probar', async () => {
    const { book, reader } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const id = quiz._id.toString();
    expect((await reader.post(`/api/admin/quizzes/${id}/publish`)).status).toBe(403);
    expect((await reader.post(`/api/admin/quizzes/${id}/preview`)).status).toBe(403);
    expect(await QuizVersion.countDocuments()).toBe(0);
  });

  it('valida el id (400) y responde 404 si el quiz no existe', async () => {
    const { admin } = await world();
    expect((await admin.post('/api/admin/quizzes/xx/validate')).status).toBe(400);
    expect((await admin.post('/api/admin/quizzes/670000000000000000000099/publish')).status).toBe(
      404,
    );
  });
});

describe('POST /api/admin/quizzes/:id/validate', () => {
  it('un quiz correcto es válido (con avisos si los hay)', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: twoStageContent() });
    const res = await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/validate`).expect(200);
    expect(quizValidationResponseSchema.parse(res.body)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('informa de los errores de integridad con su código y su ubicación', async () => {
    const { admin, book } = await world();
    const content = simpleContent();
    content.stages[0]!.questions[0]!.answers[0]!.resultKey = 'fantasma';
    const quiz = await createQuiz({ bookId: book._id, order: 1, content });
    const res = await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/validate`).expect(200);
    const body = quizValidationResponseSchema.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.errors[0]).toMatchObject({ code: 'ANSWER_UNKNOWN_RESULT' });
    expect(body.errors[0]?.path).toContain('etapa-1');
  });

  it('un borrador que ni siquiera cumple el esquema se informa como error SCHEMA', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    await Quiz.updateOne({ _id: quiz._id }, { $set: { 'draft.stages': [] } });
    const body = quizValidationResponseSchema.parse(
      (await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/validate`).expect(200)).body,
    );
    expect(body.valid).toBe(false);
    expect(body.errors[0]?.code).toBe('SCHEMA');
  });
});

describe('POST /api/admin/quizzes/:id/publish', () => {
  it('crea la versión 1 inmutable y deja el quiz publicado', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const res = await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/publish`).expect(201);
    const body = publishQuizResponseSchema.parse(res.body);
    expect(body.version).toBe(1);

    const stored = await Quiz.findById(quiz._id).lean();
    expect(stored).toMatchObject({ status: 'published', currentVersion: 1 });
    const version = await QuizVersion.findOne({ quizId: quiz._id }).lean();
    expect(version?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(version?.publishedBy).toBeDefined();
  });

  it('rechaza publicar sin cambios (409) y publica la siguiente versión cuando se edita', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const url = `/api/admin/quizzes/${quiz._id.toString()}/publish`;
    await admin.post(url).expect(201);
    const same = await admin.post(url);
    expect(same.status).toBe(409);
    expect(code(same)).toBe('CONFLICT');
    expect(await QuizVersion.countDocuments()).toBe(1);

    await Quiz.updateOne({ _id: quiz._id }, { $set: { title: '[PLACEHOLDER] Título nuevo' } });
    const second = publishQuizResponseSchema.parse((await admin.post(url).expect(201)).body);
    expect(second.version).toBe(2);
    expect(await QuizVersion.countDocuments()).toBe(2);
  });

  it('un cambio de reglas (allowRetake) también cuenta como cambio', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const url = `/api/admin/quizzes/${quiz._id.toString()}/publish`;
    await admin.post(url).expect(201);
    await Quiz.updateOne({ _id: quiz._id }, { $set: { 'settings.allowRetake': false } });
    await admin.post(url).expect(201);
    const latest = await QuizVersion.findOne({ quizId: quiz._id, version: 2 }).lean();
    expect((latest?.settings as { allowRetake: boolean }).allowRetake).toBe(false);
  });

  it('no publica un quiz con errores de integridad: 400 y sin versión', async () => {
    const { admin, book } = await world();
    const content = twoStageContent();
    content.stages = content.stages.filter((stage) => stage.id !== 'etapa-agua');
    content.results = content.results.filter((result) => result.stageId !== 'etapa-agua');
    const quiz = await createQuiz({ bookId: book._id, order: 1, content });
    const res = await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/publish`);
    expect(res.status).toBe(400);
    expect(code(res)).toBe('VALIDATION');
    expect(await QuizVersion.countDocuments()).toBe(0);
    expect((await Quiz.findById(quiz._id))?.status).toBe('draft');
  });

  it('no publica un quiz archivado', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    await Quiz.updateOne({ _id: quiz._id }, { $set: { status: 'archived' } });
    expect((await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/publish`)).status).toBe(
      409,
    );
  });

  it('dos publicaciones simultáneas crean una sola versión', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const url = `/api/admin/quizzes/${quiz._id.toString()}/publish`;
    const statuses = (await Promise.all([admin.post(url), admin.post(url)])).map(
      (res) => res.status,
    );
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(await QuizVersion.countDocuments()).toBe(1);
  });

  it('lo publicado llega a los lectores: antes 404, después se puede jugar', async () => {
    const { admin, reader, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const id = quiz._id.toString();
    expect((await reader.get(`/api/quizzes/${id}`)).status).toBe(404);
    await admin.post(`/api/admin/quizzes/${id}/publish`).expect(201);
    await reader.get(`/api/quizzes/${id}`).expect(200);
  });
});

describe('POST /api/admin/quizzes/:id/preview', () => {
  it('exige haber publicado alguna vez (409)', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    expect((await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/preview`)).status).toBe(
      409,
    );
  });

  it('crea un intento de prueba que no cuenta en progreso', async () => {
    const { admin, editor, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    const id = quiz._id.toString();
    await admin.post(`/api/admin/quizzes/${id}/publish`).expect(201);

    for (const agent of [admin, editor]) {
      const res = await agent.post(`/api/admin/quizzes/${id}/preview`).expect(200);
      const started = attemptResponseSchema.parse(res.body);
      expect(JSON.stringify(res.body)).not.toContain('resultKey');
      expect((await QuizAttempt.findById(started.attemptId))?.isTest).toBe(true);
    }
    expect(await UserProgress.countDocuments()).toBe(0);
  });
});

describe('quizVersions es inmutable', () => {
  it('ni el código de la aplicación puede actualizar ni borrar una versión publicada', async () => {
    const { admin, book } = await world();
    const quiz = await createQuiz({ bookId: book._id, order: 1, content: simpleContent() });
    await admin.post(`/api/admin/quizzes/${quiz._id.toString()}/publish`).expect(201);
    const version = await QuizVersion.findOne({ quizId: quiz._id }).orFail();

    await expect(
      QuizVersion.updateOne({ _id: version._id }, { $set: { title: 'otro' } }),
    ).rejects.toThrow(/inmutables/);
    await expect(QuizVersion.deleteOne({ _id: version._id })).rejects.toThrow(/inmutables/);
    await expect(
      QuizVersion.findOneAndUpdate({ _id: version._id }, { title: 'otro' }),
    ).rejects.toThrow(/inmutables/);

    // Tampoco con save() sobre un documento cargado.
    version.title = 'otro';
    await version.save();
    expect((await QuizVersion.findById(version._id))?.title).toBe(simpleContent().title);
  });
});
