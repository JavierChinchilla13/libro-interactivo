import { LAVENDER, budgetFor, drift, nodes, rand, type Effect, type Scale } from '../effectKit';

/** Intelectual: estrellas que titilan y se unen con líneas finas; el puntero las atrae un poco. */
export default function create(scale: Scale): Effect {
  const list = nodes(budgetFor('constellation', scale.small), scale, 8);
  const phase = list.map(() => rand(0, Math.PI * 2));
  const reach = scale.small ? 90 : 115;
  let time = 0;
  let cursor: { x: number; y: number } | null = null;
  return {
    count: list.length,
    pointer(x, y) {
      cursor = x < 0 ? null : { x, y };
    },
    step(dt) {
      time += dt / 1000;
      drift(list, dt, scale);
      if (cursor) {
        for (const node of list) {
          const dx = cursor.x - node.x;
          const dy = cursor.y - node.y;
          const d = Math.hypot(dx, dy);
          if (d < 140 && d > 1) {
            node.x += (dx / d) * 0.25;
            node.y += (dy / d) * 0.25;
          }
        }
      }
    },
    draw(ctx) {
      ctx.lineWidth = 0.8;
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i]!;
          const b = list[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > reach) continue;
          ctx.strokeStyle = `rgba(${LAVENDER}, ${(1 - d / reach) * 0.6})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      list.forEach((node, index) => {
        const glow = 0.45 + 0.4 * Math.sin(time * 1.6 + (phase[index] ?? 0));
        ctx.fillStyle = `rgba(230, 236, 255, ${glow})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 1.4 + glow, 0, Math.PI * 2);
        ctx.fill();
      });
    },
  };
}
