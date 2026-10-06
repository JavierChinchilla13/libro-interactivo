import { describe, expect, it } from 'vitest';
import {
  addAnswer,
  addQuestion,
  addResult,
  addStage,
  allQuestionIds,
  duplicateQuestion,
  emptyDraft,
  moveItem,
  moveQuestion,
  nextId,
  removeQuestion,
  removeResult,
  removeStage,
  resultsOfStage,
  setCondition,
  setQuestionImage,
  updateAnswer,
  type Draft,
} from './draft';

/** Quiz de una etapa con dos resultados (r1, r2) y una pregunta pre-llenada. */
function withOneStage(): Draft {
  let draft = addStage(emptyDraft('Quiz'));
  draft = addResult(draft, 'etapa-1');
  draft = addResult(draft, 'etapa-1');
  return addQuestion(draft, 'etapa-1');
}

describe('nextId', () => {
  it('devuelve el primer id libre', () => {
    expect(nextId('p', [])).toBe('p1');
    expect(nextId('p', ['p1', 'p2', 'p4'])).toBe('p3');
  });
});

describe('etapas', () => {
  it('la primera etapa es la inicial y por defecto da el resultado final', () => {
    const draft = addStage(emptyDraft('Quiz'));
    expect(draft.stages).toHaveLength(1);
    expect(draft.stages[0]).toMatchObject({
      id: 'etapa-1',
      order: 1,
      producesFinal: true,
      shuffleQuestions: true,
    });
    expect(addStage(draft).stages.map((stage) => stage.id)).toEqual(['etapa-1', 'etapa-2']);
  });

  it('una condición apaga «resultado final» de la etapa padre y se puede quitar', () => {
    let draft = addStage(addStage(emptyDraft('Quiz')));
    draft = setCondition(draft, 'etapa-2', { parentId: 'etapa-1', resultKey: 'r1' });
    expect(draft.stages[1]).toMatchObject({
      conditionStageId: 'etapa-1',
      conditionResultKey: 'r1',
    });
    expect(draft.stages[0]?.producesFinal).toBe(false);
    draft = setCondition(draft, 'etapa-2', undefined);
    expect(draft.stages[1]).not.toHaveProperty('conditionStageId');
    expect(draft.stages[1]).not.toHaveProperty('conditionResultKey');
  });

  it('quitar una etapa se lleva sus resultados y las etapas que dependían de ella, y renumera el orden', () => {
    let draft = addStage(addStage(addStage(emptyDraft('Quiz'))));
    draft = addResult(draft, 'etapa-1');
    draft = addResult(draft, 'etapa-2');
    draft = setCondition(draft, 'etapa-2', { parentId: 'etapa-1', resultKey: 'r1' });
    const removed = removeStage(draft, 'etapa-1');
    expect(removed.stages.map((stage) => stage.id)).toEqual(['etapa-3']);
    expect(removed.stages[0]?.order).toBe(1);
    expect(removed.results).toEqual([]);
  });
});

describe('preguntas y respuestas', () => {
  it('una pregunta nueva se pre-llena: la respuesta i apunta al resultado i', () => {
    const draft = withOneStage();
    const question = draft.stages[0]!.questions[0]!;
    expect(question.id).toBe('p1');
    expect(question.answers.map((answer) => answer.resultKey)).toEqual(['r1', 'r2']);
    expect(question.answers.map((answer) => answer.id)).toEqual(['p1a', 'p1b']);
  });

  it('sin resultados creados la pregunta trae dos respuestas vacías', () => {
    const draft = addQuestion(addStage(emptyDraft('Quiz')), 'etapa-1');
    expect(draft.stages[0]!.questions[0]!.answers).toEqual([
      { id: 'p1a', text: '', resultKey: '' },
      { id: 'p1b', text: '', resultKey: '' },
    ]);
  });

  it('los ids de pregunta son únicos en todo el quiz, también entre etapas', () => {
    let draft = addStage(addStage(emptyDraft('Quiz')));
    draft = addQuestion(draft, 'etapa-1');
    draft = addQuestion(draft, 'etapa-2');
    draft = addQuestion(draft, 'etapa-1');
    const ids = allQuestionIds(draft);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['p1', 'p3', 'p2']);
  });

  it('duplicar crea ids nuevos para la pregunta y sus respuestas, justo después de la original', () => {
    let draft = withOneStage();
    draft = addQuestion(draft, 'etapa-1');
    draft = updateAnswer(draft, 'etapa-1', 'p1', 'p1a', { text: 'Texto' });
    const duplicated = duplicateQuestion(draft, 'etapa-1', 'p1');
    const questions = duplicated.stages[0]!.questions;
    expect(questions.map((question) => question.id)).toEqual(['p1', 'p3', 'p2']);
    expect(questions[1]!.answers.map((answer) => answer.id)).toEqual(['p3a', 'p3b']);
    expect(questions[1]!.answers[0]!.text).toBe('Texto');
    expect(new Set(allQuestionIds(duplicated)).size).toBe(3);
  });

  it('mover respeta los límites y eliminar quita solo esa pregunta', () => {
    let draft = withOneStage();
    draft = addQuestion(draft, 'etapa-1');
    const order = (value: Draft) => value.stages[0]!.questions.map((question) => question.id);
    expect(order(moveQuestion(draft, 'etapa-1', 'p2', -1))).toEqual(['p2', 'p1']);
    expect(order(moveQuestion(draft, 'etapa-1', 'p1', -1))).toEqual(['p1', 'p2']);
    expect(order(moveQuestion(draft, 'etapa-1', 'p2', 1))).toEqual(['p1', 'p2']);
    expect(order(removeQuestion(draft, 'etapa-1', 'p1'))).toEqual(['p2']);
  });

  it('agregar una respuesta no repite ids y la imagen se pone y se quita', () => {
    let draft = withOneStage();
    draft = addAnswer(draft, 'etapa-1', 'p1');
    expect(draft.stages[0]!.questions[0]!.answers.map((answer) => answer.id)).toEqual([
      'p1a',
      'p1b',
      'p1c',
    ]);
    const image = {
      provider: 'cloudinary' as const,
      publicId: 'a',
      url: 'u',
      width: 1,
      height: 1,
      alt: 'x',
    };
    draft = setQuestionImage(draft, 'etapa-1', 'p1', image);
    expect(draft.stages[0]!.questions[0]!.image).toEqual(image);
    draft = setQuestionImage(draft, 'etapa-1', 'p1', undefined);
    expect(draft.stages[0]!.questions[0]).not.toHaveProperty('image');
  });

  it('es inmutable: el borrador original no cambia', () => {
    const draft = withOneStage();
    const before = JSON.stringify(draft);
    addQuestion(draft, 'etapa-1');
    removeStage(draft, 'etapa-1');
    updateAnswer(draft, 'etapa-1', 'p1', 'p1a', { text: 'x' });
    expect(JSON.stringify(draft)).toBe(before);
  });
});

describe('resultados', () => {
  it('agregar crea claves únicas por etapa y resultsOfStage filtra', () => {
    let draft = addStage(addStage(emptyDraft('Quiz')));
    draft = addResult(draft, 'etapa-1');
    draft = addResult(draft, 'etapa-2');
    draft = addResult(draft, 'etapa-1');
    expect(draft.results.map((result) => result.key)).toEqual(['r1', 'r2', 'r3']);
    expect(resultsOfStage(draft, 'etapa-1').map((result) => result.key)).toEqual(['r1', 'r3']);
  });

  it('quitar un resultado deja «sin resultado» a las respuestas que apuntaban a él', () => {
    const draft = removeResult(withOneStage(), 'r1');
    expect(draft.results.map((result) => result.key)).toEqual(['r2']);
    expect(draft.stages[0]!.questions[0]!.answers.map((answer) => answer.resultKey)).toEqual([
      '',
      'r2',
    ]);
  });
});

describe('moveItem', () => {
  it('mueve un elemento sin salirse de la lista', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
