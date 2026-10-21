import { TEAL, budgetFor, rand, type Effect, type Scale } from '../effectKit';

/** Naturaleza: partículas que siguen un campo de flujo y dejan estela, como corrientes de agua o viento. */
export default function create({ w, h, small }: Scale): Effect {
  const count = budgetFor('field', small);
  const particles = Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    life: rand(0, 1),
  }));
  let time = 0;
  const angle = (x: number, y: number) =>
    Math.sin(x * 0.006 + time * 0.25) * 2.2 + Math.cos(y * 0.008 - time * 0.2) * 2.2;
  return {
    count,
    trails: true,
    step(dt) {
      time += dt / 1000;
      for (const p of particles) {
        const a = angle(p.x, p.y);
        p.x += Math.cos(a) * 0.9;
        p.y += Math.sin(a) * 0.9;
        p.life += dt / 6000;
        if (p.life > 1 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
          p.x = rand(0, w);
          p.y = rand(0, h);
          p.life = 0;
        }
      }
    },
    draw(ctx) {
      // Borra un poco el cuadro anterior: lo que queda es la estela.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.045)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(${TEAL}, 0.9)`;
      for (const p of particles) ctx.fillRect(p.x, p.y, 2, 2);
    },
  };
}
