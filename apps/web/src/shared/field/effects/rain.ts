import { CYAN, budgetFor, rand, type Effect, type Scale } from '../effectKit';

/** Agitación: lluvia de símbolos que cae por columnas, con la cabeza más clara. */
export default function create({ w, h, small }: Scale): Effect {
  const cell = small ? 20 : 16;
  const budget = budgetFor('rain', small);
  // Columnas y cola se reparten el tope: columnas × cola máxima nunca pasa de `budget` símbolos.
  const cols = Math.min(Math.ceil(w / cell), Math.floor(budget / 4));
  const maxTrail = Math.max(4, Math.min(18, Math.floor(budget / cols)));
  const rows = Math.ceil(h / cell);
  const glyphs = '01ΣΔλπ∑ψ∞';
  const drops = Array.from({ length: cols }, () => ({
    y: rand(-rows, rows),
    speed: rand(5, 14),
    trail: Math.max(4, Math.floor(maxTrail * rand(0.6, 1))),
  }));
  let clock = 0;
  return {
    count: cols * maxTrail,
    step(dt) {
      clock += dt;
      for (const drop of drops) {
        drop.y += (drop.speed * dt) / 1000;
        if (drop.y - drop.trail > rows) {
          drop.y = rand(-8, 0);
          drop.speed = rand(5, 14);
        }
      }
    },
    draw(ctx) {
      ctx.font = `${cell - 2}px ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      drops.forEach((drop, col) => {
        for (let k = 0; k < drop.trail; k += 1) {
          const row = Math.floor(drop.y) - k;
          if (row < 0 || row > rows) continue;
          const glyph =
            glyphs[(col * 31 + row * 17 + Math.floor(clock / 260)) % glyphs.length] ?? '0';
          ctx.fillStyle =
            k === 0 ? 'rgba(216, 246, 255, 0.95)' : `rgba(${CYAN}, ${(1 - k / drop.trail) * 0.7})`;
          ctx.fillText(glyph, col * cell, row * cell);
        }
      });
    },
  };
}
