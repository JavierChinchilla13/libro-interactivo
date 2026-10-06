import type { QuizDraftPayload } from '@libro/shared';

/**
 * Operaciones puras (inmutables) sobre el borrador de un quiz. El editor guarda un borrador que puede estar
 * incompleto; solo validar y publicar exigen el contenido completo (lo decide el servidor).
 */
export type Draft = QuizDraftPayload;
export type DraftStage = Draft['stages'][number];
export type DraftQuestion = DraftStage['questions'][number];
export type DraftResult = Draft['results'][number];

const letter = (index: number) => String.fromCharCode(97 + (index % 26));

/** Primer id libre `<prefijo><n>` que no esté en uso. */
export function nextId(prefix: string, used: Iterable<string>): string {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export const allQuestionIds = (draft: Draft): string[] =>
  draft.stages.flatMap((stage) => stage.questions.map((question) => question.id));

export const resultsOfStage = (draft: Draft, stageId: string): DraftResult[] =>
  draft.results.filter((result) => result.stageId === stageId);

function mapStage(draft: Draft, stageId: string, change: (stage: DraftStage) => DraftStage): Draft {
  return {
    ...draft,
    stages: draft.stages.map((stage) => (stage.id === stageId ? change(stage) : stage)),
  };
}

function mapQuestion(
  draft: Draft,
  stageId: string,
  questionId: string,
  change: (question: DraftQuestion) => DraftQuestion,
): Draft {
  return mapStage(draft, stageId, (stage) => ({
    ...stage,
    questions: stage.questions.map((question) =>
      question.id === questionId ? change(question) : question,
    ),
  }));
}

// --- Etapas ---------------------------------------------------------------------------------

/** Agrega una etapa. La primera es la inicial; las siguientes son condicionales (se completan en el editor). */
export function addStage(draft: Draft): Draft {
  const id = nextId(
    'etapa-',
    draft.stages.map((stage) => stage.id),
  );
  const stage: DraftStage = {
    id,
    order: draft.stages.length + 1,
    shuffleQuestions: true,
    // Por defecto la etapa da el resultado final; al volverse padre de otra se apaga sola (`setCondition`).
    producesFinal: true,
    questions: [],
  };
  return { ...draft, stages: [...draft.stages, stage] };
}

/** Quita una etapa con sus resultados y las etapas que dependían de ella. */
export function removeStage(draft: Draft, stageId: string): Draft {
  const doomed = new Set<string>([stageId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const stage of draft.stages) {
      if (!doomed.has(stage.id) && stage.conditionStageId && doomed.has(stage.conditionStageId)) {
        doomed.add(stage.id);
        grew = true;
      }
    }
  }
  return {
    ...draft,
    stages: draft.stages
      .filter((stage) => !doomed.has(stage.id))
      .map((stage, index) => ({ ...stage, order: index + 1 })),
    results: draft.results.filter((result) => !doomed.has(result.stageId)),
  };
}

export function updateStage(draft: Draft, stageId: string, patch: Partial<DraftStage>): Draft {
  return mapStage(draft, stageId, (stage) => ({ ...stage, ...patch }));
}

/**
 * Quita (si `condition` es undefined) o fija la condición de una etapa: «solo si el resultado de la etapa
 * padre fue X». La etapa padre deja de producir el resultado final (ahora continúa en esta).
 */
export function setCondition(
  draft: Draft,
  stageId: string,
  condition: { parentId: string; resultKey: string } | undefined,
): Draft {
  const next = mapStage(draft, stageId, (stage) => {
    const { conditionStageId: _a, conditionResultKey: _b, ...rest } = stage;
    return condition
      ? { ...rest, conditionStageId: condition.parentId, conditionResultKey: condition.resultKey }
      : rest;
  });
  return condition && condition.parentId
    ? mapStage(next, condition.parentId, (parent) => ({ ...parent, producesFinal: false }))
    : next;
}

// --- Preguntas y respuestas -----------------------------------------------------------------

export function addQuestion(draft: Draft, stageId: string): Draft {
  const id = nextId('p', allQuestionIds(draft));
  const keys = resultsOfStage(draft, stageId).map((result) => result.key);
  // Pre-llenado: una respuesta por resultado, la respuesta i apunta al resultado i (como las redacta la autora).
  const answers = (keys.length >= 2 ? keys : ['', '']).map((resultKey, index) => ({
    id: `${id}${letter(index)}`,
    text: '',
    resultKey,
  }));
  return mapStage(draft, stageId, (stage) => ({
    ...stage,
    questions: [...stage.questions, { id, text: '', answers }],
  }));
}

export function updateQuestion(
  draft: Draft,
  stageId: string,
  questionId: string,
  patch: Partial<DraftQuestion>,
): Draft {
  return mapQuestion(draft, stageId, questionId, (question) => ({ ...question, ...patch }));
}

/** Pone o quita la imagen de una pregunta. */
export function setQuestionImage(
  draft: Draft,
  stageId: string,
  questionId: string,
  image: DraftQuestion['image'],
): Draft {
  return mapQuestion(draft, stageId, questionId, (question) => {
    const { image: _removed, ...rest } = question;
    return image ? { ...rest, image } : rest;
  });
}

export function removeQuestion(draft: Draft, stageId: string, questionId: string): Draft {
  return mapStage(draft, stageId, (stage) => ({
    ...stage,
    questions: stage.questions.filter((question) => question.id !== questionId),
  }));
}

export function duplicateQuestion(draft: Draft, stageId: string, questionId: string): Draft {
  const source = draft.stages
    .find((stage) => stage.id === stageId)
    ?.questions.find((q) => q.id === questionId);
  if (!source) return draft;
  const id = nextId('p', allQuestionIds(draft));
  const copy: DraftQuestion = {
    ...source,
    id,
    answers: source.answers.map((answer, index) => ({ ...answer, id: `${id}${letter(index)}` })),
  };
  return mapStage(draft, stageId, (stage) => {
    const at = stage.questions.findIndex((question) => question.id === questionId);
    const questions = [...stage.questions];
    questions.splice(at + 1, 0, copy);
    return { ...stage, questions };
  });
}

/** Mueve una pregunta `direction` posiciones (−1 arriba, +1 abajo). */
export function moveQuestion(
  draft: Draft,
  stageId: string,
  questionId: string,
  direction: -1 | 1,
): Draft {
  return mapStage(draft, stageId, (stage) => {
    const at = stage.questions.findIndex((question) => question.id === questionId);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= stage.questions.length) return stage;
    const questions = [...stage.questions];
    const [moved] = questions.splice(at, 1);
    if (moved) questions.splice(to, 0, moved);
    return { ...stage, questions };
  });
}

export function addAnswer(draft: Draft, stageId: string, questionId: string): Draft {
  return mapQuestion(draft, stageId, questionId, (question) => {
    const used = new Set(question.answers.map((answer) => answer.id));
    let index = question.answers.length;
    while (used.has(`${question.id}${letter(index)}`)) index += 1;
    return {
      ...question,
      answers: [
        ...question.answers,
        { id: `${question.id}${letter(index)}`, text: '', resultKey: '' },
      ],
    };
  });
}

export function updateAnswer(
  draft: Draft,
  stageId: string,
  questionId: string,
  answerId: string,
  patch: Partial<DraftQuestion['answers'][number]>,
): Draft {
  return mapQuestion(draft, stageId, questionId, (question) => ({
    ...question,
    answers: question.answers.map((answer) =>
      answer.id === answerId ? { ...answer, ...patch } : answer,
    ),
  }));
}

export function removeAnswer(
  draft: Draft,
  stageId: string,
  questionId: string,
  answerId: string,
): Draft {
  return mapQuestion(draft, stageId, questionId, (question) => ({
    ...question,
    answers: question.answers.filter((answer) => answer.id !== answerId),
  }));
}

// --- Resultados -----------------------------------------------------------------------------

export function addResult(draft: Draft, stageId: string): Draft {
  const key = nextId(
    'r',
    draft.results.map((result) => result.key),
  );
  return { ...draft, results: [...draft.results, { key, stageId, title: '' }] };
}

export function updateResult(draft: Draft, key: string, patch: Partial<DraftResult>): Draft {
  return {
    ...draft,
    results: draft.results.map((result) => (result.key === key ? { ...result, ...patch } : result)),
  };
}

/** Quita un resultado y deja «sin resultado» las respuestas que apuntaban a él (el validador las marca). */
export function removeResult(draft: Draft, key: string): Draft {
  return {
    ...draft,
    results: draft.results.filter((result) => result.key !== key),
    stages: draft.stages.map((stage) => ({
      ...stage,
      questions: stage.questions.map((question) => ({
        ...question,
        answers: question.answers.map((answer) =>
          answer.resultKey === key ? { ...answer, resultKey: '' } : answer,
        ),
      })),
    })),
  };
}

// --- Listas de texto (secuencia de revelado) -------------------------------------------------

export function moveItem<T>(items: readonly T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return [...items];
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  if (moved !== undefined) copy.splice(to, 0, moved);
  return copy;
}

/** Borrador vacío de un quiz recién creado. */
export function emptyDraft(title: string): Draft {
  return {
    title,
    instructionsHtml: '',
    settings: { allowRetake: true, showBreakdown: false },
    stages: [],
    results: [],
  };
}
