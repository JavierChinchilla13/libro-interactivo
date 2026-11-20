import {
  adminStatsSchema,
  attemptResponseSchema,
  progressResponseSchema,
  quizIntroResponseSchema,
  resultsListResponseSchema,
  testProgressResetResponseSchema,
  type QuizContent,
} from '@libro/shared';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { repairProgress } from '../maintenance/repairProgress.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { eraseUserData } from '../services/userErasure.service.js';

useTestDb();

/** Claves de resultado reconocibles: si alguna aparece en un payload previo al resultado, hay una fuga. */
const SECRETS = ['clave-secreta-uno', 'clave-secreta-dos', 'clave-secreta-tres'];
const FORBIDDEN = ['draftSnapshot', 'resultKey', 'quizVersionId'];

const withSecretKeys = (content: QuizContent): QuizContent =>
  JSON.parse(
    JSON.stringify(content)
      .replaceAll('"r1"', `"${SECRETS[0]}"`)
      .replaceAll('"r2"', `"${SECRETS[1]}"`)
      .replaceAll('"r3"', `"${SECRETS[2]}"`),
  ) as QuizContent;

async function world() {
  const w = await staffWorld();
  const published = await Book.create({
    slug: 'libro-1',
    title: '[PLACEHOLDER] Libro 1',
    order: 1,
    status: 'published',
    cover: image('c1'),
  });
  const upcoming = await Book.create({
    slug: 'libro-2',
    title: '[PLACEHOLDER] Libro 2',
    order: 2,
    status: 'upcoming',
    cover: image('c2'),
  });
  // Quiz A: publicado (v1) y con el borrador cambiado después (cambios sin publicar).
  const contentA = withSecretKeys(simpleContent({ title: '[PLACEHOLDER] Quiz A publicado' }));
  const quizA = await createQuiz({
    bookId: published._id,
    order: 1,
    content: contentA,
    publishedBy: w.adminUser._id,
  });
  // Quiz B: nunca se publicó (solo borrador).
  const contentB = withSecretKeys(simpleContent({ title: '[PLACEHOLDER] Quiz B nunca publicado' }));
  const quizB = await createQuiz({ bookId: upcoming._id, order: 1, content: contentB });
  const retitle = (quizId: string, title: string) =>
    Quiz.updateOne(
      { _id: quizId },
      { $set: { title, 'draft.results.0.title': `[PLACEHOLDER] ${title}` } },
    );
  return {
    ...w,
    quizA: quizA._id.toString(),
    quizB: quizB._id.toString(),
    published,
    upcoming,
    retitle,
    visitor: supertest(w.app),
  };
}

type World = Awaited<ReturnType<typeof world>>;
const testIntro = (quizId: string) => `/api/admin/quizzes/${quizId}/test-intro`;
const testStart = (quizId: string) => `/api/admin/quizzes/${quizId}/test-attempts`;
const answers = (stage: { questions: { id: string; answers: { id: string }[] }[] }) => ({
  answers: stage.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]?.id })),
});
const submit = (
  agent: supertest.Agent | World['admin'],
  attemptId: string,
  stageId: string,
  body: object,
) => agent.post(`/api/attempts/${attemptId}/stages/${stageId}/answers`).send(body);

/** Empieza una prueba del borrador y la termina; devuelve las respuestas que vio el equipo. */
async function playDraft(w: World, quizId: string, agent = w.admin) {
  const start = await agent.post(testStart(quizId)).expect(200);
  const started = attemptResponseSchema.parse(start.body);
  if (started.status !== 'in_progress') throw new Error('Se esperaba una etapa en curso');
  const done = await submit(
    agent,
    started.attemptId,
    started.stage.stageId,
    answers(started.stage),
  ).expect(200);
  return {
    start,
    done,
    attemptId: started.attemptId,
    result: attemptResponseSchema.parse(done.body),
  };
}

describe('el borrador se valida como al publicar y no crea versiones', () => {
  it('un borrador con errores no se puede probar (mismos mensajes que «Revisar»); las advertencias no bloquean', async () => {
    const w = await world();
    await Quiz.updateOne({ _id: w.quizA }, { $set: { 'draft.results': [] } });
    for (const res of [
      await w.admin.post(testStart(w.quizA)),
      await w.admin.get(testIntro(w.quizA)),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
      expect(res.body.error.message).toMatch(/^El quiz tiene errores: /);
    }
    expect(await QuizAttempt.countDocuments()).toBe(0);

    // Una advertencia (campo de poder que no existe) no impide probar.
    const quiz = await Quiz.findById(w.quizB).orFail();
    const results = JSON.parse(JSON.stringify(quiz.draft?.results ?? []));
    results[0].fieldSlug = 'campo-que-no-existe';
    await Quiz.updateOne({ _id: w.quizB }, { $set: { 'draft.results': results } });
    const check = await w.admin.post(`/api/admin/quizzes/${w.quizB}/validate`).expect(200);
    expect(check.body.valid).toBe(true);
    expect(check.body.warnings.length).toBeGreaterThan(0);
    await w.admin.post(testStart(w.quizB)).expect(200);
  });

  it('no se crea ninguna QuizVersion ni cambia currentVersion al probar el borrador', async () => {
    const w = await world();
    await w.retitle(w.quizA, 'Quiz A con cambios');
    const versions = await QuizVersion.countDocuments();
    const before = await Quiz.findById(w.quizA).lean();
    await playDraft(w, w.quizA);
    await playDraft(w, w.quizB);
    expect(await QuizVersion.countDocuments()).toBe(versions);
    const after = await Quiz.findById(w.quizA).lean();
    expect(after?.currentVersion).toBe(before?.currentVersion);
    expect(after?.status).toBe('published');
    expect((await Quiz.findById(w.quizB).lean())?.currentVersion).toBe(0);
    expect((await Quiz.findById(w.quizB).lean())?.status).toBe('draft');
  });
});

describe('la prueba del borrador usa el contenido del borrador, congelado al empezar', () => {
  it('el resultado es el del borrador (no el publicado) y lo editado después no cambia el intento en curso', async () => {
    const w = await world();
    await w.retitle(w.quizA, 'Quiz A versión borrador');
    const intro = quizIntroResponseSchema.parse(
      (await w.admin.get(testIntro(w.quizA)).expect(200)).body,
    );
    expect(intro.title).toBe('Quiz A versión borrador');
    // Lo publicado sigue con su título.
    expect(
      quizIntroResponseSchema.parse((await w.admin.get(`/api/quizzes/${w.quizA}`).expect(200)).body)
        .title,
    ).toBe('[PLACEHOLDER] Quiz A publicado');

    const started = attemptResponseSchema.parse(
      (await w.admin.post(testStart(w.quizA)).expect(200)).body,
    );
    if (started.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    // Se edita el borrador DESPUÉS de empezar: el intento sigue con su copia.
    await w.retitle(w.quizA, 'Editado después de empezar');
    const done = attemptResponseSchema.parse(
      (
        await submit(
          w.admin,
          started.attemptId,
          started.stage.stageId,
          answers(started.stage),
        ).expect(200)
      ).body,
    );
    if (done.status !== 'completed') throw new Error('Se esperaba el resultado');
    expect(done.result.title).toBe('[PLACEHOLDER] Quiz A versión borrador');
  });

  it('un quiz SIN ninguna versión publicada se puede probar como borrador (y por la ruta publicada no existe)', async () => {
    const w = await world();
    const { result } = await playDraft(w, w.quizB);
    expect(result.status).toBe('completed');
    const intro = quizIntroResponseSchema.parse(
      (await w.editor.get(testIntro(w.quizB)).expect(200)).body,
    );
    expect(intro.title).toBe('[PLACEHOLDER] Quiz B nunca publicado');
    expect((await w.admin.get(`/api/quizzes/${w.quizB}`)).status).toBe(404);
    // Un quiz archivado o de un libro archivado no se prueba.
    await Quiz.updateOne({ _id: w.quizA }, { $set: { status: 'archived' } });
    expect((await w.admin.post(testStart(w.quizA))).status).toBe(409);
    await Quiz.updateOne({ _id: w.quizA }, { $set: { status: 'published' } });
    await Book.updateOne({ _id: w.published._id }, { $set: { status: 'archived' } });
    expect((await w.admin.post(testStart(w.quizA))).status).toBe(404);
  });

  it('empezar la prueba del quiz publicado descarta una prueba de borrador abierta (solo hay un intento abierto)', async () => {
    const w = await world();
    const started = attemptResponseSchema.parse(
      (await w.admin.post(testStart(w.quizA)).expect(200)).body,
    );
    expect(await QuizAttempt.countDocuments({ status: 'in_progress' })).toBe(1);
    await w.admin.post(`/api/quizzes/${w.quizA}/attempts`).expect(200);
    const open = await QuizAttempt.find({ status: 'in_progress' }).lean();
    expect(open).toHaveLength(1);
    expect(String(open[0]?._id)).not.toBe(
      started.status === 'in_progress' ? started.attemptId : '',
    );
    expect(open[0]?.quizVersionId).toBeDefined();
  });
});

describe('quién puede probar un borrador y quién puede leerlo o contestarlo', () => {
  it('solo EDITOR o ADMIN: sin sesión 401 y lector 403, sin crear nada', async () => {
    const w = await world();
    for (const url of [testIntro(w.quizA)]) {
      expect((await w.visitor.get(url)).status).toBe(401);
      expect((await w.reader.get(url)).status).toBe(403);
      await w.editor.get(url).expect(200);
      await w.admin.get(url).expect(200);
    }
    expect((await w.visitor.post(testStart(w.quizA))).status).toBe(401);
    expect((await w.reader.post(testStart(w.quizA))).status).toBe(403);
    expect(await QuizAttempt.countDocuments()).toBe(0);
    await w.editor.post(testStart(w.quizA)).expect(200);
    await w.admin.post(testStart(w.quizA)).expect(200);
  });

  it('un intento con copia solo lo contesta su dueño del equipo: otra cuenta, un lector o un intento no de prueba dan 404', async () => {
    const w = await world();
    const started = attemptResponseSchema.parse(
      (await w.admin.post(testStart(w.quizA)).expect(200)).body,
    );
    if (started.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    const body = answers(started.stage);
    for (const agent of [w.editor, w.reader]) {
      const res = await submit(agent, started.attemptId, started.stage.stageId, body);
      expect(res.status).toBe(404);
      expect(res.text).not.toMatch(/Quiz A|clave-secreta|draftSnapshot/);
    }
    expect(
      (await submit(w.visitor as never, started.attemptId, started.stage.stageId, body)).status,
    ).toBe(401);
    // Forjado en la base: la copia en un intento de un LECTOR, o en uno que no es de prueba, no se usa para contestar.
    await QuizAttempt.updateOne(
      { _id: started.attemptId },
      { $set: { userId: w.adminUser._id, isTest: false } },
    );
    expect((await submit(w.admin, started.attemptId, started.stage.stageId, body)).status).toBe(
      404,
    );
    await QuizAttempt.updateOne(
      { _id: started.attemptId },
      {
        $set: {
          userId: (await QuizAttempt.findById(started.attemptId).lean())?.userId,
          isTest: true,
        },
      },
    );
    const readerId = (await w.reader.get('/api/me')).body.user.id as string;
    await QuizAttempt.updateOne({ _id: started.attemptId }, { $set: { userId: readerId } });
    expect((await submit(w.reader, started.attemptId, started.stage.stageId, body)).status).toBe(
      404,
    );
    expect(await QuizAttempt.findOne({ _id: started.attemptId, status: 'completed' })).toBeNull();
  });
});

describe('la copia del borrador no sale del servidor', () => {
  it('draftSnapshot tiene select:false: ninguna consulta normal la carga; solo se pide con +draftSnapshot', async () => {
    const w = await world();
    const { attemptId } = await playDraft(w, w.quizA);
    const plain = await QuizAttempt.findById(attemptId).lean();
    expect(plain).not.toHaveProperty('draftSnapshot');
    expect(plain?.quizVersionId).toBeUndefined();
    expect(plain?.version).toBe(0);
    const withIt = await QuizAttempt.findById(attemptId).select('+draftSnapshot').lean();
    expect(withIt?.draftSnapshot).toBeDefined();
    expect(JSON.stringify(await QuizAttempt.find().lean())).not.toContain('draftSnapshot');
  });

  it('con un intento de borrador completo, ninguna respuesta trae draftSnapshot, resultKey ni quizVersionId', async () => {
    const w = await world();
    await w.retitle(w.quizA, 'Quiz A versión borrador');
    // Un intento publicado de prueba del mismo quiz, para que los listados tengan datos reales y de borrador a la vez.
    await w.admin.post(`/api/quizzes/${w.quizA}/attempts`).expect(200);
    const bodies: { name: string; text: string; final?: boolean }[] = [];
    const record = (name: string, res: { text: string }, final = false) =>
      bodies.push({ name, text: res.text, final });

    record('test-intro', await w.admin.get(testIntro(w.quizA)).expect(200));
    const { start, done, attemptId } = await playDraft(w, w.quizA);
    record('test-attempts (etapa)', start);
    record('respuestas (resultado final)', done, true);
    // Todo lo que lee el equipo después, con el intento de borrador ya completo.
    const adminId = w.adminUser._id.toString();
    record('GET /quizzes/:id', await w.admin.get(`/api/quizzes/${w.quizA}`).expect(200));
    record(
      'GET /me/results',
      await w.admin.get(`/api/me/results?bookId=${w.published._id}`).expect(200),
    );
    record(
      'GET /me/progress',
      await w.admin.get(`/api/me/progress?bookId=${w.published._id}`).expect(200),
    );
    record(
      'GET /me/progress (próximo)',
      await w.admin.get(`/api/me/progress?bookId=${w.upcoming._id}`).expect(200),
    );
    record('GET /me/library', await w.admin.get('/api/me/library').expect(200));
    record('GET /admin/stats', await w.admin.get('/api/admin/stats').expect(200));
    record('GET /admin/users', await w.admin.get('/api/admin/users').expect(200));
    record('GET /admin/users/:id', await w.admin.get(`/api/admin/users/${adminId}`).expect(200));
    record(
      'GET /me/results (lector)',
      await w.reader.get(`/api/me/results?bookId=${w.published._id}`).expect(200),
    );
    record('GET /me/library (lector)', await w.reader.get('/api/me/library').expect(200));
    // El resultado de lo publicado (que el equipo sí puede leer) no debe traer nada de la copia.
    await w.admin
      .get(`/api/me/results/${w.quizA}`)
      .then((res) => record('GET /me/results/:quizId', res));

    for (const { name, text, final } of bodies) {
      for (const word of FORBIDDEN) expect(text, `${name} trae «${word}»`).not.toContain(word);
      // Antes del resultado final nunca viaja una clave de resultado; el final trae su resultado y nada más.
      if (!final)
        for (const secret of SECRETS)
          expect(text, `${name} trae «${secret}»`).not.toContain(secret);
    }
    // El informe de reparación (mantenimiento) tampoco lo incluye ni cuenta el intento de borrador.
    const report = await repairProgress({ apply: false });
    const reportText = JSON.stringify(report);
    for (const word of FORBIDDEN) expect(reportText).not.toContain(word);
    expect(reportText).not.toContain(attemptId);
  });
});

describe('lo que no cuenta: resultados, estadísticas, avance y vencimiento', () => {
  it('los resultados, el avance y la introducción del quiz publicado ignoran los intentos de borrador', async () => {
    const w = await world();
    await playDraft(w, w.quizA);
    await playDraft(w, w.quizB);
    // Resultados: ni el quiz publicado ni el nunca publicado muestran el intento de borrador.
    for (const bookId of [w.published._id, w.upcoming._id]) {
      expect(
        resultsListResponseSchema.parse(
          (await w.admin.get(`/api/me/results?bookId=${bookId}`).expect(200)).body,
        ).results,
      ).toEqual([]);
    }
    expect((await w.admin.get(`/api/me/results/${w.quizA}`)).status).toBe(404);
    // La introducción de lo publicado no cuenta el borrador como haberlo jugado.
    const intro = quizIntroResponseSchema.parse(
      (await w.admin.get(`/api/quizzes/${w.quizA}`).expect(200)).body,
    );
    expect(intro).toMatchObject({ completedCount: 0, status: 'available' });
    // Un intento publicado de prueba SÍ cuenta (es una prueba de lo publicado) y convive con los de borrador.
    const { playQuizToEnd } = await import('../test-utils/quizPlay.js');
    await playQuizToEnd(w.admin, w.quizA);
    const list = resultsListResponseSchema.parse(
      (await w.admin.get(`/api/me/results?bookId=${w.published._id}`).expect(200)).body,
    );
    expect(list.results.map((r) => r.attemptsCompleted)).toEqual([1]);
    // El hilo no marca como completado ni «en curso» lo que solo se probó como borrador.
    await w.admin.post(testStart(w.quizB)).expect(200);
    const progress = progressResponseSchema.parse(
      (await w.admin.get(`/api/me/progress?bookId=${w.upcoming._id}`).expect(200)).body,
    );
    expect(progress.experiences).toEqual([]);
  });

  it('las estadísticas y los registros reales no cambian; la reparación ni los ve', async () => {
    const w = await world();
    const stats = async () =>
      adminStatsSchema.parse((await w.admin.get('/api/admin/stats').expect(200)).body);
    const before = await stats();
    await playDraft(w, w.quizA);
    await playDraft(w, w.quizB, w.editor);
    expect(await stats()).toEqual(before);
    expect(await QuizAttempt.countDocuments({ isTest: false })).toBe(0);
    const report = await repairProgress({ apply: true });
    expect(JSON.stringify(report)).not.toContain('draftSnapshot');
    const { UserProgress } = await import('../models/UserProgress.js');
    expect(await UserProgress.countDocuments()).toBe(0);
  });

  it('vence solo: en curso a los 7 días y terminado a los 30 (como el resto de las pruebas)', async () => {
    const w = await world();
    const started = attemptResponseSchema.parse(
      (await w.admin.post(testStart(w.quizA)).expect(200)).body,
    );
    if (started.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    const open = await QuizAttempt.findById(started.attemptId).lean();
    const days = (date?: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days(open?.expireAt)).toBeGreaterThan(6);
    expect(days(open?.expireAt)).toBeLessThan(8);
    await submit(w.admin, started.attemptId, started.stage.stageId, answers(started.stage)).expect(
      200,
    );
    const done = await QuizAttempt.findById(started.attemptId).lean();
    expect(done?.status).toBe('completed');
    expect(days(done?.expireAt)).toBeGreaterThan(29);
    expect(days(done?.expireAt)).toBeLessThan(31);
  });
});

describe('reiniciar y borrar la cuenta eliminan las pruebas de borrador', () => {
  it('«Reiniciar mi progreso de prueba» las borra con el resto de los intentos isTest, solo de esa cuenta', async () => {
    const w = await world();
    await playDraft(w, w.quizA);
    await playDraft(w, w.quizB);
    await playDraft(w, w.quizB, w.editor);
    const res = await w.admin.delete('/api/me/test-progress').expect(200);
    expect(testProgressResetResponseSchema.parse(res.body).quizAttempts).toBe(2);
    expect(await QuizAttempt.countDocuments({ userId: w.adminUser._id })).toBe(0);
    expect(await QuizAttempt.countDocuments({ userId: w.editorUser._id })).toBe(1);
  });

  it('eliminar la cuenta borra sus pruebas (con la copia); no quedan anonimizadas', async () => {
    const w = await world();
    await playDraft(w, w.quizA);
    await w.admin.post(testStart(w.quizB)).expect(200);
    await eraseUserData(w.adminUser._id);
    expect(await QuizAttempt.countDocuments()).toBe(0);
    expect(await QuizAttempt.countDocuments({ userId: '000000000000000000000000' })).toBe(0);
  });
});
