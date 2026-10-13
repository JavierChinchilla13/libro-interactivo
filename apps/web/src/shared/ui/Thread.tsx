/**
 * El hilo: un trazo que une los puntos de la progresión (Quiz 1 → … → Juego → Extras). Un punto encendido es lo que
 * ya se abrió; uno apagado, lo que falta. Es un dibujo de estado, no una decoración: quien lo use debe acompañarlo de
 * texto («Disponible», «Bloqueado»), porque el SVG es `aria-hidden`.
 *
 * Todo el color sale de tokens (`lit`, `unlit`, `surface`), así que el tema por libro lo recolorea.
 */
type Point = readonly [number, number];
type Orientation = 'vertical' | 'horizontal';

const BOX: Record<Orientation, { width: number; height: number }> = {
  vertical: { width: 360, height: 520 },
  horizontal: { width: 560, height: 110 },
};

/** Posición de los puntos y del trazo que pasa por ellos (con un tramo de entrada y otro de salida fuera del cuadro). */
function layout(orientation: Orientation, count: number) {
  const { width, height } = BOX[orientation];
  const nodes: Point[] = Array.from({ length: count }, (_, index): Point => {
    const t = index / (count - 1);
    return orientation === 'vertical'
      ? [index % 2 === 0 ? 245 : 120, 40 + t * (height - 80)]
      : [30 + t * (width - 60), index % 2 === 0 ? 36 : 76];
  });
  const first = nodes[0] as Point;
  const last = nodes[count - 1] as Point;
  const through: Point[] =
    orientation === 'vertical'
      ? [[first[0] + 50, -40], ...nodes, [last[0] - 40, height + 40]]
      : [[-30, first[1] + 20], ...nodes, [width + 30, last[1] - 20]];

  // Catmull-Rom → Bézier cúbica: una curva suave que pasa exactamente por cada punto.
  let path = `M ${through[0]?.[0]} ${through[0]?.[1]}`;
  for (let i = 0; i < through.length - 1; i += 1) {
    const p0 = through[Math.max(0, i - 1)] as Point;
    const p1 = through[i] as Point;
    const p2 = through[i + 1] as Point;
    const p3 = through[Math.min(through.length - 1, i + 2)] as Point;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }

  // Fracción del trazo (0–1) en la que cae cada punto, por longitud acumulada de las cuerdas.
  const lengths: number[] = [0];
  for (let i = 1; i < through.length; i += 1) {
    const a = through[i - 1] as Point;
    const b = through[i] as Point;
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[lengths.length - 1] || 1;
  const fractions = nodes.map((_, index) => (lengths[index + 1] ?? 0) / total);
  return { nodes, path, fractions };
}

export function Thread({
  nodes = 5,
  litCount = 1,
  lead = 0.05,
  orientation = 'vertical',
  animated = false,
  className = '',
}: {
  /** Cuántos puntos tiene el hilo (mínimo 2). */
  nodes?: number;
  /** Cuántos puntos, contados desde el principio, están encendidos. */
  litCount?: number;
  /** Cuánta luz «va en camino» más allá del último punto encendido (fracción del trazo). */
  lead?: number;
  orientation?: Orientation;
  /** Dibuja el hilo y enciende el primer punto una sola vez al aparecer. Con «reducir movimiento» queda estático. */
  animated?: boolean;
  className?: string;
}) {
  const count = Math.max(2, Math.round(nodes));
  const lit = Math.min(count, Math.max(0, Math.round(litCount)));
  const { width, height } = BOX[orientation];
  const { nodes: points, path, fractions } = layout(orientation, count);
  const litEnd = lit === 0 ? 0 : Math.min(1, (fractions[lit - 1] ?? 0) + (lit < count ? lead : 0));
  const firstLit = lit > 0 ? (points[0] as Point) : undefined;

  return (
    <div
      aria-hidden="true"
      data-thread={orientation}
      className={`relative ${animated ? 'thread-animated' : ''} ${className}`}
    >
      {firstLit ? (
        /* Charco de luz bajo el primer punto encendido: estático, sin desenfoque. */
        <div
          className="pointer-events-none absolute aspect-square w-3/5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${(firstLit[0] / width) * 100}%`,
            top: `${(firstLit[1] / height) * 100}%`,
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--token-lit) 16%, transparent), transparent 68%)',
          }}
        />
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="relative block h-auto w-full overflow-visible"
        fill="none"
      >
        <path
          d={path}
          pathLength={1}
          strokeWidth={1.5}
          strokeLinecap="round"
          className="thread-base stroke-unlit/50"
        />
        {litEnd > 0 ? (
          <path
            d={path}
            pathLength={1}
            strokeWidth={2}
            strokeLinecap="round"
            className="thread-lit stroke-lit"
            style={{
              strokeDasharray: `${litEnd.toFixed(4)} 1`,
              ['--thread-lit' as string]: litEnd.toFixed(4),
            }}
          />
        ) : null}
        {points.map(([x, y], index) => {
          const isLit = index < lit;
          return (
            <g
              key={index}
              data-node=""
              data-state={isLit ? 'lit' : 'unlit'}
              className="thread-node"
              style={{ animationDelay: `${150 + index * 120}ms` }}
            >
              <circle cx={x} cy={y} r={6} strokeWidth={1.5} className="fill-surface stroke-unlit" />
              {isLit ? (
                <>
                  <circle cx={x} cy={y} r={14} strokeWidth={1} className="stroke-lit/40" />
                  <circle cx={x} cy={y} r={6} className="thread-ignite fill-lit" />
                  {index === 0 ? (
                    <circle
                      cx={x}
                      cy={y}
                      r={14}
                      strokeWidth={1.5}
                      className="thread-bloom stroke-lit"
                    />
                  ) : null}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
