import { apiErrorSchema, quizDetailResponseSchema } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

type Question = { id: string; answers: { id: string }[] } & Record<string, unknown>;
type Draft = { stages: { questions: Question[] }[] } & Record<string, unknown>;

async function world() {
  const w = await staffWorld();
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz de prueba' }),
    publishedBy: w.adminUser._id,
  });
  const base = `/api/admin/quizzes/${quiz.id}`;
  const detail = async () =>
    quizDetailResponseSchema.parse((await w.editor.get(base).expect(200)).body);
  return { ...w, quiz, base, detail };
}

/** Copia del borrador con la primera pregunta de la primera etapa reemplazada por otra con el id indicado. */
function replaceFirstQuestion(draft: Draft, newId: string): Draft {
  const [first] = draft.stages[0]?.questions ?? [];
  if (!first) throw new Error('El quiz de prueba no tiene preguntas');
  const renamed: Question = {
    ...first,
    id: newId,
    answers: first.answers.map((answer, index) => ({ ...answer, id: `${newId}-${index}` })),
  };
  return {
    ...draft,
    stages: draft.stages.map((stage, index) =>
      index === 0 ? { ...stage, questions: [renamed, ...stage.questions.slice(1)] } : stage,
    ),
  };
}

describe('ids de pregunta reservados en el detalle del quiz', () => {
  it('incluye los del borrador, los de las versiones publicadas y los de la apariencia (aunque su pregunta ya no exista)', async () => {
    const { editor, base, detail } = await world();
    const before = await detail();
    const draftIds = before.draft.stages.flatMap((stage) => stage.questions.map((q) => q.id));
    expect(draftIds.length).toBeGreaterThan(0);
    expect(before.reservedQuestionIds).toEqual(expect.arrayContaining(draftIds));

    // Un ajuste por pregunta de una pregunta que no está en el borrador (huérfano).
    await editor
      .put(`${base}/appearance`)
      .send({
        appearance: { questions: { 'pregunta-borrada': { accent: '#ff8fb1' } } },
        expectedRev: 0,
      })
      .expect(200);
    expect((await detail()).reservedQuestionIds).toContain('pregunta-borrada');

    // Una pregunta que SOLO existe en la versión publicada (se quitó del borrador después).
    const gone = draftIds[0] as string;
    const trimmed = {
      ...before.draft,
      stages: before.draft.stages.map((stage, index) =>
        index === 0 ? { ...stage, questions: stage.questions.slice(1) } : stage,
      ),
    };
    await editor.put(`${base}/draft`).send(trimmed).expect(200);
    const after = await detail();
    expect(after.draft.stages.flatMap((s) => s.questions.map((q) => q.id))).not.toContain(gone);
    expect(after.reservedQuestionIds).toContain(gone);
  });
});

describe('el servidor no deja estrenar un id ya usado (refuerzo)', () => {
  it('una pregunta nueva con el id de una versión publicada → 400 y no cambia el borrador', async () => {
    const { editor, base, detail } = await world();
    const before = await detail();
    const removedId = before.draft.stages[0]?.questions[0]?.id as string;
    // Se quita del borrador (la versión publicada la sigue usando)…
    const trimmed = {
      ...before.draft,
      stages: before.draft.stages.map((stage, index) =>
        index === 0 ? { ...stage, questions: stage.questions.slice(1) } : stage,
      ),
    };
    await editor.put(`${base}/draft`).send(trimmed).expect(200);
    const trimmedDetail = await detail();

    // …y un editor desactualizado intenta agregar una pregunta nueva con ese mismo id.
    const reused = replaceFirstQuestion(trimmedDetail.draft as unknown as Draft, removedId);
    const withReused = {
      ...trimmedDetail.draft,
      stages: trimmedDetail.draft.stages.map((stage, index) =>
        index === 0
          ? { ...stage, questions: [...stage.questions, reused.stages[0]?.questions[0]] }
          : stage,
      ),
    };
    const res = await editor.put(`${base}/draft`).send(withReused);
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
    expect(res.body.error.message).toContain(removedId);
    expect(await detail()).toMatchObject({ draft: trimmedDetail.draft });
  });

  it('una pregunta nueva con el id de un ajuste huérfano de la apariencia → 400', async () => {
    const { editor, base, detail } = await world();
    await editor
      .put(`${base}/appearance`)
      .send({ appearance: { questions: { p99: { accent: '#ff8fb1' } } }, expectedRev: 0 })
      .expect(200);
    const current = await detail();
    const draft = replaceFirstQuestion(current.draft as unknown as Draft, 'p99');
    const res = await editor.put(`${base}/draft`).send(draft);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('p99');
  });

  it('seguir guardando las preguntas que ya estaban (aunque su id esté en una versión) sigue funcionando', async () => {
    const { editor, base, detail } = await world();
    const current = await detail();
    await editor.put(`${base}/draft`).send(current.draft).expect(200);
    await editor.put(`${base}/draft`).send(current.draft).expect(200);
  });

  it('una pregunta con un id nunca usado se guarda', async () => {
    const { editor, base, detail } = await world();
    const current = await detail();
    const draft = replaceFirstQuestion(current.draft as unknown as Draft, 'p-nueva-de-verdad');
    const res = await editor.put(`${base}/draft`).send(draft);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('el permiso no cambia: una lectora sigue sin poder guardar el borrador', async () => {
    const { reader, base, detail } = await world();
    const current = await detail();
    expect((await reader.put(`${base}/draft`).send(current.draft)).status).toBe(403);
  });
});
