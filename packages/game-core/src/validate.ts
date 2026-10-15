import { LAYER_ANIMATIONS, type Story } from './types.js';

export interface ValidationIssue {
  code:
    | 'EMPTY_STORY'
    | 'DUPLICATE_SCENE'
    | 'MISSING_START'
    | 'MISSING_TARGET'
    | 'DUPLICATE_CHOICE'
    | 'DEAD_END'
    | 'ENDING_WITH_CHOICES'
    | 'UNKNOWN_ENDING'
    | 'DUPLICATE_ENDING'
    | 'UNREACHABLE'
    | 'NO_COMPLETED_ENDING'
    | 'UNWINNABLE'
    | 'BAD_GEOMETRY'
    | 'BAD_ANIMATION';
  message: string;
  sceneId?: string;
}

const inPercent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

/**
 * Valida el grafo de una historia. Devuelve la lista de problemas (vacía = válida):
 * inicio y destinos existentes, sin callejones sin final, sin escenas inalcanzables, finales coherentes, al menos
 * un final `completed` alcanzable y que toda escena pueda terminar (sin ciclos cerrados).
 */
export function validateStory(story: Story): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (issue: ValidationIssue) => issues.push(issue);

  if (story.scenes.length === 0) {
    return [{ code: 'EMPTY_STORY', message: 'La historia no tiene escenas' }];
  }
  const byId = new Map<string, (typeof story.scenes)[number]>();
  for (const scene of story.scenes) {
    if (byId.has(scene.id)) {
      add({ code: 'DUPLICATE_SCENE', message: `Escena repetida: ${scene.id}`, sceneId: scene.id });
    }
    byId.set(scene.id, scene);
  }
  const endings = new Map<string, (typeof story.endings)[number]>();
  for (const ending of story.endings) {
    if (endings.has(ending.key)) {
      add({ code: 'DUPLICATE_ENDING', message: `Final repetido: ${ending.key}` });
    }
    endings.set(ending.key, ending);
  }
  if (!byId.has(story.startSceneId)) {
    add({ code: 'MISSING_START', message: `La escena inicial no existe: ${story.startSceneId}` });
  }

  for (const scene of story.scenes) {
    const choiceIds = new Set<string>();
    for (const choice of scene.choices) {
      if (choiceIds.has(choice.id)) {
        add({
          code: 'DUPLICATE_CHOICE',
          message: `Decisión repetida ${choice.id} en ${scene.id}`,
          sceneId: scene.id,
        });
      }
      choiceIds.add(choice.id);
      if (!byId.has(choice.nextSceneId)) {
        add({
          code: 'MISSING_TARGET',
          message: `La decisión ${choice.id} de ${scene.id} apunta a una escena inexistente`,
          sceneId: scene.id,
        });
      }
      const spot = choice.hotspot;
      if (
        spot &&
        !(
          inPercent(spot.x) &&
          inPercent(spot.y) &&
          spot.w > 0 &&
          spot.h > 0 &&
          spot.x + spot.w <= 100.0001 &&
          spot.y + spot.h <= 100.0001
        )
      ) {
        add({
          code: 'BAD_GEOMETRY',
          message: `Zona clicable fuera del escenario en ${scene.id}/${choice.id}`,
          sceneId: scene.id,
        });
      }
    }
    for (const layer of scene.layers) {
      if (!inPercent(layer.x) || !inPercent(layer.y) || !(layer.width > 0 && layer.width <= 200)) {
        add({
          code: 'BAD_GEOMETRY',
          message: `Capa ${layer.id} con posición o tamaño inválidos en ${scene.id}`,
          sceneId: scene.id,
        });
      }
      if (layer.animation && !LAYER_ANIMATIONS.includes(layer.animation.type)) {
        add({
          code: 'BAD_ANIMATION',
          message: `Animación desconocida en la capa ${layer.id} de ${scene.id}`,
          sceneId: scene.id,
        });
      }
    }
    if (scene.endingKey !== undefined) {
      if (!endings.has(scene.endingKey)) {
        add({
          code: 'UNKNOWN_ENDING',
          message: `El final ${scene.endingKey} de ${scene.id} no está declarado`,
          sceneId: scene.id,
        });
      }
      if (scene.choices.length > 0) {
        add({
          code: 'ENDING_WITH_CHOICES',
          message: `La escena final ${scene.id} no puede tener decisiones`,
          sceneId: scene.id,
        });
      }
    } else if (scene.choices.length === 0) {
      add({
        code: 'DEAD_END',
        message: `La escena ${scene.id} no tiene decisiones ni es un final`,
        sceneId: scene.id,
      });
    }
  }

  // Alcanzabilidad desde el inicio.
  const reached = new Set<string>();
  const stack = byId.has(story.startSceneId) ? [story.startSceneId] : [];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const choice of byId.get(id)?.choices ?? []) {
      if (byId.has(choice.nextSceneId)) stack.push(choice.nextSceneId);
    }
  }
  for (const scene of story.scenes) {
    if (!reached.has(scene.id)) {
      add({
        code: 'UNREACHABLE',
        message: `La escena ${scene.id} no se puede alcanzar desde el inicio`,
        sceneId: scene.id,
      });
    }
  }

  // Todo final `completed` o `failed` debe existir; al menos un `completed` alcanzable.
  const completedReached = story.scenes.some(
    (scene) =>
      scene.endingKey !== undefined &&
      endings.get(scene.endingKey)?.kind === 'completed' &&
      reached.has(scene.id),
  );
  if (!completedReached) {
    add({ code: 'NO_COMPLETED_ENDING', message: 'Ningún final «completed» es alcanzable' });
  }

  // Toda escena alcanzable debe poder llegar a algún final (sin ciclos cerrados).
  const canFinish = new Set<string>(
    story.scenes.filter((scene) => scene.endingKey !== undefined).map((scene) => scene.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const scene of story.scenes) {
      if (canFinish.has(scene.id)) continue;
      if (scene.choices.some((choice) => canFinish.has(choice.nextSceneId))) {
        canFinish.add(scene.id);
        changed = true;
      }
    }
  }
  for (const scene of story.scenes) {
    if (reached.has(scene.id) && !canFinish.has(scene.id)) {
      add({
        code: 'UNWINNABLE',
        message: `Desde ${scene.id} no se puede llegar a ningún final`,
        sceneId: scene.id,
      });
    }
  }
  return issues;
}

/** Lanza si la historia no es válida (para el seed y las pruebas). */
export function assertValidStory(story: Story): void {
  const issues = validateStory(story);
  if (issues.length > 0) {
    throw new Error(
      `Historia inválida:\n${issues.map((issue) => `- [${issue.code}] ${issue.message}`).join('\n')}`,
    );
  }
}
