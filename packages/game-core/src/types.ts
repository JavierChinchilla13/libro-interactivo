/**
 * Tipos del juego (Nivel A: aventura ilustrada). La historia es un grafo de escenas; el servidor entrega una a la vez y
 * es la única autoridad sobre las transiciones. Este paquete es TypeScript puro: no depende de nada.
 */

/** Referencia a una imagen ya subida (Cloudinary). Las ilustraciones reales llegan con el arte de la autora. */
export interface GameImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

/** Fondo de una escena: solo color o imagen (nunca video). */
export type SceneBackground =
  { type: 'color'; color: string } | { type: 'image'; image: GameImage };

/** Animaciones permitidas para una capa: solo `transform` y `opacity` (se apagan con «reducir movimiento»). */
export const LAYER_ANIMATIONS = ['float', 'drift', 'pulse', 'rise', 'sway'] as const;
export type LayerAnimation = (typeof LAYER_ANIMATIONS)[number];

/** Capa ilustrada sobre el fondo. Posición y tamaño en % del escenario (el centro de la capa está en x,y). */
export type SceneLayer = {
  id: string;
  x: number;
  y: number;
  /** Ancho en % del escenario (alto proporcional a la imagen). */
  width: number;
  zIndex?: number;
  animation?: { type: LayerAnimation; durationMs?: number; delayMs?: number };
} & (
  | { kind: 'image'; image: GameImage }
  /** Silueta de color para escenas sin arte todavía: ilustración original de prueba, sin derechos de terceros. */
  | { kind: 'shape'; shape: 'circle' | 'rect' | 'triangle'; color: string; aspect?: number }
);

/** Zona clicable (en % del escenario). Siempre hay además un botón de respaldo con la misma etiqueta. */
export interface Hotspot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneChoice {
  id: string;
  label: string;
  hotspot?: Hotspot;
  /** A dónde lleva. Nunca sale del servidor: el cliente no debe poder deducir cuál decisión es mortal. */
  nextSceneId: string;
}

export interface Scene {
  id: string;
  title?: string;
  background: SceneBackground;
  layers: SceneLayer[];
  text: string;
  /** Vacío solo en escenas finales (`endingKey`). */
  choices: SceneChoice[];
  /** Si la escena es un final, la clave del final. */
  endingKey?: string;
}

export type EndingKind = 'completed' | 'failed';

export interface Ending {
  key: string;
  kind: EndingKind;
  title: string;
  text: string;
}

export interface Story {
  title: string;
  startSceneId: string;
  scenes: Scene[];
  endings: Ending[];
}

/** Lo que ve el cliente de una escena: sin destinos de las decisiones. */
export interface PublicChoice {
  id: string;
  label: string;
  hotspot?: Hotspot;
}

export interface PublicScene {
  id: string;
  title?: string;
  background: SceneBackground;
  layers: SceneLayer[];
  text: string;
  choices: PublicChoice[];
  /** Presente solo en una escena final. */
  ending?: { key: string; kind: EndingKind; title: string; text: string };
}
