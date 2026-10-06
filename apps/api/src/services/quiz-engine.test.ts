import { quizContentSchema, type QuizContent } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../test-utils/random.js';
import { resultsFor, simpleContent, simpleStage, twoStageContent } from '../test-utils/quizFixtures.js';
import {
  computeDistribution,
  firstStage,
  nextStage,
  pickWinner,
  questionOrderFor,
  resolveStageAnswers,
  shuffle,
  tallyAnswers,
  toResultPayload,
  toStagePayload,
  validateQuizContent,
} from './quiz-engine.js';

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe('shuffle', () => {
  it('conserva los elementos, no modifica el original y es reproducible con semilla', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(original, seededRandom(7));
    const b = shuffle(original, seededRandom(7));
    expect([...a].sort()).toEqual(original);
    expect(a).toEqual(b);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('puede producir cualquier posición para cada elemento (no queda fijo)', () => {
    const random = seededRandom(1);
    const firstPositions = new Set<number>();
    for (let i = 0; i < 200; i += 1) firstPositions.add(shuffle([0, 1, 2, 3], random)[0] as number);
    expect(firstPositions.size).toBe(4);
  });

  it('respeta shuffleQuestions=false: mismo orden que el definido', () => {
    const stage = { ...simpleStage('e', ['a', 'b']), shuffleQuestions: false };
    expect(questionOrderFor(stage, seededRandom(3))).toEqual(stage.questions.map((q) => q.id));
  });
});

describe('resolveStageAnswers', () => {
  const stage = simpleStage('e', ['a', 'b'], { questions: 2 });
  const valid = [
    { questionId: 'e-p1', answerId: 'e-p1-a' },
    { questionId: 'e-p2', answerId: 'e-p2-b' },
  ];

  it('acepta una respuesta por pregunta y devuelve el resultKey de cada una', () => {
    const checked = resolveStageAnswers(stage, valid);
    expect(checked.ok && checked.answers.map((a) => a.resultKey)).toEqual(['a', 'b']);
  });

  it('rechaza preguntas ajenas, repetidas, respuestas de otra pregunta y etapas incompletas', () => {
    expect(resolveStageAnswers(stage, [{ questionId: 'otra', answerId: 'x' }]).ok).toBe(false);
    expect(resolveStageAnswers(stage, [valid[0]!, valid[0]!]).ok).toBe(false);
    expect(
      resolveStageAnswers(stage, [valid[0]!, { questionId: 'e-p2', answerId: 'e-p1-a' }]).ok,
    ).toBe(false);
    expect(resolveStageAnswers(stage, [valid[0]!]).ok).toBe(false);
  });
});

describe('tallyAnswers y pickWinner', () => {
  it('gana el resultado más frecuente', () => {
    const tally = tallyAnswers([
      { questionId: 'q1', answerId: 'a', resultKey: 'r1' },
      { questionId: 'q2', answerId: 'a', resultKey: 'r2' },
      { questionId: 'q3', answerId: 'a', resultKey: 'r2' },
    ]);
    expect(pickWinner(tally, seededRandom(1))).toEqual({ resultKey: 'r2' });
  });

  it('en empate elige al azar SOLO entre los empatados y lo registra (prueba estadística con semilla)', () => {
    const tally = [
      { resultKey: 'r1', count: 2 },
      { resultKey: 'r2', count: 2 },
      { resultKey: 'r3', count: 1 },
    ];
    const random = seededRandom(2026);
    const wins: Record<string, number> = { r1: 0, r2: 0, r3: 0 };
    for (let i = 0; i < 4000; i += 1) {
      const picked = pickWinner(tally, random);
      wins[picked.resultKey] = (wins[picked.resultKey] ?? 0) + 1;
      expect(picked.tiedKeys).toEqual(['r1', 'r2']);
    }
    expect(wins['r3']).toBe(0);
    // Reparto parejo: cada empatado ronda el 50 % (margen holgado para no ser frágil).
    expect(wins['r1']).toBeGreaterThan(1800);
    expect(wins['r1']).toBeLessThan(2200);
    expect(wins['r1']! + wins['r2']!).toBe(4000);
  });

  it('sin empate no registra tiedKeys', () => {
    expect(pickWinner([{ resultKey: 'r1', count: 3 }], seededRandom(1))).toEqual({ resultKey: 'r1' });
  });
});

describe('computeDistribution', () => {
  const sum = (rows: { percent: number }[]) => rows.reduce((total, row) => total + row.percent, 0);

  it('suma exactamente 100 aunque los tercios no sean enteros', () => {
    const rows = computeDistribution([
      { resultKey: 'a', count: 1 },
      { resultKey: 'b', count: 1 },
      { resultKey: 'c', count: 1 },
    ]);
    expect(sum(rows)).toBe(100);
    expect(rows.map((row) => row.percent).sort()).toEqual([33, 33, 34]);
  });

  it('suma 100 para repartos arbitrarios (propiedad)', () => {
    const random = seededRandom(99);
    for (let round = 0; round < 300; round += 1) {
      const tally = Array.from({ length: 1 + random(8) }, (_, i) => ({
        resultKey: `r${i}`,
        count: 1 + random(12),
      }));
      expect(sum(computeDistribution(tally))).toBe(100);
    }
  });

  it('sin respuestas no hay porcentajes', () => {
    expect(computeDistribution([])).toEqual([]);
  });
});

describe('etapas', () => {
  const content = twoStageContent();

  it('la etapa inicial es la que no tiene condición y la siguiente depende del resultado', () => {
    expect(firstStage(content)?.id).toBe('etapa-1');
    expect(nextStage(content, 'etapa-1', 'fuego')?.id).toBe('etapa-fuego');
    expect(nextStage(content, 'etapa-1', 'agua')?.id).toBe('etapa-agua');
    expect(nextStage(content, 'etapa-fuego', 'poder-f1')).toBeUndefined();
  });
});

describe('payloads al lector', () => {
  const content = simpleContent({ results: 3, questions: 2 });
  const stage = content.stages[0]!;

  it('la etapa no incluye resultKey ni nada de los resultados, y respeta el orden dado', () => {
    const payload = toStagePayload(stage, ['etapa-1-p2', 'etapa-1-p1']);
    expect(payload.questions.map((q) => q.id)).toEqual(['etapa-1-p2', 'etapa-1-p1']);
    const json = JSON.stringify(payload);
    expect(json).not.toContain('resultKey');
    expect(json).not.toContain('"r1"');
    expect(json).not.toContain('Descripción');
  });

  it('el resultado trae la secuencia narrativa y los datos, y la distribución solo con showBreakdown', () => {
    const rich: QuizContent = {
      ...content,
      settings: { allowRetake: true, showBreakdown: false, revealIntro: { lines: ['Decodificando…'] } },
      results: content.results.map((result) =>
        result.key === 'r1'
          ? {
              ...result,
              reveal: { lines: ['Línea 1'], effect: 'glitch' },
              facts: [{ label: 'Detalle', value: '[PLACEHOLDER]' }],
            }
          : result,
      ),
    };
    const dist = [
      { resultKey: 'r1', percent: 60 },
      { resultKey: 'r2', percent: 40 },
    ];
    const plain = toResultPayload(rich, 'r1', dist);
    expect(plain.revealIntro?.lines).toEqual(['Decodificando…']);
    expect(plain.reveal).toEqual({ lines: ['Línea 1'], effect: 'glitch' });
    expect(plain.facts).toHaveLength(1);
    expect(plain.distribution).toBeUndefined();

    const withBreakdown = toResultPayload(
      { ...rich, settings: { ...rich.settings, showBreakdown: true } },
      'r1',
      dist,
    );
    expect(withBreakdown.distribution?.map((row) => row.percent)).toEqual([60, 40]);
  });
});

describe('validateQuizContent', () => {
  it('un quiz simple y uno de dos etapas son válidos y cumplen el esquema', () => {
    for (const content of [simpleContent(), twoStageContent()]) {
      expect(quizContentSchema.safeParse(content).success).toBe(true);
      expect(validateQuizContent(content).errors).toEqual([]);
    }
  });

  it('detecta una respuesta que apunta a un resultado inexistente en su etapa', () => {
    const content = simpleContent();
    content.stages[0]!.questions[0]!.answers[0]!.resultKey = 'fantasma';
    expect(codes(validateQuizContent(content).errors)).toContain('ANSWER_UNKNOWN_RESULT');
  });

  it('exige al menos 2 resultados por etapa y ids únicos', () => {
    const one = simpleContent({ results: 3 });
    one.results = one.results.filter((result) => result.key !== 'r3' && result.key !== 'r2');
    expect(codes(validateQuizContent(one).errors)).toContain('STAGE_FEW_RESULTS');

    const dup = simpleContent();
    dup.results.push({ ...dup.results[0]! });
    dup.stages.push({ ...dup.stages[0]!, order: 2 });
    const found = codes(validateQuizContent(dup).errors);
    expect(found).toEqual(expect.arrayContaining(['DUPLICATE_RESULT', 'DUPLICATE_STAGE', 'DUPLICATE_QUESTION']));
  });

  it('una rama sin etapa que continúe, una condición inexistente y varias etapas iniciales son errores', () => {
    const noBranch = twoStageContent();
    noBranch.stages = noBranch.stages.filter((stage) => stage.id !== 'etapa-agua');
    noBranch.results = noBranch.results.filter((result) => result.stageId !== 'etapa-agua');
    expect(codes(validateQuizContent(noBranch).errors)).toContain('BRANCH_WITHOUT_STAGE');

    const badCondition = twoStageContent();
    badCondition.stages[1]!.conditionResultKey = 'inexistente';
    expect(codes(validateQuizContent(badCondition).errors)).toContain('STAGE_CONDITION');

    const twoRoots = twoStageContent();
    delete twoRoots.stages[1]!.conditionStageId;
    delete twoRoots.stages[1]!.conditionResultKey;
    expect(codes(validateQuizContent(twoRoots).errors)).toContain('STAGE_ROOT');
  });

  it('detecta ciclos, etapas ambiguas y la falta de etapa final', () => {
    const cycle: QuizContent = {
      ...simpleContent(),
      stages: [
        simpleStage('a', ['x', 'y'], { producesFinal: false }),
        simpleStage('b', ['p', 'q'], { producesFinal: false, condition: ['c', 'p'], order: 2 }),
        simpleStage('c', ['m', 'n'], { producesFinal: false, condition: ['b', 'p'], order: 3 }),
      ],
      results: [...resultsFor('a', ['x', 'y']), ...resultsFor('b', ['p', 'q']), ...resultsFor('c', ['m', 'n'])],
    };
    const found = codes(validateQuizContent(cycle).errors);
    expect(found).toContain('STAGE_CYCLE');
    expect(found).toContain('NO_FINAL_STAGE');

    const ambiguous = twoStageContent();
    ambiguous.stages.push({
      ...simpleStage('etapa-fuego-bis', ['x1', 'x2'], { condition: ['etapa-1', 'fuego'], order: 4 }),
    });
    ambiguous.results.push(...resultsFor('etapa-fuego-bis', ['x1', 'x2']));
    expect(codes(validateQuizContent(ambiguous).errors)).toContain('STAGE_AMBIGUOUS');
  });

  it('un resultado que ninguna respuesta alcanza es solo un aviso', () => {
    const content = simpleContent({ results: 3 });
    content.results.push({ key: 'huerfano', stageId: 'etapa-1', title: '[PLACEHOLDER]' });
    const { errors, warnings } = validateQuizContent(content);
    expect(errors).toEqual([]);
    expect(codes(warnings)).toContain('RESULT_UNREACHABLE');
  });
});

describe('propiedad: el resultado final siempre es un resultado válido de la etapa final', () => {
  it('para 500 recorridos aleatorios de un quiz de dos etapas', () => {
    const content = twoStageContent();
    const random = seededRandom(31337);
    const finals = new Set(['poder-f1', 'poder-f2', 'poder-a1', 'poder-a2']);

    for (let run = 0; run < 500; run += 1) {
      let stage = firstStage(content)!;
      let finalKey: string | undefined;
      for (let guard = 0; guard < 5 && !finalKey; guard += 1) {
        const submitted = stage.questions.map((question) => ({
          questionId: question.id,
          answerId: question.answers[random(question.answers.length)]!.id,
        }));
        const checked = resolveStageAnswers(stage, submitted);
        if (!checked.ok) throw new Error(checked.message);
        const { resultKey } = pickWinner(tallyAnswers(checked.answers), random);
        if (stage.producesFinal) finalKey = resultKey;
        else stage = nextStage(content, stage.id, resultKey)!;
      }
      expect(finals.has(finalKey ?? '')).toBe(true);
    }
  });
});
