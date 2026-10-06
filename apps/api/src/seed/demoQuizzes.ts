import type { QuizContent, ResultDef, StageDef } from '@libro/shared';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import type { QuizPublishService } from '../services/quizPublish.service.js';
import { resultsFor, simpleContent, simpleStage } from './quizBuilders.js';

/**
 * Quizzes de ejemplo para desarrollar y probar el flujo completo. TODO el texto es `[PLACEHOLDER]`: el contenido
 * real del libro lo carga la autora desde el panel (fase 7); aquí solo importa la FORMA de cada caso.
 */
export interface DemoQuiz {
  slug: string;
  order: number;
  content: QuizContent;
}

const NARRATIVE_INTRO = {
  lines: ['[PLACEHOLDER] Tus resultados se están decodificando…', '[PLACEHOLDER] Un momento más.'],
  effect: 'decodificar',
};

/** Quiz 1: una sola vez, 5 resultados con secuencia narrativa y datos. */
function onceQuiz(): QuizContent {
  const content = simpleContent({
    title: '[PLACEHOLDER] Quiz 1 — se juega una sola vez',
    questions: 6,
    results: 5,
    settings: { allowRetake: false, showBreakdown: false, revealIntro: NARRATIVE_INTRO },
  });
  content.results = content.results.map((result, index) => ({
    ...result,
    reveal: { lines: [`[PLACEHOLDER] Línea 1 del resultado ${index + 1}`, '[PLACEHOLDER] Línea 2'], effect: 'brillo' },
    facts: [
      { label: '[PLACEHOLDER] Tu cápsula', value: `[PLACEHOLDER] Cápsula ${index + 1}` },
      { label: '[PLACEHOLDER] Detalle', value: '[PLACEHOLDER] Dato del resultado' },
    ],
  }));
  return content;
}

/** Quiz 2: se puede repetir y al terminar muestra el porcentaje de cada resultado. */
function breakdownQuiz(): QuizContent {
  return simpleContent({
    title: '[PLACEHOLDER] Quiz 2 — con porcentajes',
    questions: 6,
    results: 5,
    settings: { allowRetake: true, showBreakdown: true, revealIntro: NARRATIVE_INTRO },
  });
}

/** Quiz 3: dos etapas; la primera elige 1 de 5 campos y cada campo tiene su propia pregunta de poderes (14 en total). */
function branchingQuiz(): QuizContent {
  const fields = ['campo-1', 'campo-2', 'campo-3', 'campo-4', 'campo-5'];
  const powersPerField = [3, 3, 3, 3, 2];
  const stages: StageDef[] = [simpleStage('etapa-1', fields, { questions: 5, producesFinal: false })];
  const results: ResultDef[] = resultsFor('etapa-1', fields);
  fields.forEach((field, index) => {
    const powers = Array.from({ length: powersPerField[index] ?? 2 }, (_, p) => `${field}-poder-${p + 1}`);
    stages.push(
      simpleStage(`etapa-${field}`, powers, {
        questions: 1,
        order: index + 2,
        condition: ['etapa-1', field],
      }),
    );
    results.push(
      ...resultsFor(`etapa-${field}`, powers).map((result) => ({
        ...result,
        reveal: { lines: ['[PLACEHOLDER] Tu poder se está manifestando…'], effect: 'chispas' },
      })),
    );
  });
  return {
    title: '[PLACEHOLDER] Quiz 3 — dos etapas y 5 ramas',
    instructionsHtml: '<p>[PLACEHOLDER] Instrucciones.</p>',
    settings: { allowRetake: true, showBreakdown: false, revealIntro: NARRATIVE_INTRO },
    stages,
    results,
  };
}

export function demoQuizzes(): DemoQuiz[] {
  return [
    { slug: 'quiz-1', order: 1, content: onceQuiz() },
    { slug: 'quiz-2', order: 2, content: breakdownQuiz() },
    { slug: 'quiz-3', order: 3, content: branchingQuiz() },
  ];
}

export interface SeedResult {
  bookId: string;
  created: string[];
  existing: string[];
}

/**
 * Crea el libro de ejemplo y sus tres quizzes (publicados). Idempotente: lo que ya existe no se toca.
 * Publica por el mismo servicio que usa el panel, así el ejemplo pasa la validación estricta.
 */
export async function seedDemoQuizzes(input: {
  publisher: Pick<QuizPublishService, 'publish'>;
  actor: { userId: string; role: 'ADMIN' | 'EDITOR' };
}): Promise<SeedResult> {
  const book =
    (await Book.findOne({ slug: 'libro-1' })) ??
    (await Book.create({ slug: 'libro-1', title: '[PLACEHOLDER] Libro 1', order: 1, status: 'published' }));

  const created: string[] = [];
  const existing: string[] = [];
  for (const demo of demoQuizzes()) {
    if (await Quiz.exists({ bookId: book._id, slug: demo.slug })) {
      existing.push(demo.slug);
      continue;
    }
    const quiz = await Quiz.create({
      bookId: book._id,
      slug: demo.slug,
      order: demo.order,
      title: demo.content.title,
      instructionsHtml: demo.content.instructionsHtml,
      settings: demo.content.settings,
      draft: {
        stages: demo.content.stages,
        results: demo.content.results,
        updatedAt: new Date(),
        updatedBy: input.actor.userId,
      },
    });
    await input.publisher.publish(input.actor, quiz._id.toString());
    created.push(demo.slug);
  }
  return { bookId: book._id.toString(), created, existing };
}
