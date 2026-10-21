import { BLUE, CYAN, LAVENDER, TEAL, type Effect, type Scale } from '../effectKit';

/** Transformación: manchas de color que se desplazan y se funden entre sí. */
export default function create({ w, h }: Scale): Effect {
  const colors = [CYAN, LAVENDER, BLUE, TEAL];
  let time = 0;
  return {
    count: colors.length,
    step(dt) {
      time += dt / 1000;
    },
    draw(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      colors.forEach((color, index) => {
        const x = w * (0.5 + 0.38 * Math.sin(time * (0.35 + index * 0.11) + index * 1.7));
        const y = h * (0.5 + 0.38 * Math.cos(time * (0.29 + index * 0.13) + index * 2.3));
        const r = Math.max(w, h) * (0.45 + 0.08 * Math.sin(time * 0.5 + index));
        const fill = ctx.createRadialGradient(x, y, 0, x, y, r);
        fill.addColorStop(0, `rgba(${color}, 0.38)`);
        fill.addColorStop(1, `rgba(${color}, 0)`);
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
