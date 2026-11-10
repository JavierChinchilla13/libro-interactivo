import type { QuizIssue, QuizIssueWhere } from '@libro/shared';

/**
 * Mensajes de la revisión de un quiz en el idioma de la autora: cada problema dice DÓNDE está (etapa, pregunta,
 * respuesta o resultado, con su número y un trozo del texto) y trae `where` para que el editor lleve hasta ahí. Sirve
 * para los errores del esquema (Zod, que nunca salen crudos ni en inglés) y para los de la validación propia.
 * Trabaja sobre el borrador tal como está (puede venir incompleto), así que lee todo con cuidado.
 */

interface LooseAnswer {
  id: string;
  text: string;
}
interface LooseQuestion {
  id: string;
  text: string;
  answers: LooseAnswer[];
}
interface LooseStage {
  id: string;
  title: string;
  questions: LooseQuestion[];
}
interface LooseResult {
  key: string;
  stageId: string;
  title: string;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Un trozo corto del texto, en una línea y sin etiquetas: «¿Qué harías si el…». */
export function snippet(value: string, max = 36): string {
  const plain = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

const quoted = (value: string, max?: number) =>
  snippet(value, max) ? ` «${snippet(value, max)}»` : '';

function looseContent(raw: unknown) {
  const content = record(raw);
  const stages: LooseStage[] = list(content['stages']).map((item) => {
    const stage = record(item);
    return {
      id: text(stage['id']),
      title: text(stage['title']),
      questions: list(stage['questions']).map((rawQuestion) => {
        const question = record(rawQuestion);
        return {
          id: text(question['id']),
          text: text(question['text']),
          answers: list(question['answers']).map((rawAnswer) => {
            const answer = record(rawAnswer);
            return { id: text(answer['id']), text: text(answer['text']) };
          }),
        };
      }),
    };
  });
  const results: LooseResult[] = list(content['results']).map((item) => {
    const result = record(item);
    return {
      key: text(result['key']),
      stageId: text(result['stageId']),
      title: text(result['title']),
    };
  });
  return { stages, results };
}

export type QuizLocator = ReturnType<typeof createQuizLocator>;

/** Arma la ubicación en palabras de cada elemento del quiz, por posición (errores de Zod) o por id (validación propia). */
export function createQuizLocator(raw: unknown) {
  const { stages, results } = looseContent(raw);

  const stageAt = (si: number): QuizIssueWhere => {
    const stage = stages[si];
    return {
      tab: 'etapas',
      label: `Etapa ${si + 1}${quoted(stage?.title ?? '', 30)}`,
      ...(stage?.id ? { stageId: stage.id } : {}),
    };
  };
  const questionAt = (si: number, qi: number): QuizIssueWhere => {
    const base = stageAt(si);
    const question = stages[si]?.questions[qi];
    return {
      ...base,
      label: `${base.label} · Pregunta ${qi + 1}${quoted(question?.text ?? '')}`,
      ...(question?.id ? { questionId: question.id } : {}),
    };
  };
  const answerAt = (si: number, qi: number, ai: number): QuizIssueWhere => {
    const base = questionAt(si, qi);
    const answer = stages[si]?.questions[qi]?.answers[ai];
    return {
      ...base,
      label: `${base.label} · Respuesta ${ai + 1}${quoted(answer?.text ?? '', 28)}`,
      ...(answer?.id ? { answerId: answer.id } : {}),
    };
  };
  const resultAt = (ri: number): QuizIssueWhere => {
    const result = results[ri];
    const si = stages.findIndex((stage) => stage.id === result?.stageId);
    const sameStage = results.filter((other) => other.stageId === result?.stageId);
    const position = result ? sameStage.indexOf(result) + 1 : ri + 1;
    const stagePart = si >= 0 ? `Etapa ${si + 1} · ` : '';
    return {
      tab: 'resultados',
      label: `${stagePart}Resultado ${position}${quoted(result?.title ?? '', 30)}`,
      ...(result?.stageId ? { stageId: result.stageId } : {}),
      ...(result?.key ? { resultKey: result.key } : {}),
    };
  };
  const general = (): QuizIssueWhere => ({ tab: 'general', label: 'Datos del quiz' });

  const stageIndex = (id: string) => stages.findIndex((stage) => stage.id === id);
  const questionIndex = (si: number, id: string) =>
    stages[si]?.questions.findIndex((question) => question.id === id) ?? -1;

  return {
    stages,
    results,
    general,
    stageAt,
    questionAt,
    answerAt,
    resultAt,
    stage: (stageId: string) => {
      const si = stageIndex(stageId);
      return si >= 0 ? stageAt(si) : { tab: 'etapas' as const, label: 'Una etapa' };
    },
    question: (stageId: string, questionId: string) => {
      const si = stageIndex(stageId);
      const qi = questionIndex(si, questionId);
      return si >= 0 && qi >= 0 ? questionAt(si, qi) : stageAt(Math.max(si, 0));
    },
    answer: (stageId: string, questionId: string, answerId: string) => {
      const si = stageIndex(stageId);
      const qi = questionIndex(si, questionId);
      const ai =
        stages[si]?.questions[qi]?.answers.findIndex((answer) => answer.id === answerId) ?? -1;
      return ai >= 0 ? answerAt(si, qi, ai) : questionAt(Math.max(si, 0), Math.max(qi, 0));
    },
    result: (key: string) => {
      const ri = results.findIndex((result) => result.key === key);
      return ri >= 0 ? resultAt(ri) : { tab: 'resultados' as const, label: 'Un resultado' };
    },
    /** La primera vez que se nombra la etapa en los resultados (para «crea sus resultados»). */
    stageResults: (stageId: string): QuizIssueWhere => {
      const si = stageIndex(stageId);
      return {
        tab: 'resultados',
        label: si >= 0 ? `Etapa ${si + 1}${quoted(stages[si]?.title ?? '', 30)}` : 'Una etapa',
        stageId,
      };
    },
  };
}

/** Un problema con su ubicación delante del mensaje. */
export function issue(
  code: string,
  where: QuizIssueWhere,
  message: string,
  path?: string,
): QuizIssue {
  return { code, message: `${where.label}: ${message}`, where, ...(path ? { path } : {}) };
}

/** Lo mínimo de un problema de Zod que hace falta aquí (sirve para v4 sin atarse a sus tipos internos). */
export interface SchemaIssueLike {
  code: string;
  path: readonly PropertyKey[];
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
}

const count = (n: number | bigint | undefined, one: string, many: string) =>
  `${String(n ?? 0)} ${Number(n) === 1 ? one : many}`;

/** Frase genérica (en español) cuando el campo no tiene una propia. */
function generic(raw: SchemaIssueLike): string {
  const isList = raw.origin === 'array';
  if (raw.code === 'too_small') {
    return isList
      ? `necesita al menos ${count(raw.minimum, 'elemento', 'elementos')}`
      : 'no puede quedar vacío';
  }
  if (raw.code === 'too_big') {
    return isList
      ? `admite como máximo ${count(raw.maximum, 'elemento', 'elementos')}`
      : `es demasiado largo (máximo ${String(raw.maximum ?? '')} caracteres)`;
  }
  if (raw.code === 'invalid_type') return 'falta este dato';
  return 'tiene un valor que no es válido';
}

const tooLong = (raw: SchemaIssueLike) =>
  `es demasiado largo (máximo ${String(raw.maximum ?? '')} caracteres)`;

/**
 * Traduce los problemas del esquema del quiz a mensajes con ubicación. Las respuestas sin resultado de una etapa que
 * todavía no tiene resultados se resumen en un solo aviso por etapa (crear primero los resultados).
 */
export function translateSchemaIssues(
  rawIssues: readonly SchemaIssueLike[],
  draft: unknown,
): QuizIssue[] {
  const at = createQuizLocator(draft);
  const out: QuizIssue[] = [];
  const seen = new Set<string>();
  const push = (item: QuizIssue) => {
    if (seen.has(item.message)) return;
    seen.add(item.message);
    out.push(item);
  };
  const stageHasResults = (si: number) =>
    at.results.some((result) => result.stageId === at.stages[si]?.id);

  for (const raw of rawIssues) {
    const path = raw.path.map((part) => (typeof part === 'symbol' ? '' : part));
    const dotted = path.join('.');
    const [head, a, b, c, d, e, f] = path;
    const small = raw.code === 'too_small';
    const big = raw.code === 'too_big';

    if (head === 'stages' && typeof a === 'number') {
      const si = a;
      if (b === 'questions' && typeof c === 'number') {
        const qi = c;
        if (d === 'answers' && typeof e === 'number') {
          const where = at.answerAt(si, qi, e);
          if (f === 'resultKey') {
            if (!stageHasResults(si)) {
              push(
                issue(
                  'STAGE_NO_RESULTS',
                  at.stageResults(at.stages[si]?.id ?? ''),
                  'primero crea los resultados de esta etapa en la pestaña Resultados; después elige a cuál suma cada respuesta',
                  `stages.${si}.results`,
                ),
              );
            } else {
              push(
                issue(
                  'ANSWER_NO_RESULT',
                  { ...where, field: 'resultKey' },
                  'elige a qué resultado suma esta respuesta',
                  dotted,
                ),
              );
            }
          } else if (f === 'text') {
            push(
              issue(
                'ANSWER_TEXT',
                { ...where, field: 'text' },
                big ? tooLong(raw) : 'escribe el texto de la respuesta',
                dotted,
              ),
            );
          } else {
            push(issue('SCHEMA', where, generic(raw), dotted));
          }
          continue;
        }
        const where = at.questionAt(si, qi);
        if (d === 'answers' && e === undefined) {
          push(
            issue(
              'QUESTION_ANSWERS',
              where,
              small
                ? `necesita al menos ${count(raw.minimum, 'respuesta', 'respuestas')}`
                : `admite como máximo ${count(raw.maximum, 'respuesta', 'respuestas')}`,
              dotted,
            ),
          );
        } else if (d === 'text') {
          push(
            issue(
              'QUESTION_TEXT',
              { ...where, field: 'text' },
              big ? tooLong(raw) : 'escribe el texto de la pregunta',
              dotted,
            ),
          );
        } else if (d === 'image') {
          push(
            issue('QUESTION_IMAGE', where, 'la imagen quedó incompleta: vuelve a subirla', dotted),
          );
        } else {
          push(issue('SCHEMA', where, generic(raw), dotted));
        }
        continue;
      }
      const where = at.stageAt(si);
      if (b === 'questions' && c === undefined) {
        push(
          issue(
            'STAGE_QUESTIONS',
            where,
            small
              ? 'esta etapa todavía no tiene preguntas: agrega al menos una'
              : `admite como máximo ${count(raw.maximum, 'pregunta', 'preguntas')}`,
            dotted,
          ),
        );
      } else if (b === 'title') {
        push(issue('STAGE_TITLE', where, tooLong(raw), dotted));
      } else if (b === 'conditionResultKey' || b === 'conditionStageId') {
        push(
          issue(
            'STAGE_CONDITION',
            where,
            'elige después de qué etapa va y con qué resultado se activa',
            dotted,
          ),
        );
      } else {
        push(issue('SCHEMA', where, generic(raw), dotted));
      }
      continue;
    }

    if (head === 'stages') {
      push(
        issue(
          'QUIZ_STAGES',
          { tab: 'etapas', label: 'Preguntas' },
          small
            ? 'el quiz todavía no tiene etapas: agrega la primera'
            : `el quiz admite como máximo ${count(raw.maximum, 'etapa', 'etapas')}`,
          dotted,
        ),
      );
      continue;
    }

    if (head === 'results' && typeof a === 'number') {
      const where = at.resultAt(a);
      if (b === 'title') {
        push(
          issue(
            'RESULT_TITLE',
            { ...where, field: 'title' },
            big ? tooLong(raw) : 'escribe el título del resultado',
            dotted,
          ),
        );
      } else if (b === 'stageId') {
        push(issue('RESULT_STAGE', where, 'no pertenece a ninguna etapa', dotted));
      } else if (b === 'reveal') {
        push(
          issue(
            'RESULT_REVEAL',
            where,
            typeof d === 'number'
              ? `la línea ${d + 1} antes del resultado ${big ? tooLong(raw) : 'está vacía'}`
              : 'revisa las líneas antes del resultado',
            dotted,
          ),
        );
      } else if (b === 'facts') {
        push(
          issue(
            'RESULT_FACTS',
            where,
            typeof c === 'number'
              ? `al dato ${c + 1} le falta ${d === 'label' ? 'el nombre' : 'el valor'}${big ? ` o ${tooLong(raw)}` : ''}`
              : `admite como máximo ${count(raw.maximum, 'dato', 'datos')}`,
            dotted,
          ),
        );
      } else if (b === 'media') {
        push(
          issue(
            'RESULT_MEDIA',
            where,
            'la imagen o el video quedó incompleto: vuelve a subirlo',
            dotted,
          ),
        );
      } else if (b === 'description') {
        push(issue('RESULT_DESCRIPTION', where, `la descripción ${tooLong(raw)}`, dotted));
      } else if (b === 'fieldSlug') {
        push(issue('RESULT_FIELD', where, 'el campo de poder elegido no es válido', dotted));
      } else {
        push(issue('SCHEMA', where, generic(raw), dotted));
      }
      continue;
    }

    if (head === 'results') {
      push(
        issue(
          'QUIZ_RESULTS',
          { tab: 'resultados', label: 'Resultados' },
          small
            ? `este quiz necesita al menos ${count(raw.minimum, 'resultado', 'resultados')}`
            : `el quiz admite como máximo ${count(raw.maximum, 'resultado', 'resultados')}`,
          dotted,
        ),
      );
      continue;
    }

    const where = at.general();
    if (head === 'title') {
      push(
        issue(
          'QUIZ_TITLE',
          { ...where, field: 'title' },
          big ? `el nombre ${tooLong(raw)}` : 'escribe el nombre del quiz',
          dotted,
        ),
      );
    } else if (head === 'instructionsHtml') {
      push(issue('QUIZ_INSTRUCTIONS', where, `las instrucciones ${tooLong(raw)}`, dotted));
    } else if (head === 'settings' && dotted.includes('revealIntro')) {
      push(
        issue(
          'QUIZ_REVEAL',
          where,
          typeof c === 'number'
            ? `la línea ${c + 1} antes del resultado ${big ? tooLong(raw) : 'está vacía'}`
            : 'revisa las líneas antes del resultado',
          dotted,
        ),
      );
    } else if (head === 'image') {
      push(issue('QUIZ_IMAGE', where, 'la imagen quedó incompleta: vuelve a subirla', dotted));
    } else {
      push(issue('SCHEMA', where, generic(raw), dotted));
    }
  }
  return out;
}
