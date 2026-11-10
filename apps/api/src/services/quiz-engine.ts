import { randomInt } from 'node:crypto';
import type {
  ReaderQuestionAppearance,
  QuizContent,
  QuizIssue,
  QuizIssueWhere,
  ResultDef,
  ResultPayload,
  StageDef,
  StagePayload,
} from '@libro/shared';
import { createQuizLocator, issue } from './quizIssues.js';

/**
 * Motor de quizzes: lógica pura (sin BD ni Express) para barajar, contar, resolver empates,
 * encadenar etapas condicionales, calcular porcentajes y validar la integridad de un quiz.
 * El azar es inyectable para poder probarlo con semilla.
 */

/** Entero aleatorio en `[0, maxExclusive)`. */
export type RandomInt = (maxExclusive: number) => number;

export const cryptoRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

export interface TallyEntry {
  resultKey: string;
  count: number;
}

export interface SubmittedAnswer {
  questionId: string;
  answerId: string;
}

export interface ResolvedAnswer extends SubmittedAnswer {
  resultKey: string;
}

/** Fisher-Yates: devuelve una copia barajada. */
export function shuffle<T>(items: readonly T[], random: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** Orden en que se entregan las preguntas de una etapa (ids). */
export function questionOrderFor(stage: StageDef, random: RandomInt): string[] {
  const ids = stage.questions.map((question) => question.id);
  return stage.shuffleQuestions ? shuffle(ids, random) : ids;
}

/** Ajustes de apariencia por id de pregunta (decoración: fondo, velo y acento). */
export type QuestionAppearances = Readonly<Record<string, ReaderQuestionAppearance>>;

/** Orden en que se entregan las respuestas de cada pregunta: ids por pregunta. */
export type AnswerOrder = readonly { questionId: string; answerIds: readonly string[] }[];

/**
 * Orden barajado de las respuestas de cada pregunta de la etapa, o `undefined` si la etapa no baraja respuestas. Las
 * marcadas «Dejar al final» (`pinLast`) no se mueven: quedan al final, en el orden de la autora.
 */
export function answerOrderFor(stage: StageDef, random: RandomInt): AnswerOrder | undefined {
  if (!stage.shuffleAnswers) return undefined;
  return stage.questions.map((question) => ({
    questionId: question.id,
    answerIds: [
      ...shuffle(
        question.answers.filter((answer) => !answer.pinLast).map((answer) => answer.id),
        random,
      ),
      ...question.answers.filter((answer) => answer.pinLast).map((answer) => answer.id),
    ],
  }));
}

/** La etapa inicial: la única sin condición (la validación garantiza que hay una sola). */
export function firstStage(content: QuizContent): StageDef | undefined {
  return [...content.stages]
    .filter((stage) => stage.conditionStageId === undefined)
    .sort((a, b) => a.order - b.order)[0];
}

/** La etapa que sigue a `stageId` cuando su resultado fue `resultKey` (si la hay). */
export function nextStage(
  content: QuizContent,
  stageId: string,
  resultKey: string,
): StageDef | undefined {
  return content.stages.find(
    (stage) => stage.conditionStageId === stageId && stage.conditionResultKey === resultKey,
  );
}

export type AnswersCheck = { ok: true; answers: ResolvedAnswer[] } | { ok: false; message: string };

/**
 * Comprueba que se respondió exactamente cada pregunta de la etapa, una vez, con una respuesta
 * que pertenece a esa pregunta. Devuelve las respuestas con su `resultKey` (solo para uso interno).
 */
export function resolveStageAnswers(stage: StageDef, submitted: SubmittedAnswer[]): AnswersCheck {
  const byQuestion = new Map(stage.questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const answers: ResolvedAnswer[] = [];
  for (const item of submitted) {
    const question = byQuestion.get(item.questionId);
    if (!question) return { ok: false, message: 'Hay una pregunta que no pertenece a esta etapa' };
    if (seen.has(item.questionId)) {
      return { ok: false, message: 'Hay una pregunta respondida más de una vez' };
    }
    const answer = question.answers.find((candidate) => candidate.id === item.answerId);
    if (!answer) return { ok: false, message: 'Hay una respuesta que no pertenece a su pregunta' };
    seen.add(item.questionId);
    answers.push({ ...item, resultKey: answer.resultKey });
  }
  if (seen.size !== stage.questions.length) {
    return { ok: false, message: 'Responde todas las preguntas de la etapa' };
  }
  return { ok: true, answers };
}

/** Cuenta cuántas respuestas suman a cada resultado (solo los que tienen al menos una). */
export function tallyAnswers(answers: readonly ResolvedAnswer[]): TallyEntry[] {
  const counts = new Map<string, number>();
  for (const answer of answers)
    counts.set(answer.resultKey, (counts.get(answer.resultKey) ?? 0) + 1);
  return [...counts].map(([resultKey, count]) => ({ resultKey, count }));
}

/** Gana el resultado más frecuente; un empate se resuelve al azar entre los empatados (y se registra). */
export function pickWinner(
  tally: readonly TallyEntry[],
  random: RandomInt,
): { resultKey: string; tiedKeys?: string[] } {
  const max = Math.max(...tally.map((entry) => entry.count));
  const top = tally.filter((entry) => entry.count === max).map((entry) => entry.resultKey);
  const winner = top[top.length === 1 ? 0 : random(top.length)];
  if (winner === undefined) throw new Error('No se puede elegir un resultado sin respuestas');
  return top.length > 1 ? { resultKey: winner, tiedKeys: top } : { resultKey: winner };
}

/**
 * Porcentaje entero de cada resultado alcanzado, que suma exactamente 100 (método del mayor resto;
 * el desempate de restos es por clave para que sea determinista).
 */
export function computeDistribution(
  tally: readonly TallyEntry[],
): { resultKey: string; percent: number }[] {
  const total = tally.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return [];
  const rows = tally.map((entry) => {
    const exact = (entry.count * 100) / total;
    return { resultKey: entry.resultKey, percent: Math.floor(exact), remainder: exact % 1 };
  });
  let missing = 100 - rows.reduce((sum, row) => sum + row.percent, 0);
  const byRemainder = [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.resultKey.localeCompare(b.resultKey),
  );
  for (const row of byRemainder) {
    if (missing <= 0) break;
    row.percent += 1;
    missing -= 1;
  }
  return rows.map(({ resultKey, percent }) => ({ resultKey, percent }));
}

/** Respuestas en el orden guardado en el intento; sin orden (intentos anteriores) o con ids que sobran o faltan, el de la autora. */
function orderedAnswers<T extends { id: string }>(
  answers: readonly T[],
  order: readonly string[] | undefined,
): T[] {
  if (!order) return [...answers];
  const byId = new Map(answers.map((answer) => [answer.id, answer]));
  const listed = order.flatMap((id) => {
    const answer = byId.get(id);
    return answer ? [answer] : [];
  });
  const seen = new Set(listed.map((answer) => answer.id));
  return [...listed, ...answers.filter((answer) => !seen.has(answer.id))];
}

/** Etapa tal como se entrega al lector: preguntas en el orden dado y SIN `resultKey`. */
export function toStagePayload(
  stage: StageDef,
  questionOrder: readonly string[],
  answerOrder?: AnswerOrder | null,
  questionAppearance?: QuestionAppearances,
): StagePayload {
  const answersByQuestion = new Map(
    (answerOrder ?? []).map((item) => [item.questionId, item.answerIds]),
  );
  const byId = new Map(stage.questions.map((question) => [question.id, question]));
  const questions = questionOrder.flatMap((id) => {
    const question = byId.get(id);
    if (!question) return [];
    return [
      {
        id: question.id,
        text: question.text,
        ...(question.image ? { image: question.image } : {}),
        // Solo las preguntas de ESTA etapa: los ajustes de ids que ya no existen en la versión se ignoran sin error.
        ...(questionAppearance && Object.hasOwn(questionAppearance, question.id)
          ? { appearance: questionAppearance[question.id] }
          : {}),
        answers: orderedAnswers(question.answers, answersByQuestion.get(question.id)).map(
          (answer) => ({ id: answer.id, text: answer.text }),
        ),
      },
    ];
  });
  return {
    stageId: stage.id,
    ...(stage.title ? { title: stage.title } : {}),
    questions,
  };
}

export function findResult(content: QuizContent, key: string): ResultDef | undefined {
  return content.results.find((result) => result.key === key);
}

/**
 * Resultado tal como se entrega al lector, SOLO tras completar el quiz. `distribution` solo sale
 * si el quiz tiene `showBreakdown`.
 */
export function toResultPayload(
  content: QuizContent,
  resultKey: string,
  distribution?: readonly { resultKey: string; percent: number }[],
): ResultPayload {
  const result = findResult(content, resultKey);
  if (!result) throw new Error(`El resultado ${resultKey} no existe en esta versión del quiz`);
  const intro = content.settings.revealIntro;
  const shown =
    content.settings.showBreakdown && distribution
      ? distribution.flatMap((row) => {
          const own = findResult(content, row.resultKey);
          return own ? [{ key: own.key, title: own.title, percent: row.percent }] : [];
        })
      : undefined;
  return {
    key: result.key,
    title: result.title,
    ...(result.description ? { description: result.description } : {}),
    ...(result.media ? { media: result.media } : {}),
    ...(intro && intro.lines.length > 0 ? { revealIntro: intro } : {}),
    ...(result.reveal && result.reveal.lines.length > 0 ? { reveal: result.reveal } : {}),
    ...(result.facts && result.facts.length > 0 ? { facts: result.facts } : {}),
    ...(shown ? { distribution: shown } : {}),
  };
}

// ---------------------------------------------------------------------------
// Validación de integridad (al validar y, estricta, al publicar)
// ---------------------------------------------------------------------------

export interface QuizValidation {
  errors: QuizIssue[];
  warnings: QuizIssue[];
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

/**
 * Comprueba lo que el esquema Zod no puede: que los ids no se repitan, que cada respuesta apunte a un
 * resultado de su etapa, que las etapas condicionales formen un árbol y que todo camino termine en
 * una etapa que produce el resultado final. Los errores impiden publicar; los avisos no.
 */
export function validateQuizContent(content: QuizContent): QuizValidation {
  const errors: QuizIssue[] = [];
  const warnings: QuizIssue[] = [];
  // Cada mensaje dice dónde está, en palabras de la autora (número y trozo del texto), y trae `where` para el editor.
  const at = createQuizLocator(content);
  const error = (code: string, where: QuizIssueWhere, message: string, path?: string) =>
    errors.push(issue(code, where, message, path));
  const warn = (code: string, where: QuizIssueWhere, message: string, path?: string) =>
    warnings.push(issue(code, where, message, path));
  const everyStage: QuizIssueWhere = { tab: 'etapas', label: 'Preguntas' };
  const stageOfQuestion = (questionId: string) =>
    content.stages.find((stage) => stage.questions.some((q) => q.id === questionId))?.id ?? '';

  const stageIds = new Set(content.stages.map((stage) => stage.id));
  for (const id of duplicates(content.stages.map((stage) => stage.id))) {
    error(
      'DUPLICATE_STAGE',
      at.stage(id),
      'hay dos etapas con el mismo identificador interno: quita o vuelve a crear una',
      `stages.${id}`,
    );
  }
  for (const key of duplicates(content.results.map((result) => result.key))) {
    error(
      'DUPLICATE_RESULT',
      at.result(key),
      'hay dos resultados con el mismo identificador interno: quita o vuelve a crear uno',
      `results.${key}`,
    );
  }
  for (const id of duplicates(content.stages.flatMap((s) => s.questions.map((q) => q.id)))) {
    error(
      'DUPLICATE_QUESTION',
      at.question(stageOfQuestion(id), id),
      'esta pregunta está repetida en el quiz (mismo identificador interno): quita una de las copias',
      `questions.${id}`,
    );
  }

  const resultsByStage = new Map<string, ResultDef[]>();
  for (const result of content.results) {
    if (!stageIds.has(result.stageId)) {
      error(
        'RESULT_UNKNOWN_STAGE',
        at.result(result.key),
        'pertenece a una etapa que ya no existe: elimínalo o vuelve a crearlo en otra etapa',
        `results.${result.key}`,
      );
      continue;
    }
    resultsByStage.set(result.stageId, [...(resultsByStage.get(result.stageId) ?? []), result]);
  }

  const referenced = new Set<string>();
  for (const stage of content.stages) {
    const stageResults = resultsByStage.get(stage.id) ?? [];
    const stageKeys = new Set(stageResults.map((result) => result.key));
    if (stageResults.length < 2) {
      error(
        'STAGE_FEW_RESULTS',
        at.stageResults(stage.id),
        stageResults.length === 0
          ? 'esta etapa todavía no tiene resultados: crea al menos 2'
          : 'esta etapa necesita al menos 2 resultados (tiene 1)',
        `stages.${stage.id}`,
      );
    }
    for (const question of stage.questions) {
      const path = `stages.${stage.id}.questions.${question.id}`;
      for (const _id of duplicates(question.answers.map((answer) => answer.id))) {
        error(
          'DUPLICATE_ANSWER',
          at.question(stage.id, question.id),
          'dos respuestas tienen el mismo identificador interno: quita una y vuelve a escribirla',
          path,
        );
      }
      for (const answer of question.answers) {
        if (stageKeys.has(answer.resultKey)) referenced.add(answer.resultKey);
        else {
          error(
            'ANSWER_UNKNOWN_RESULT',
            { ...at.answer(stage.id, question.id, answer.id), field: 'resultKey' },
            'el resultado al que sumaba ya no existe en esta etapa: elige otro',
            path,
          );
        }
      }
    }
  }

  // Árbol de etapas condicionales.
  const roots = content.stages.filter((stage) => stage.conditionStageId === undefined);
  if (roots.length !== 1) {
    error(
      'STAGE_ROOT',
      everyStage,
      roots.length === 0
        ? 'falta la etapa inicial (una que no venga después de otra)'
        : 'solo puede haber una etapa inicial: las demás deben venir después de otra etapa',
    );
  }
  const byId = new Map(content.stages.map((stage) => [stage.id, stage]));
  const branches = new Set<string>();
  for (const stage of content.stages) {
    const path = `stages.${stage.id}`;
    const hasParent = stage.conditionStageId !== undefined;
    const hasKey = stage.conditionResultKey !== undefined;
    if (hasParent !== hasKey) {
      error(
        'STAGE_CONDITION',
        at.stage(stage.id),
        'elige después de qué etapa va y con qué resultado se activa (faltan los dos datos juntos)',
        path,
      );
      continue;
    }
    if (!hasParent) continue;
    const parent = byId.get(stage.conditionStageId as string);
    if (!parent || parent.id === stage.id) {
      error(
        'STAGE_CONDITION',
        at.stage(stage.id),
        'viene después de una etapa que ya no existe (o de sí misma): elige otra',
        path,
      );
      continue;
    }
    if (parent.producesFinal) {
      error(
        'STAGE_AFTER_FINAL',
        at.stage(stage.id),
        'viene después de una etapa que ya da el resultado final: quita la marca de final en la anterior o cambia la condición',
        path,
      );
    }
    const parentKeys = new Set((resultsByStage.get(parent.id) ?? []).map((result) => result.key));
    if (!parentKeys.has(stage.conditionResultKey as string)) {
      error(
        'STAGE_CONDITION',
        at.stage(stage.id),
        'el resultado con el que se activa ya no existe en la etapa anterior: elige otro',
        path,
      );
    }
    const branch = `${parent.id}|${stage.conditionResultKey}`;
    if (branches.has(branch)) {
      error(
        'STAGE_AMBIGUOUS',
        at.stage(stage.id),
        'otra etapa ya se activa con el mismo resultado de la etapa anterior: elige un resultado distinto',
        path,
      );
    }
    branches.add(branch);
    // Ciclo: subir por los padres no puede volver a la etapa.
    let cursor: StageDef | undefined = parent;
    for (let hops = 0; cursor && hops <= content.stages.length; hops += 1) {
      if (cursor.id === stage.id) {
        error(
          'STAGE_CYCLE',
          at.stage(stage.id),
          'las etapas forman un círculo (una termina viniendo después de sí misma): revisa «¿Después de qué etapa?»',
          path,
        );
        break;
      }
      cursor = cursor.conditionStageId ? byId.get(cursor.conditionStageId) : undefined;
    }
  }

  if (!content.stages.some((stage) => stage.producesFinal)) {
    error(
      'NO_FINAL_STAGE',
      everyStage,
      'ninguna etapa da el resultado final: marca «Esta etapa da el resultado final» en la última',
    );
  }

  // Cada resultado alcanzable de una etapa que no es final necesita una etapa que continúe.
  for (const stage of content.stages) {
    for (const result of resultsByStage.get(stage.id) ?? []) {
      if (!referenced.has(result.key)) {
        warn(
          'RESULT_UNREACHABLE',
          at.result(result.key),
          'ninguna respuesta suma a este resultado, así que nadie lo va a obtener',
          `results.${result.key}`,
        );
        continue;
      }
      if (!stage.producesFinal && !nextStage(content, stage.id, result.key)) {
        error(
          'BRANCH_WITHOUT_STAGE',
          at.result(result.key),
          'si la lectora obtiene este resultado, el quiz no sabe cómo seguir: crea una etapa que venga después con este resultado o marca su etapa como final',
          `results.${result.key}`,
        );
      }
    }
  }

  return { errors, warnings };
}
