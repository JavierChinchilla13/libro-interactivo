import {
  BLUE,
  CYAN,
  LAVENDER,
  budgetFor,
  drift,
  nodes,
  type Effect,
  type Node,
  type Scale,
} from '../effectKit';

/** Mente: una red de nodos por la que viajan impulsos de luz. */
export default function create(scale: Scale): Effect {
  const list = nodes(budgetFor('neural', scale.small), scale, 14);
  const reach = scale.small ? 120 : 150;
  const pulses: { from: number; to: number; t: number }[] = [];
  const near = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y) < reach;
  return {
    count: list.length,
    step(dt) {
      drift(list, dt, scale);
      if (pulses.length < (scale.small ? 8 : 16) && Math.random() < 0.12) {
        const from = Math.floor(Math.random() * list.length);
        const neighbours = list.flatMap((candidate, index) =>
          index !== from && near(list[from]!, candidate) ? [index] : [],
        );
        const to = neighbours[Math.floor(Math.random() * neighbours.length)];
        if (to !== undefined) pulses.push({ from, to, t: 0 });
      }
      for (const pulse of pulses) pulse.t += dt / 700;
      for (let i = pulses.length - 1; i >= 0; i -= 1) if (pulses[i]!.t >= 1) pulses.splice(i, 1);
    },
    draw(ctx) {
      ctx.lineWidth = 1;
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i]!;
          const b = list[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > reach) continue;
          ctx.strokeStyle = `rgba(${BLUE}, ${(1 - d / reach) * 0.7})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = `rgba(${CYAN}, 0.85)`;
      for (const node of list) ctx.fillRect(node.x - 1.5, node.y - 1.5, 3, 3);
      ctx.fillStyle = `rgba(${LAVENDER}, 0.95)`;
      for (const pulse of pulses) {
        const a = list[pulse.from]!;
        const b = list[pulse.to]!;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * pulse.t, a.y + (b.y - a.y) * pulse.t, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
