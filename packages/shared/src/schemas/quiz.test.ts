import { describe, expect, it } from 'vitest';
import {
  attemptResponseSchema,
  mediaSchema,
  quizContentSchema,
  quizIdSchema,
  quizSettingsSchema,
  stagePayloadSchema,
  submitAnswersRequestSchema,
} from './quiz.js';

describe('esquemas de quiz', () => {
  it('los ajustes por defecto permiten repetir y no muestran porcentajes', () => {
    expect(quizSettingsSchema.parse({})).toEqual({ allowRetake: true, showBreakdown: false });
  });

  it('acepta media de imagen o video y rechaza otros tipos', () => {
    const image = { provider: 'cloudinary', publicId: 'a', url: 'u', width: 1, height: 1, alt: '' };
    expect(mediaSchema.safeParse({ kind: 'image', image }).success).toBe(true);
    const video = { ...image, durationSeconds: 4 };
    expect(mediaSchema.safeParse({ kind: 'video', video }).success).toBe(true);
    expect(mediaSchema.safeParse({ kind: 'gif', image }).success).toBe(false);
  });

  it('los ids estables no admiten espacios ni símbolos', () => {
    expect(quizIdSchema.safeParse('etapa-1_a').success).toBe(true);
    expect(quizIdSchema.safeParse('etapa 1').success).toBe(false);
    expect(quizIdSchema.safeParse('-etapa').success).toBe(false);
  });

  it('un quiz necesita al menos 2 resultados y una etapa con preguntas con 2 respuestas', () => {
    const answers = [
      { id: 'a', text: 'A', resultKey: 'r1' },
      { id: 'b', text: 'B', resultKey: 'r2' },
    ];
    const base = {
      title: 'T',
      instructionsHtml: '',
      settings: {},
      stages: [
        {
          id: 'e1',
          order: 1,
          producesFinal: true,
          questions: [{ id: 'p1', text: 'P', answers }],
        },
      ],
      results: [
        { key: 'r1', stageId: 'e1', title: 'R1' },
        { key: 'r2', stageId: 'e1', title: 'R2' },
      ],
    };
    expect(quizContentSchema.safeParse(base).success).toBe(true);
    expect(quizContentSchema.safeParse({ ...base, results: base.results.slice(0, 1) }).success).toBe(false);
    const oneAnswer = structuredClone(base);
    oneAnswer.stages[0]!.questions[0]!.answers = answers.slice(0, 1);
    expect(quizContentSchema.safeParse(oneAnswer).success).toBe(false);
  });

  it('el payload del lector descarta resultKey aunque se le cuele (el contrato no lo tiene)', () => {
    const stage = {
      stageId: 'e1',
      questions: [{ id: 'p1', text: 'P', answers: [{ id: 'a', text: 'A', resultKey: 'r1' }] }],
    };
    const parsed = stagePayloadSchema.parse(stage);
    expect(JSON.stringify(parsed)).not.toContain('resultKey');
  });

  it('la respuesta de un intento distingue etapa en curso de resultado', () => {
    const id = '670000000000000000000001';
    expect(
      attemptResponseSchema.safeParse({ attemptId: id, status: 'in_progress', stage: { stageId: 'e1', questions: [] } })
        .success,
    ).toBe(true);
    expect(attemptResponseSchema.safeParse({ attemptId: id, status: 'completed' }).success).toBe(false);
  });

  it('exige al menos una respuesta y ids válidos al enviar una etapa', () => {
    expect(submitAnswersRequestSchema.safeParse({ answers: [] }).success).toBe(false);
    expect(
      submitAnswersRequestSchema.safeParse({ answers: [{ questionId: 'p1', answerId: 'a' }] }).success,
    ).toBe(true);
    expect(
      submitAnswersRequestSchema.safeParse({ answers: [{ questionId: 'p 1', answerId: 'a' }] }).success,
    ).toBe(false);
  });
});
