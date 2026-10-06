import {
  apiErrorSchema,
  attemptResponseSchema,
  publishQuizResponseSchema,
  quizDetailResponseSchema,
  quizListResponseSchema,
  quizValidationResponseSchema,
  quizVersionsResponseSchema,
  type QuizDraftPayload,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;

/** Borrador completo y válido de un quiz de una etapa con 3 preguntas y 3 resultados. */
function fullDraft(over: Partial<QuizDraftPayload> = {}): QuizDraftPayload {
  const content = simpleContent({ title: '[PLACEHOLDER] Quiz editado' });
  return { ...content, ...over };
}

async function setup() {
  const world = await staffWorld();
  const book = await createBook();
  const create = async (over: Record<string, unknown> = {}) => {
    const res = await world.editor
      .post('/api/admin/quizzes')
      .send({ bookId: book._id.toString(), slug: 'quiz-1', order: 1, title: '[PLACEHOLDER] Quiz 1', ...over })
      .expect(201);
    return quizDetailResponseSchema.parse(res.body);
  };
  return { ...world, book, create };
}

describe('permisos de /api/admin/quizzes (edición)', () => {
  it('sin sesión 401, lector 403, EDITOR y ADMIN permitidos', async () => {
    const { app, reader, editor, admin, book } = await setup();
    const q = { bookId: book._id.toString() };
    await request(app).get('/api/admin/quizzes').query(q).expect(401);
    expect((await reader.get('/api/admin/quizzes').query(q)).status).toBe(403);
    expect(
      (await reader.post('/api/admin/quizzes').send({ ...q, slug: 'a', order: 1, title: 'A' })).status,
    ).toBe(403);
    expect((await reader.put('/api/admin/quizzes/670000000000000000000001/draft').send(fullDraft())).status).toBe(403);
    await editor.get('/api/admin/quizzes').query(q).expect(200);
    await admin.get('/api/admin/quizzes').query(q).expect(200);
    expect(await Quiz.countDocuments()).toBe(0);
  });
});

describe('POST /api/admin/quizzes', () => {
  it('crea un quiz en borrador y la regla «¿se puede repetir?» se elige al crear (por defecto sí)', async () => {
    const { create } = await setup();
    const defaults = await create();
    expect(defaults).toMatchObject({ status: 'draft', currentVersion: 0, allowRetake: true, showBreakdown: false });
    expect(defaults.draft.stages).toEqual([]);
    expect(defaults.hasUnpublishedChanges).toBe(true);

    const once = await create({ slug: 'quiz-2', order: 2, settings: { allowRetake: false, showBreakdown: true } });
    expect(once).toMatchObject({ allowRetake: false, showBreakdown: true });
  });

  it('valida los datos y responde 404 si el libro no existe', async () => {
    const { editor, book } = await setup();
    const id = book._id.toString();
    for (const body of [
      { bookId: id, slug: 'Quiz Uno', order: 1, title: 'A' },
      { bookId: id, slug: 'quiz', order: 0, title: 'A' },
      { bookId: id, slug: 'quiz', order: 1, title: '' },
      { bookId: 'no', slug: 'quiz', order: 1, title: 'A' },
    ]) {
      expect((await editor.post('/api/admin/quizzes').send(body)).status).toBe(400);
    }
    const missing = await editor
      .post('/api/admin/quizzes')
      .send({ bookId: '670000000000000000000099', slug: 'quiz', order: 1, title: 'A' });
    expect(missing.status).toBe(404);
  });

  it('un slug o una posición repetidos responden 409; archivar libera la posición', async () => {
    const { editor, create } = await setup();
    const first = await create();
    const slugDup = await editor.post('/api/admin/quizzes').send({ bookId: first.bookId, slug: 'quiz-1', order: 2, title: 'B' });
    expect(slugDup.status).toBe(409);
    expect(apiErrorSchema.parse(slugDup.body).error.message).toMatch(/slug/i);
    const orderDup = await editor.post('/api/admin/quizzes').send({ bookId: first.bookId, slug: 'otro', order: 1, title: 'B' });
    expect(orderDup.status).toBe(409);
    expect(apiErrorSchema.parse(orderDup.body).error.message).toMatch(/posici/i);

    await editor.post(`/api/admin/quizzes/${first.id}/archive`).expect(200);
    await editor.post('/api/admin/quizzes').send({ bookId: first.bookId, slug: 'otro', order: 1, title: 'B' }).expect(201);
  });
});

describe('GET /api/admin/quizzes', () => {
  it('lista los quizzes de un libro por orden, con filtro de estado y exige bookId', async () => {
    const { editor, create, book } = await setup();
    await create({ slug: 'dos', order: 2 });
    const one = await create({ slug: 'uno', order: 1 });
    await editor.post(`/api/admin/quizzes/${one.id}/archive`).expect(200);
    const all = quizListResponseSchema.parse(
      (await editor.get('/api/admin/quizzes').query({ bookId: book._id.toString() }).expect(200)).body,
    );
    expect(all.quizzes.map((q) => [q.slug, q.status])).toEqual([['uno', 'archived'], ['dos', 'draft']]);
    const drafts = quizListResponseSchema.parse(
      (await editor.get('/api/admin/quizzes').query({ bookId: book._id.toString(), status: 'draft' }).expect(200)).body,
    );
    expect(drafts.quizzes.map((q) => q.slug)).toEqual(['dos']);
    expect((await editor.get('/api/admin/quizzes')).status).toBe(400);
  });

  it('el detalle trae el borrador completo y responde 404 si no existe', async () => {
    const { editor, create } = await setup();
    const quiz = await create();
    const detail = quizDetailResponseSchema.parse((await editor.get(`/api/admin/quizzes/${quiz.id}`).expect(200)).body);
    expect(detail.draft).toMatchObject({ title: '[PLACEHOLDER] Quiz 1', stages: [], results: [] });
    expect((await editor.get('/api/admin/quizzes/670000000000000000000099')).status).toBe(404);
  });
});

describe('PUT /api/admin/quizzes/:id/draft', () => {
  it('guarda un borrador INCOMPLETO (textos vacíos, preguntas sin respuestas) sin exigir validez', async () => {
    const { editor, create } = await setup();
    const quiz = await create();
    const half: QuizDraftPayload = {
      title: '[PLACEHOLDER] A medias',
      instructionsHtml: '',
      settings: { allowRetake: true, showBreakdown: false },
      stages: [
        {
          id: 'etapa-1',
          order: 1,
          producesFinal: true,
          questions: [{ id: 'p1', text: '', answers: [{ id: 'p1a', text: '', resultKey: '' }] }],
        },
      ],
      results: [],
    };
    const res = await editor.put(`/api/admin/quizzes/${quiz.id}/draft`).send(half).expect(200);
    const saved = quizDetailResponseSchema.parse(res.body);
    expect(saved.title).toBe('[PLACEHOLDER] A medias');
    expect(saved.draft.stages[0]?.questions[0]?.answers).toHaveLength(1);
    // …pero validar lo marca como no válido.
    const check = quizValidationResponseSchema.parse(
      (await editor.post(`/api/admin/quizzes/${quiz.id}/validate`).expect(200)).body,
    );
    expect(check.valid).toBe(false);
  });

  it('sanea el HTML de las instrucciones y de la descripción de cada resultado', async () => {
    const { editor, create } = await setup();
    const quiz = await create();
    const draft = fullDraft({ instructionsHtml: '<p>Hola</p><script>alert(1)</script>' });
    draft.results = draft.results.map((result) => ({
      ...result,
      description: '<p onclick="alert(1)">Desc</p><img src="x" onerror="alert(1)">',
    }));
    const res = await editor.put(`/api/admin/quizzes/${quiz.id}/draft`).send(draft).expect(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/<script|onerror|onclick|alert\(1\)/);
    expect(quizDetailResponseSchema.parse(res.body).draft.instructionsHtml).toBe('<p>Hola</p>');
    const stored = await Quiz.findById(quiz.id).lean();
    expect(JSON.stringify(stored)).not.toMatch(/<script|onerror|onclick/);
  });

  it('rechaza imágenes y videos que no sean de Cloudinary, y ids con símbolos', async () => {
    const { editor, create } = await setup();
    const quiz = await create();
    const url = `/api/admin/quizzes/${quiz.id}/draft`;
    const external = image('x', { url: 'https://malo.com/a.png' });

    const withImage = fullDraft({ image: external });
    expect((await editor.put(url).send(withImage)).status).toBe(400);

    const withVideo = fullDraft();
    withVideo.results = withVideo.results.map((result, i) =>
      i === 0
        ? {
            ...result,
            media: {
              kind: 'video' as const,
              video: {
                provider: 'cloudinary' as const,
                publicId: 'x',
                url: 'https://malo.com/v.mp4',
                width: 640,
                height: 360,
                durationSeconds: 4,
                alt: '',
              },
            },
          }
        : result,
    );
    expect((await editor.put(url).send(withVideo)).status).toBe(400);

    const badId = fullDraft();
    badId.stages[0]!.id = 'etapa 1!';
    const res = await editor.put(url).send(badId);
    expect(res.status).toBe(400);
    expect(code(res)).toBe('VALIDATION');
  });

  it('acepta imagen y video de Cloudinary en los resultados', async () => {
    const { editor, create } = await setup();
    const quiz = await create();
    const draft = fullDraft();
    draft.results[0] = {
      ...draft.results[0]!,
      media: {
        kind: 'video',
        video: {
          provider: 'cloudinary',
          publicId: 'libro/quiz/r1',
          url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz/r1',
          posterUrl: 'https://res.cloudinary.com/demo/image/upload/libro/quiz/r1.jpg',
          width: 640,
          height: 360,
          durationSeconds: 4,
          alt: '[PLACEHOLDER]',
        },
      },
    };
    draft.results[1] = { ...draft.results[1]!, media: { kind: 'image', image: image('r2') } };
    await editor.put(`/api/admin/quizzes/${quiz.id}/draft`).send(draft).expect(200);
  });

  it('un quiz archivado no se puede editar (409) y 404 si no existe', async () => {
    const { editor, create } = await setup();
    const quiz = await create();
    await editor.post(`/api/admin/quizzes/${quiz.id}/archive`).expect(200);
    expect((await editor.put(`/api/admin/quizzes/${quiz.id}/draft`).send(fullDraft())).status).toBe(409);
    expect((await editor.patch(`/api/admin/quizzes/${quiz.id}`).send({ order: 5 })).status).toBe(409);
    expect((await editor.put('/api/admin/quizzes/670000000000000000000099/draft').send(fullDraft())).status).toBe(404);
  });

  it('cambiar «¿se puede repetir?» queda en el borrador y rige desde la siguiente publicación', async () => {
    const { editor, create } = await setup();
    const quiz = await create({ settings: { allowRetake: false, showBreakdown: false } });
    await editor.put(`/api/admin/quizzes/${quiz.id}/draft`).send(fullDraft()).expect(200); // fullDraft trae allowRetake=true
    const detail = quizDetailResponseSchema.parse((await editor.get(`/api/admin/quizzes/${quiz.id}`).expect(200)).body);
    expect(detail.allowRetake).toBe(true);
  });
});

describe('PATCH /api/admin/quizzes/:id (slug y posición)', () => {
  it('cambia el slug y la posición, exige al menos uno y respeta los únicos', async () => {
    const { editor, create } = await setup();
    const a = await create();
    const b = await create({ slug: 'quiz-2', order: 2 });
    const moved = quizDetailResponseSchema.parse(
      (await editor.patch(`/api/admin/quizzes/${a.id}`).send({ slug: 'nuevo', order: 3 }).expect(200)).body,
    );
    expect(moved).toMatchObject({ slug: 'nuevo', order: 3 });
    expect((await editor.patch(`/api/admin/quizzes/${a.id}`).send({})).status).toBe(400);
    expect((await editor.patch(`/api/admin/quizzes/${a.id}`).send({ order: 2 })).status).toBe(409);
    expect((await editor.patch(`/api/admin/quizzes/${b.id}`).send({ slug: 'nuevo' })).status).toBe(409);
  });
});

describe('flujo completo: crear → editar → validar → publicar → jugar', () => {
  it('publica versiones, detecta cambios sin publicar y lista las versiones con sus intentos', async () => {
    const { app, editor, create, book, editorUser } = await setup();
    const quiz = await create();
    const draftUrl = `/api/admin/quizzes/${quiz.id}/draft`;
    const detailUrl = `/api/admin/quizzes/${quiz.id}`;

    await editor.put(draftUrl).send(fullDraft()).expect(200);
    const valid = quizValidationResponseSchema.parse(
      (await editor.post(`${detailUrl}/validate`).expect(200)).body,
    );
    expect(valid).toMatchObject({ valid: true, errors: [] });

    const published = publishQuizResponseSchema.parse((await editor.post(`${detailUrl}/publish`).expect(201)).body);
    expect(published.version).toBe(1);
    const afterPublish = quizDetailResponseSchema.parse((await editor.get(detailUrl).expect(200)).body);
    expect(afterPublish).toMatchObject({ status: 'published', currentVersion: 1, hasUnpublishedChanges: false });

    // Una lectora juega la versión 1.
    const readerAgent = await loginAgent(app);
    const started = attemptResponseSchema.parse(
      (await readerAgent.post(`/api/quizzes/${quiz.id}/attempts`).expect(200)).body,
    );
    if (started.status !== 'in_progress') throw new Error('Debía iniciar');
    const done = await readerAgent
      .post(`/api/attempts/${started.attemptId}/stages/${started.stage.stageId}/answers`)
      .send({ answers: started.stage.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id })) })
      .expect(200);
    expect(attemptResponseSchema.parse(done.body).status).toBe('completed');

    // Editar el borrador: aparece «cambios sin publicar» pero la versión 1 y el intento no cambian.
    const edited = fullDraft({ title: '[PLACEHOLDER] Título v2' });
    await editor.put(draftUrl).send(edited).expect(200);
    expect(quizDetailResponseSchema.parse((await editor.get(detailUrl).expect(200)).body).hasUnpublishedChanges).toBe(true);
    expect((await QuizVersion.findOne({ quizId: quiz.id, version: 1 }))?.title).toBe('[PLACEHOLDER] Quiz editado');

    expect(publishQuizResponseSchema.parse((await editor.post(`${detailUrl}/publish`).expect(201)).body).version).toBe(2);
    const versions = quizVersionsResponseSchema.parse((await editor.get(`${detailUrl}/versions`).expect(200)).body);
    expect(versions.versions.map((v) => [v.version, v.attempts])).toEqual([[2, 0], [1, 1]]);
    expect(versions.versions[0]?.publishedBy).toBe(editorUser._id.toString());

    // Listado: ya figura como publicado (versión 2).
    const list = quizListResponseSchema.parse(
      (await editor.get('/api/admin/quizzes').query({ bookId: book._id.toString() }).expect(200)).body,
    );
    expect(list.quizzes[0]).toMatchObject({ status: 'published', currentVersion: 2 });
  });

  it('publicar re-sanea: un borrador con HTML peligroso (p. ej. cargado por seed) no llega a la versión publicada', async () => {
    const { editor, create } = await setup();
    const quiz = await create();
    await editor.put(`/api/admin/quizzes/${quiz.id}/draft`).send(fullDraft()).expect(200);
    // Se simula un borrador escrito sin pasar por el editor (seed o una escritura directa).
    await Quiz.updateOne(
      { _id: quiz.id },
      { $set: { instructionsHtml: '<p>Hola</p><script>alert(1)</script>', 'draft.results.0.description': '<img src=x onerror=alert(1)>' } },
    );
    await editor.post(`/api/admin/quizzes/${quiz.id}/publish`).expect(201);
    const version = await QuizVersion.findOne({ quizId: quiz.id }).lean();
    expect(JSON.stringify(version)).not.toMatch(/<script|onerror|alert\(1\)/);
    expect(version?.instructionsHtml).toBe('<p>Hola</p>');
  });

  it('un quiz sin publicar nunca es visible para las lectoras y «probar» exige publicar', async () => {
    const { reader, editor, create } = await setup();
    const quiz = await create();
    await editor.put(`/api/admin/quizzes/${quiz.id}/draft`).send(fullDraft()).expect(200);
    expect((await reader.get(`/api/quizzes/${quiz.id}`)).status).toBe(404);
    expect((await editor.post(`/api/admin/quizzes/${quiz.id}/preview`)).status).toBe(409);
  });
});
