import type { Ending, PublicScene, Scene, SceneChoice, Story } from './types.js';

/** Índice de escenas por id (se calcula una vez por historia). */
export function indexScenes(story: Story): Map<string, Scene> {
  return new Map(story.scenes.map((scene) => [scene.id, scene]));
}

/**
 * Vista pública de una escena: nunca incluye a dónde lleva cada decisión (el cliente no debe poder deducir cuál
 * es mortal). Si la escena es un final, trae el final (título y texto).
 */
export function toPublicScene(story: Story, scene: Scene): PublicScene {
  const ending: Ending | undefined =
    scene.endingKey === undefined
      ? undefined
      : story.endings.find((candidate) => candidate.key === scene.endingKey);
  return {
    id: scene.id,
    ...(scene.title !== undefined ? { title: scene.title } : {}),
    background: scene.background,
    layers: scene.layers,
    text: scene.text,
    choices: scene.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      ...(choice.hotspot ? { hotspot: choice.hotspot } : {}),
    })),
    ...(ending
      ? { ending: { key: ending.key, kind: ending.kind, title: ending.title, text: ending.text } }
      : {}),
  };
}

export type Transition =
  | { ok: true; scene: Scene; ending?: Ending }
  | { ok: false; reason: 'UNKNOWN_SCENE' | 'UNKNOWN_CHOICE' | 'ALREADY_ENDED' };

/**
 * Aplica una decisión desde la escena actual. Es lo único que el servidor necesita para avanzar:
 * `UNKNOWN_CHOICE` si la decisión no pertenece a esa escena (nadie elige en una escena que no es la suya).
 */
export function applyChoice(story: Story, currentSceneId: string, choiceId: string): Transition {
  const scenes = indexScenes(story);
  const current = scenes.get(currentSceneId);
  if (!current) return { ok: false, reason: 'UNKNOWN_SCENE' };
  if (current.endingKey !== undefined) return { ok: false, reason: 'ALREADY_ENDED' };
  const choice: SceneChoice | undefined = current.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'UNKNOWN_CHOICE' };
  const next = scenes.get(choice.nextSceneId);
  if (!next) return { ok: false, reason: 'UNKNOWN_SCENE' };
  const ending =
    next.endingKey === undefined
      ? undefined
      : story.endings.find((candidate) => candidate.key === next.endingKey);
  return { ok: true, scene: next, ...(ending ? { ending } : {}) };
}

/** Escena inicial. */
export function startScene(story: Story): Scene {
  const scene = indexScenes(story).get(story.startSceneId);
  if (!scene) throw new Error(`La escena inicial no existe: ${story.startSceneId}`);
  return scene;
}

/** Todos los caminos (listas de decisiones) desde el inicio hasta un final; sirve para probar la historia entera. */
export function allPaths(story: Story): { choices: string[]; endingKey: string }[] {
  const scenes = indexScenes(story);
  const out: { choices: string[]; endingKey: string }[] = [];
  const walk = (sceneId: string, taken: string[], seen: ReadonlySet<string>) => {
    const scene = scenes.get(sceneId);
    if (!scene || seen.has(sceneId)) return;
    if (scene.endingKey !== undefined) {
      out.push({ choices: taken, endingKey: scene.endingKey });
      return;
    }
    const nextSeen = new Set(seen).add(sceneId);
    for (const choice of scene.choices) walk(choice.nextSceneId, [...taken, choice.id], nextSeen);
  };
  walk(story.startSceneId, [], new Set());
  return out;
}
