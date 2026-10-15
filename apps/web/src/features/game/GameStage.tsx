import type { PublicGameScene } from '@libro/shared';
import { useState, type CSSProperties } from 'react';
import { thumbUrl } from '../../shared/lib/cloudinary';

type Layer = PublicGameScene['layers'][number];

const SHAPE_CLASS = {
  circle: 'game-shape-circle',
  rect: 'game-shape-rect',
  triangle: 'game-shape-triangle',
};

/** Una capa: el contenedor se posiciona (x, y, ancho en %) y la figura interior es la que se anima (transform). */
function SceneLayerView({ layer }: { layer: Layer }) {
  const animation = layer.animation;
  const style: CSSProperties = {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    zIndex: layer.zIndex ?? 0,
  };
  const motion: CSSProperties | undefined = animation
    ? ({
        '--game-duration': `${animation.durationMs ?? 5000}ms`,
        '--game-delay': `${animation.delayMs ?? 0}ms`,
      } as CSSProperties)
    : undefined;
  return (
    <div aria-hidden="true" className="game-layer" style={style}>
      <div
        className={animation ? `game-anim game-anim-${animation.type}` : undefined}
        style={motion}
      >
        {layer.kind === 'image' ? (
          <img
            src={thumbUrl(layer.image.url, 960)}
            alt=""
            width={layer.image.width}
            height={layer.image.height}
            draggable={false}
            className="block h-auto w-full select-none"
          />
        ) : (
          <div
            className={SHAPE_CLASS[layer.shape]}
            style={{ background: layer.color, aspectRatio: String(layer.aspect ?? 1) }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * El escenario de una escena: fondo, capas ilustradas (con animación solo de transform/opacity) y zonas clicables en
 * % del escenario. Las zonas son un atajo para ratón y táctil; los botones de respaldo (debajo) siempre existen, así
 * que teclado y lectores de pantalla nunca dependen de ellas.
 */
export function GameStage({
  scene,
  disabled,
  onChoose,
}: {
  scene: PublicGameScene;
  disabled: boolean;
  onChoose: (choiceId: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const background: CSSProperties =
    scene.background.type === 'color'
      ? { background: scene.background.color }
      : {
          backgroundImage: `url(${thumbUrl(scene.background.image.url, 1280)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };
  return (
    <div
      key={scene.id}
      className="game-stage game-scene-in"
      style={background}
      role="img"
      aria-label={scene.title ?? 'Escena del juego'}
    >
      {scene.layers.map((layer) => (
        <SceneLayerView key={layer.id} layer={layer} />
      ))}
      {scene.choices.map((choice) =>
        choice.hotspot ? (
          <button
            key={choice.id}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            className="game-hotspot"
            style={{
              left: `${choice.hotspot.x}%`,
              top: `${choice.hotspot.y}%`,
              width: `${choice.hotspot.w}%`,
              height: `${choice.hotspot.h}%`,
            }}
            onClick={() => onChoose(choice.id)}
            onPointerEnter={() => setHovered(choice.id)}
            onPointerLeave={() => setHovered((current) => (current === choice.id ? null : current))}
          >
            <span className="game-hotspot-label" data-visible={hovered === choice.id || undefined}>
              {choice.label}
            </span>
          </button>
        ) : null,
      )}
      <div aria-hidden="true" className="game-safe-zone" />
    </div>
  );
}
