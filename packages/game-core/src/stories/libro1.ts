import type { Ending, Scene, SceneChoice, SceneLayer, Story } from '../types.js';

/**
 * Juego del libro 1 (laboratorio futurista): el árbol de decisiones de las especificaciones de la autora.
 * TODO el texto es `[PLACEHOLDER]`: la redacción y las ilustraciones reales las entrega la autora. Las capas son
 * siluetas de color originales (sin derechos de terceros) para ver cómo se compone y se anima una escena.
 *
 * Reglas del árbol: un solo final de evacuación (`completed`) al que llegan todas las rutas buenas; cada mala decisión
 * es un final `failed` (pantalla de reintento reutilizable). No se muestra ninguna criatura: solo el aviso de peligro.
 */

const bg = (color: string): Scene['background'] => ({ type: 'color', color });

let layerCount = 0;
const shape = (
  shapeName: 'circle' | 'rect' | 'triangle',
  color: string,
  x: number,
  y: number,
  width: number,
  extra: Partial<SceneLayer> = {},
): SceneLayer =>
  ({
    id: `l${(layerCount += 1)}`,
    kind: 'shape',
    shape: shapeName,
    color,
    x,
    y,
    width,
    ...extra,
  }) as SceneLayer;

const choice = (
  id: string,
  label: string,
  nextSceneId: string,
  hotspot?: SceneChoice['hotspot'],
): SceneChoice => ({
  id,
  label: `[PLACEHOLDER] ${label}`,
  nextSceneId,
  ...(hotspot ? { hotspot } : {}),
});

const scene = (
  id: string,
  title: string,
  background: string,
  text: string,
  layers: SceneLayer[],
  choices: SceneChoice[],
): Scene => ({
  id,
  title: `[PLACEHOLDER] ${title}`,
  background: bg(background),
  layers,
  text: `[PLACEHOLDER] ${text}`,
  choices,
});

const ending = (id: string, endingKey: string, text: string, background: string): Scene => ({
  id,
  background: bg(background),
  layers: [shape('circle', 'rgba(255,255,255,0.08)', 50, 45, 40, { animation: { type: 'pulse' } })],
  text: `[PLACEHOLDER] ${text}`,
  choices: [],
  endingKey,
});

const scenes: Scene[] = [
  // 1. Pasillos
  scene(
    's01-pasillos',
    'Los pasillos',
    '#0b1a33',
    'Despiertas en un pasillo del laboratorio. Hay dos salidas: el pasillo de la derecha y el de la izquierda.',
    [
      shape('rect', '#1c3a63', 78, 55, 22, { animation: { type: 'sway', durationMs: 7000 } }),
      shape('rect', '#162b4d', 22, 55, 22),
      shape('circle', '#3fd8ff', 50, 18, 8, { animation: { type: 'pulse', durationMs: 3200 } }),
    ],
    [
      choice('derecha', 'Pasillo derecho', 's02-plantas', { x: 62, y: 28, w: 34, h: 56 }),
      choice('izquierda', 'Pasillo izquierdo', 'fin-derrumbe', { x: 4, y: 28, w: 34, h: 56 }),
    ],
  ),
  // 2. Plantas subterráneas
  scene(
    's02-plantas',
    'Las plantas subterráneas',
    '#0a2230',
    'Estás en las plantas subterráneas. Para subir hay un ascensor y una escalera.',
    [
      shape('rect', '#26567a', 28, 58, 18, { animation: { type: 'float', durationMs: 6000 } }),
      shape('triangle', '#1c3a63', 74, 60, 24, { animation: { type: 'drift', durationMs: 9000 } }),
    ],
    [
      choice('ascensor', 'Tomar el ascensor', 'fin-ascensor', { x: 14, y: 30, w: 30, h: 56 }),
      choice('escaleras', 'Subir por las escaleras', 's03-rutas', { x: 58, y: 30, w: 34, h: 56 }),
    ],
  ),
  // 3. Cuatro rutas
  scene(
    's03-rutas',
    'Cuatro rutas',
    '#10203b',
    'Arriba se abren cuatro rutas: la zona de cultivos, los pasillos del Sector C, los escombros del Sector B y los de la Sala de Mando.',
    [
      shape('circle', '#a89bff', 20, 30, 7, { animation: { type: 'float', durationMs: 5200 } }),
      shape('circle', '#3fd8ff', 80, 30, 7, {
        animation: { type: 'float', durationMs: 6100, delayMs: 600 },
      }),
      shape('circle', '#5fe3ae', 20, 70, 7, {
        animation: { type: 'float', durationMs: 5700, delayMs: 300 },
      }),
      shape('circle', '#ffcb66', 80, 70, 7, {
        animation: { type: 'float', durationMs: 6500, delayMs: 900 },
      }),
    ],
    [
      choice('ruta-a', 'Zona de cultivos', 'sa-cultivos', { x: 6, y: 16, w: 28, h: 28 }),
      choice('ruta-b', 'Pasillos del Sector C', 'sb-sector-c', { x: 66, y: 16, w: 28, h: 28 }),
      choice('ruta-c', 'Escombros del Sector B', 'sc-sector-b', { x: 6, y: 56, w: 28, h: 28 }),
      choice('ruta-d', 'Escombros de la Sala de Mando', 'sd-sala-mando', {
        x: 66,
        y: 56,
        w: 28,
        h: 28,
      }),
    ],
  ),
  // A. Cultivos
  scene(
    'sa-cultivos',
    'Zona de cultivos',
    '#0c2a22',
    'En la zona de cultivos hay dos personajes y un ave mutada que te mira desde lo alto.',
    [
      shape('circle', '#2f7d62', 30, 62, 16),
      shape('circle', '#23604c', 62, 64, 14),
      shape('triangle', '#7fb69c', 52, 24, 10, { animation: { type: 'sway', durationMs: 4800 } }),
    ],
    [
      choice('piedras', 'Lanzar piedras', 'fin-piedras', { x: 66, y: 14, w: 30, h: 30 }),
      choice('esconderse', 'Esconderse detrás de los personajes', 's-evacuacion', {
        x: 14,
        y: 46,
        w: 56,
        h: 40,
      }),
      choice('volver', 'Volver al laboratorio', 'fin-hoyo', { x: 2, y: 8, w: 24, h: 24 }),
    ],
  ),
  // B. Sector C
  scene(
    'sb-sector-c',
    'Pasillos del Sector C',
    '#1a1a2e',
    'Los pasillos del Sector C están destrozados. Una luz parpadea al fondo, y hay dos puertas más.',
    [
      shape('circle', '#ffcb66', 50, 30, 6, { animation: { type: 'pulse', durationMs: 1800 } }),
      shape('rect', '#2b2b4a', 20, 62, 18),
      shape('rect', '#2b2b4a', 80, 62, 18),
    ],
    [
      choice('luz', 'Seguir la luz', 'fin-luz', { x: 40, y: 14, w: 20, h: 30 }),
      choice('biologia', 'Entrar a la Central de Biología', 's-evacuacion', {
        x: 8,
        y: 44,
        w: 26,
        h: 40,
      }),
      choice('entrenamiento', 'Entrar a las salas de entrenamiento', 'fin-entrenamiento', {
        x: 66,
        y: 44,
        w: 26,
        h: 40,
      }),
    ],
  ),
  // C. Sector B
  scene(
    'sc-sector-b',
    'Escombros del Sector B',
    '#241a2a',
    'Entre los escombros del Sector B hay un perrito asustado y un enjambre de avispas cerca.',
    [
      shape('circle', '#b08968', 50, 66, 12, { animation: { type: 'float', durationMs: 3600 } }),
      shape('triangle', '#6b4e71', 80, 28, 12, { animation: { type: 'drift', durationMs: 7000 } }),
    ],
    [
      choice('enfermeria', 'Ir a la enfermería', 'fin-enfermeria', { x: 4, y: 22, w: 28, h: 40 }),
      choice('perrito', 'Proteger al perrito', 's-evacuacion', { x: 36, y: 48, w: 28, h: 40 }),
      choice('escaleras-b', 'Subir por las escaleras', 'fin-escaleras', {
        x: 68,
        y: 14,
        w: 28,
        h: 40,
      }),
    ],
  ),
  // D. Sala de Mando
  scene(
    'sd-sala-mando',
    'Sala de Mando',
    '#102040',
    'Entre los escombros de la Sala de Mando un campo de fuerza te cubre. Alguien se acerca para reanimarte.',
    [
      shape('circle', 'rgba(63,216,255,0.35)', 50, 50, 46, {
        animation: { type: 'pulse', durationMs: 3800 },
      }),
      shape('rect', '#1c3a63', 50, 78, 40),
    ],
    [choice('continuar-d', 'Dejarte ayudar', 'fin-evacuacion', { x: 30, y: 30, w: 40, h: 40 })],
  ),
  // Ruta de evacuación
  scene(
    's-evacuacion',
    'Ruta de evacuación',
    '#0d2b3f',
    'Alguien te indica la ruta de evacuación. Solo hay que seguirla sin mirar atrás.',
    [
      shape('triangle', '#3fd8ff', 50, 48, 18, { animation: { type: 'rise', durationMs: 2600 } }),
      shape('rect', '#26567a', 50, 82, 80),
    ],
    [choice('seguir', 'Seguir la ruta', 'fin-evacuacion', { x: 28, y: 22, w: 44, h: 52 })],
  ),
  // Finales
  ending('fin-evacuacion', 'evacuacion', 'Sales del laboratorio. Estás a salvo.', '#0d3b4f'),
  ending('fin-derrumbe', 'derrumbe', 'El pasillo se derrumba sobre ti.', '#2a0f14'),
  ending(
    'fin-ascensor',
    'ascensor',
    'Algo falló dentro del ascensor y no llegas arriba.',
    '#2a0f14',
  ),
  ending('fin-piedras', 'piedras', 'Tu ataque alerta a lo que no debía despertar.', '#2a0f14'),
  ending('fin-hoyo', 'hoyo', 'Al volver caes en un hoyo.', '#2a0f14'),
  ending('fin-luz', 'luz', 'La luz te lleva donde no debías ir.', '#2a0f14'),
  ending(
    'fin-entrenamiento',
    'entrenamiento',
    'La sala de entrenamiento era una trampa.',
    '#2a0f14',
  ),
  ending('fin-enfermeria', 'enfermeria', 'La enfermería ya no es un lugar seguro.', '#2a0f14'),
  ending('fin-escaleras', 'escaleras-b', 'Las escaleras ceden bajo tus pies.', '#2a0f14'),
];

const failed = (key: string, title: string, text: string): Ending => ({
  key,
  kind: 'failed',
  title: `[PLACEHOLDER] ${title}`,
  text: `[PLACEHOLDER] ${text}`,
});

export const libro1Story: Story = {
  title: '[PLACEHOLDER] Juego final: el laboratorio',
  startSceneId: 's01-pasillos',
  scenes,
  endings: [
    {
      key: 'evacuacion',
      kind: 'completed',
      title: '[PLACEHOLDER] Evacuación',
      text: '[PLACEHOLDER] Lograste salir del laboratorio.',
    },
    failed('derrumbe', 'Derrumbe', 'No lo lograste esta vez.'),
    failed('ascensor', 'Ascensor', 'No lo lograste esta vez.'),
    failed('piedras', 'Piedras', 'No lo lograste esta vez.'),
    failed('hoyo', 'Hoyo', 'No lo lograste esta vez.'),
    failed('luz', 'La luz', 'No lo lograste esta vez.'),
    failed('entrenamiento', 'Entrenamiento', 'No lo lograste esta vez.'),
    failed('enfermeria', 'Enfermería', 'No lo lograste esta vez.'),
    failed('escaleras-b', 'Escaleras', 'No lo lograste esta vez.'),
  ],
};
