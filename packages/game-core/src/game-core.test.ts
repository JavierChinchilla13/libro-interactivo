import { describe, expect, it } from 'vitest';
import {
  allPaths,
  applyChoice,
  assertValidStory,
  libro1Story,
  startScene,
  toPublicScene,
  validateStory,
  type Story,
} from './index.js';

const tiny = (): Story => ({
  title: 'Mini',
  startSceneId: 'a',
  scenes: [
    {
      id: 'a',
      background: { type: 'color', color: '#000' },
      layers: [],
      text: 'a',
      choices: [
        { id: 'x', label: 'x', nextSceneId: 'win' },
        { id: 'y', label: 'y', nextSceneId: 'lose' },
      ],
    },
    {
      id: 'win',
      background: { type: 'color', color: '#000' },
      layers: [],
      text: 'w',
      choices: [],
      endingKey: 'ok',
    },
    {
      id: 'lose',
      background: { type: 'color', color: '#000' },
      layers: [],
      text: 'l',
      choices: [],
      endingKey: 'ko',
    },
  ],
  endings: [
    { key: 'ok', kind: 'completed', title: 'ok', text: 'ok' },
    { key: 'ko', kind: 'failed', title: 'ko', text: 'ko' },
  ],
});

const codes = (story: Story) => validateStory(story).map((issue) => issue.code);

describe('validateStory', () => {
  it('acepta una historia mínima y la del libro 1', () => {
    expect(validateStory(tiny())).toEqual([]);
    expect(() => assertValidStory(libro1Story)).not.toThrow();
  });

  it('detecta destinos inexistentes, callejones y finales con decisiones', () => {
    const story = tiny();
    story.scenes[0]?.choices.push({ id: 'z', label: 'z', nextSceneId: 'nope' });
    story.scenes.push({
      id: 'sin-salida',
      background: { type: 'color', color: '#000' },
      layers: [],
      text: '',
      choices: [],
    });
    const ending = story.scenes[1];
    if (ending) ending.choices = [{ id: 'c', label: 'c', nextSceneId: 'a' }];
    expect(codes(story)).toEqual(
      expect.arrayContaining(['MISSING_TARGET', 'DEAD_END', 'ENDING_WITH_CHOICES', 'UNREACHABLE']),
    );
  });

  it('detecta escenas huérfanas, finales sin declarar y la ausencia de un final completed', () => {
    const story = tiny();
    story.endings = story.endings.filter((e) => e.kind === 'failed');
    story.scenes.push({
      id: 'huerfana',
      background: { type: 'color', color: '#000' },
      layers: [],
      text: '',
      choices: [],
      endingKey: 'inexistente',
    });
    expect(codes(story)).toEqual(
      expect.arrayContaining(['UNREACHABLE', 'UNKNOWN_ENDING', 'NO_COMPLETED_ENDING']),
    );
  });

  it('detecta ciclos cerrados sin salida y geometría fuera del escenario', () => {
    const story = tiny();
    story.scenes.push(
      {
        id: 'c1',
        background: { type: 'color', color: '#000' },
        layers: [],
        text: '',
        choices: [{ id: 'n', label: 'n', nextSceneId: 'c2' }],
      },
      {
        id: 'c2',
        background: { type: 'color', color: '#000' },
        layers: [],
        text: '',
        choices: [{ id: 'n', label: 'n', nextSceneId: 'c1' }],
      },
    );
    const first = story.scenes[0];
    if (first) {
      first.choices.push({
        id: 'ciclo',
        label: 'ciclo',
        nextSceneId: 'c1',
        hotspot: { x: 90, y: 90, w: 30, h: 30 },
      });
    }
    expect(codes(story)).toEqual(expect.arrayContaining(['UNWINNABLE', 'BAD_GEOMETRY']));
  });
});

describe('motor', () => {
  it('avanza con una decisión de la escena actual y marca los finales', () => {
    const story = tiny();
    const win = applyChoice(story, 'a', 'x');
    expect(win).toMatchObject({ ok: true, ending: { key: 'ok', kind: 'completed' } });
    const lose = applyChoice(story, 'a', 'y');
    expect(lose).toMatchObject({ ok: true, ending: { key: 'ko', kind: 'failed' } });
  });

  it('rechaza decisiones ajenas a la escena, escenas desconocidas y finales', () => {
    const story = tiny();
    expect(applyChoice(story, 'a', 'otra')).toEqual({ ok: false, reason: 'UNKNOWN_CHOICE' });
    expect(applyChoice(story, 'nope', 'x')).toEqual({ ok: false, reason: 'UNKNOWN_SCENE' });
    expect(applyChoice(story, 'win', 'x')).toEqual({ ok: false, reason: 'ALREADY_ENDED' });
  });

  it('la vista pública no revela a dónde lleva cada decisión', () => {
    const story = tiny();
    const visible = toPublicScene(story, startScene(story));
    expect(JSON.stringify(visible)).not.toContain('nextSceneId');
    expect(JSON.stringify(visible)).not.toContain('lose');
    expect(visible.choices.map((c) => c.id)).toEqual(['x', 'y']);
    const final = toPublicScene(story, story.scenes[2] as never);
    expect(final.ending).toMatchObject({ key: 'ko', kind: 'failed' });
  });
});

describe('historia del libro 1', () => {
  const paths = allPaths(libro1Story);

  it('todo camino termina en un final declarado y hay al menos uno completado y varios fallidos', () => {
    const kinds = paths.map(
      (p) => libro1Story.endings.find((e) => e.key === p.endingKey)?.kind ?? 'desconocido',
    );
    expect(kinds).not.toContain('desconocido');
    expect(kinds.filter((k) => k === 'completed').length).toBeGreaterThanOrEqual(4);
    expect(kinds.filter((k) => k === 'failed').length).toBeGreaterThanOrEqual(8);
  });

  it('las cuatro rutas buenas llevan a la evacuación y las malas son finales fallidos', () => {
    const completed = paths
      .filter((p) => p.endingKey === 'evacuacion')
      .map((p) => p.choices.join('>'));
    expect(completed).toEqual(
      expect.arrayContaining([
        'derecha>escaleras>ruta-a>esconderse>seguir',
        'derecha>escaleras>ruta-b>biologia>seguir',
        'derecha>escaleras>ruta-c>perrito>seguir',
        'derecha>escaleras>ruta-d>continuar-d',
      ]),
    );
    const failedFirst = paths.filter((p) => p.choices[0] === 'izquierda');
    expect(failedFirst).toHaveLength(1);
    expect(failedFirst[0]?.endingKey).toBe('derrumbe');
  });

  it('todos los textos son marcadores [PLACEHOLDER] (el contenido real es de la autora)', () => {
    for (const scene of libro1Story.scenes) {
      expect(scene.text.startsWith('[PLACEHOLDER]')).toBe(true);
      for (const choice of scene.choices) expect(choice.label).toContain('[PLACEHOLDER]');
    }
  });
});
