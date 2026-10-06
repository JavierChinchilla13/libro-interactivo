import type { QuizContent, QuizSettings, ResultDef, StageDef } from '@libro/shared';

/**
 * Constructores de contenido de quizzes (todo con textos `[PLACEHOLDER]`): los usan el seed de ejemplo y las pruebas.
 */

export const DEFAULT_SETTINGS: QuizSettings = { allowRetake: true, showBreakdown: false };

/** Etapa de `questions` preguntas; la respuesta `i` de cada pregunta suma al resultado `i` (como las redacta la autora). */
export function simpleStage(
  id: string,
  resultKeys: string[],
  options: { questions?: number; producesFinal?: boolean; condition?: [string, string]; order?: number } = {},
): StageDef {
  const count = options.questions ?? 3;
  return {
    id,
    order: options.order ?? 1,
    shuffleQuestions: true,
    producesFinal: options.producesFinal ?? true,
    ...(options.condition
      ? { conditionStageId: options.condition[0], conditionResultKey: options.condition[1] }
      : {}),
    questions: Array.from({ length: count }, (_, q) => ({
      id: `${id}-p${q + 1}`,
      text: `[PLACEHOLDER] Pregunta ${q + 1}`,
      answers: resultKeys.map((key, a) => ({
        id: `${id}-p${q + 1}-${String.fromCharCode(97 + a)}`,
        text: `[PLACEHOLDER] Respuesta ${a + 1}`,
        resultKey: key,
      })),
    })),
  };
}

export function resultsFor(stageId: string, keys: string[]): ResultDef[] {
  return keys.map((key) => ({
    key,
    stageId,
    title: `[PLACEHOLDER] ${key}`,
    description: `<p>[PLACEHOLDER] Descripción de ${key}</p>`,
  }));
}

/** Quiz de una sola etapa con resultados r1..rN. */
export function simpleContent(
  options: { results?: number; questions?: number; settings?: Partial<QuizSettings>; title?: string } = {},
): QuizContent {
  const keys = Array.from({ length: options.results ?? 3 }, (_, i) => `r${i + 1}`);
  return {
    title: options.title ?? '[PLACEHOLDER] Quiz',
    instructionsHtml: '<p>[PLACEHOLDER] Instrucciones</p>',
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
    stages: [simpleStage('etapa-1', keys, { questions: options.questions })],
    results: resultsFor('etapa-1', keys),
  };
}

/** Quiz de dos etapas: la primera elige entre `fuego` y `agua`; cada rama tiene una pregunta con sus dos poderes. */
export function twoStageContent(settings: Partial<QuizSettings> = {}): QuizContent {
  return {
    title: '[PLACEHOLDER] Quiz de dos etapas',
    instructionsHtml: '<p>[PLACEHOLDER]</p>',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    stages: [
      simpleStage('etapa-1', ['fuego', 'agua'], { questions: 4, producesFinal: false }),
      simpleStage('etapa-fuego', ['poder-f1', 'poder-f2'], {
        questions: 1,
        order: 2,
        condition: ['etapa-1', 'fuego'],
      }),
      simpleStage('etapa-agua', ['poder-a1', 'poder-a2'], {
        questions: 1,
        order: 3,
        condition: ['etapa-1', 'agua'],
      }),
    ],
    results: [
      ...resultsFor('etapa-1', ['fuego', 'agua']),
      ...resultsFor('etapa-fuego', ['poder-f1', 'poder-f2']),
      ...resultsFor('etapa-agua', ['poder-a1', 'poder-a2']),
    ],
  };
}
