import { randomInt } from 'node:crypto';
import type {
  QuizContent,
  QuizIssue,
  ResultDef,
  ResultPayload,
  StageDef,
  StagePayload,
} from '@libro/shared';

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

/** Etapa tal como se entrega al lector: preguntas en el orden dado y SIN `resultKey`. */
export function toStagePayload(stage: StageDef, questionOrder: readonly string[]): StagePayload {
  const byId = new Map(stage.questions.map((question) => [question.id, question]));
  const questions = questionOrder.flatMap((id) => {
    const question = byId.get(id);
    if (!question) return [];
    return [
      {
        id: question.id,
        text: question.text,
        ...(question.image ? { image: question.image } : {}),
        answers: question.answers.map((answer) => ({ id: answer.id, text: answer.text })),
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
  const error = (code: string, message: string, path?: string) =>
    errors.push({ code, message, ...(path ? { path } : {}) });
  const warn = (code: string, message: string, path?: string) =>
    warnings.push({ code, message, ...(path ? { path } : {}) });

  const stageIds = new Set(content.stages.map((stage) => stage.id));
  for (const id of duplicates(content.stages.map((stage) => stage.id))) {
    error('DUPLICATE_STAGE', `La etapa «${id}» está repetida`, `stages.${id}`);
  }
  for (const key of duplicates(content.results.map((result) => result.key))) {
    error('DUPLICATE_RESULT', `El resultado «${key}» está repetido`, `results.${key}`);
  }
  for (const id of duplicates(content.stages.flatMap((s) => s.questions.map((q) => q.id)))) {
    error('DUPLICATE_QUESTION', `La pregunta «${id}» está repetida en el quiz`, `questions.${id}`);
  }

  const resultsByStage = new Map<string, ResultDef[]>();
  for (const result of content.results) {
    if (!stageIds.has(result.stageId)) {
      error(
        'RESULT_UNKNOWN_STAGE',
        `El resultado «${result.key}» pertenece a una etapa que no existe (${result.stageId})`,
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
        `La etapa «${stage.id}» necesita al menos 2 resultados`,
        `stages.${stage.id}`,
      );
    }
    for (const question of stage.questions) {
      const path = `stages.${stage.id}.questions.${question.id}`;
      for (const id of duplicates(question.answers.map((answer) => answer.id))) {
        error('DUPLICATE_ANSWER', `La respuesta «${id}» está repetida en la pregunta`, path);
      }
      for (const answer of question.answers) {
        if (stageKeys.has(answer.resultKey)) referenced.add(answer.resultKey);
        else {
          error(
            'ANSWER_UNKNOWN_RESULT',
            `La respuesta «${answer.id}» apunta a «${answer.resultKey}», que no es un resultado de la etapa «${stage.id}»`,
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
      roots.length === 0
        ? 'Falta la etapa inicial (una sin condición)'
        : 'Solo puede haber una etapa inicial (sin condición)',
    );
  }
  const byId = new Map(content.stages.map((stage) => [stage.id, stage]));
  const branches = new Set<string>();
  for (const stage of content.stages) {
    const path = `stages.${stage.id}`;
    const hasParent = stage.conditionStageId !== undefined;
    const hasKey = stage.conditionResultKey !== undefined;
    if (hasParent !== hasKey) {
      error('STAGE_CONDITION', 'La condición necesita la etapa y el resultado a la vez', path);
      continue;
    }
    if (!hasParent) continue;
    const parent = byId.get(stage.conditionStageId as string);
    if (!parent || parent.id === stage.id) {
      error(
        'STAGE_CONDITION',
        `La etapa «${stage.id}» depende de una etapa que no existe o de sí misma`,
        path,
      );
      continue;
    }
    if (parent.producesFinal) {
      error(
        'STAGE_AFTER_FINAL',
        `La etapa «${stage.id}» sigue a una etapa que ya da el resultado final`,
        path,
      );
    }
    const parentKeys = new Set((resultsByStage.get(parent.id) ?? []).map((result) => result.key));
    if (!parentKeys.has(stage.conditionResultKey as string)) {
      error(
        'STAGE_CONDITION',
        `«${stage.conditionResultKey}» no es un resultado de la etapa «${parent.id}»`,
        path,
      );
    }
    const branch = `${parent.id}|${stage.conditionResultKey}`;
    if (branches.has(branch)) {
      error(
        'STAGE_AMBIGUOUS',
        `Dos etapas se activan con el mismo resultado de «${parent.id}»`,
        path,
      );
    }
    branches.add(branch);
    // Ciclo: subir por los padres no puede volver a la etapa.
    let cursor: StageDef | undefined = parent;
    for (let hops = 0; cursor && hops <= content.stages.length; hops += 1) {
      if (cursor.id === stage.id) {
        error('STAGE_CYCLE', `Las etapas forman un ciclo en «${stage.id}»`, path);
        break;
      }
      cursor = cursor.conditionStageId ? byId.get(cursor.conditionStageId) : undefined;
    }
  }

  if (!content.stages.some((stage) => stage.producesFinal)) {
    error('NO_FINAL_STAGE', 'Ninguna etapa produce el resultado final');
  }

  // Cada resultado alcanzable de una etapa que no es final necesita una etapa que continúe.
  for (const stage of content.stages) {
    for (const result of resultsByStage.get(stage.id) ?? []) {
      if (!referenced.has(result.key)) {
        warn(
          'RESULT_UNREACHABLE',
          `Ninguna respuesta lleva al resultado «${result.key}»`,
          `results.${result.key}`,
        );
        continue;
      }
      if (!stage.producesFinal && !nextStage(content, stage.id, result.key)) {
        error(
          'BRANCH_WITHOUT_STAGE',
          `Si el resultado de la etapa «${stage.id}» es «${result.key}», el quiz no tiene cómo continuar`,
          `results.${result.key}`,
        );
      }
    }
  }

  return { errors, warnings };
}
