import { CYAN, LAVENDER, type Effect, type Scale } from '../effectKit';

/** Virtud: cintas de luz que ondulan; el resplandor se finge sumando trazos anchos y tenues bajo uno fino. */
export default function create({ w, h }: Scale): Effect {
  let time = 0;
  const ribbons = [
    { color: LAVENDER, amp: 0.2, freq: 1.3, speed: 0.5, base: 0.42 },
    { color: CYAN, amp: 0.16, freq: 1.9, speed: -0.4, base: 0.55 },
    { color: '255, 255, 255', amp: 0.1, freq: 2.7, speed: 0.7, base: 0.5 },
  ];
  return {
    count: ribbons.length,
    step(dt) {
      time += dt / 1000;
    },
    draw(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const ribbon of ribbons) {
        const path = new Path2D();
        for (let x = 0; x <= w; x += 8) {
          const y =
            h * ribbon.base +
            Math.sin((x / w) * Math.PI * 2 * ribbon.freq + time * ribbon.speed) * h * ribbon.amp;
          if (x === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
        for (const [width, alpha] of [
          [14, 0.05],
          [6, 0.1],
          [1.6, 0.85],
        ] as const) {
          ctx.lineWidth = width;
          ctx.strokeStyle = `rgba(${ribbon.color}, ${alpha})`;
          ctx.stroke(path);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
