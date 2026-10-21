import type { FieldVisualKey } from '@libro/shared';

/** Piezas compartidas de los efectos de los campos de poder (tipos, colores, topes y ayudas de nodos). */

export interface Effect {
  /** Cuántos elementos (partículas, nodos o símbolos) dibuja como máximo: nunca pasa de su tope. */
  readonly count: number;
  step(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  /** Posición del puntero dentro del lienzo (o `null` al salir). */
  pointer?(x: number, y: number): void;
  /** Si `true`, el lienzo no se borra entre fotogramas (deja estela). */
  trails?: boolean;
}

export interface Scale {
  w: number;
  h: number;
  /** Celulares: menos partículas. */
  small: boolean;
}

/**
 * Tope de elementos por efecto. En el celular (lienzo de menos de 640 px) se mantiene en el rango del plan (60 a 120);
 * en pantallas anchas hay más, pero ese valor nunca se usa en el celular.
 */
export const PARTICLE_BUDGET: Record<FieldVisualKey, { small: number; large: number }> = {
  rain: { small: 120, large: 700 },
  neural: { small: 60, large: 70 },
  constellation: { small: 80, large: 90 },
  gradient: { small: 4, large: 4 },
  field: { small: 120, large: 520 },
  neon: { small: 3, large: 3 },
};
export const budgetFor = (key: FieldVisualKey, small: boolean) =>
  PARTICLE_BUDGET[key][small ? 'small' : 'large'];

export const CYAN = '63, 216, 255';
export const LAVENDER = '168, 155, 255';
export const BLUE = '99, 150, 214';
export const TEAL = '96, 226, 205';
export const rand = (min: number, max: number) => min + Math.random() * (max - min);

export interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const nodes = (count: number, { w, h }: Scale, speed: number): Node[] =>
  Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-speed, speed),
    vy: rand(-speed, speed),
  }));

export const drift = (list: Node[], dt: number, { w, h }: Scale) => {
  for (const node of list) {
    node.x += (node.vx * dt) / 1000;
    node.y += (node.vy * dt) / 1000;
    if (node.x < 0 || node.x > w) node.vx *= -1;
    if (node.y < 0 || node.y > h) node.vy *= -1;
  }
};
