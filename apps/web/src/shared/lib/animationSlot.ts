/**
 * Un solo elemento animado de fondo a la vez en toda la página (lienzo de un campo de poder, video de fondo o video del
 * resultado): al arrancar uno, el que corría se detiene. Los que se detienen así no se reanudan solos.
 */
export interface AnimationRunner {
  pause(): void;
}

let active: AnimationRunner | null = null;

/** Pasa a correr `runner`; el anterior, si había otro, se pausa. */
export function claimAnimation(runner: AnimationRunner): void {
  if (active && active !== runner) active.pause();
  active = runner;
}

/** Libera el lugar si lo tenía `runner` (al pausarse, salir de pantalla o desmontarse). */
export function releaseAnimation(runner: AnimationRunner): void {
  if (active === runner) active = null;
}
