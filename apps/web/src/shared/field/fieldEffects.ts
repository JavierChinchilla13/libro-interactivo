import type { FieldVisualKey } from '@libro/shared';

/**
 * Fondos animados de los campos de poder: seis efectos de canvas 2D con código propio (sin librerías). Este módulo se
 * descarga bajo demanda, solo cuando un campo entra en pantalla. Cada efecto es una escena pequeña (`step` + `draw`);
 * el ejecutor se encarga de los fotogramas (máx. 30 por segundo), la resolución, el tope de partículas en el celular y
 * de pausar. Solo se dibuja sobre un lienzo transparente: el degradado de fondo lo pone el CSS.
 */

interface Effect {
  step(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  /** Posición del puntero dentro del lienzo (o `null` al salir). */
  pointer?(x: number, y: number): void;
  /** Si `true`, el lienzo no se borra entre fotogramas (deja estela). */
  trails?: boolean;
}

interface Scale {
  w: number;
  h: number;
  /** Celulares: menos partículas. */
  small: boolean;
}

const CYAN = '63, 216, 255';
const LAVENDER = '168, 155, 255';
const BLUE = '99, 150, 214';
const TEAL = '96, 226, 205';
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Agitación: lluvia de símbolos que cae por columnas, con la cabeza más clara. */
function rain({ w, h, small }: Scale): Effect {
  const cell = small ? 20 : 16;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const glyphs = '01ΣΔλπ∑ψ∞';
  const drops = Array.from({ length: cols }, () => ({
    y: rand(-rows, rows),
    speed: rand(5, 14),
    trail: Math.floor(rand(8, 18)),
  }));
  let clock = 0;
  return {
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

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const nodes = (count: number, { w, h }: Scale, speed: number): Node[] =>
  Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-speed, speed),
    vy: rand(-speed, speed),
  }));

const drift = (list: Node[], dt: number, { w, h }: Scale) => {
  for (const node of list) {
    node.x += (node.vx * dt) / 1000;
    node.y += (node.vy * dt) / 1000;
    if (node.x < 0 || node.x > w) node.vx *= -1;
    if (node.y < 0 || node.y > h) node.vy *= -1;
  }
};

/** Mente: una red de nodos por la que viajan impulsos de luz. */
function neural(scale: Scale): Effect {
  const list = nodes(scale.small ? 26 : 44, scale, 14);
  const reach = scale.small ? 120 : 150;
  const pulses: { from: number; to: number; t: number }[] = [];
  const near = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y) < reach;
  return {
    step(dt) {
      drift(list, dt, scale);
      if (pulses.length < (scale.small ? 8 : 16) && Math.random() < 0.12) {
        const from = Math.floor(Math.random() * list.length);
        const to = list.findIndex(
          (candidate, index) => index !== from && near(list[from]!, candidate),
        );
        if (to >= 0) pulses.push({ from, to, t: 0 });
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

/** Intelectual: estrellas que titilan y se unen con líneas finas; el puntero las atrae un poco. */
function constellation(scale: Scale): Effect {
  const list = nodes(scale.small ? 48 : 90, scale, 8);
  const phase = list.map(() => rand(0, Math.PI * 2));
  const reach = scale.small ? 90 : 115;
  let time = 0;
  let cursor: { x: number; y: number } | null = null;
  return {
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

/** Transformación: manchas de color que se desplazan y se funden entre sí. */
function gradient({ w, h }: Scale): Effect {
  const colors = [CYAN, LAVENDER, BLUE, TEAL];
  let time = 0;
  return {
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

/** Naturaleza: partículas que siguen un campo de flujo y dejan estela, como corrientes de agua o viento. */
function field({ w, h, small }: Scale): Effect {
  const count = small ? 260 : 520;
  const particles = Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    life: rand(0, 1),
  }));
  let time = 0;
  const angle = (x: number, y: number) =>
    Math.sin(x * 0.006 + time * 0.25) * 2.2 + Math.cos(y * 0.008 - time * 0.2) * 2.2;
  return {
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

/** Virtud: cintas de luz que ondulan; el resplandor se finge sumando trazos anchos y tenues bajo uno fino. */
function neon({ w, h }: Scale): Effect {
  let time = 0;
  const ribbons = [
    { color: LAVENDER, amp: 0.2, freq: 1.3, speed: 0.5, base: 0.42 },
    { color: CYAN, amp: 0.16, freq: 1.9, speed: -0.4, base: 0.55 },
    { color: '255, 255, 255', amp: 0.1, freq: 2.7, speed: 0.7, base: 0.5 },
  ];
  return {
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

const EFFECTS: Record<FieldVisualKey, (scale: Scale) => Effect> = {
  rain,
  neural,
  constellation,
  gradient,
  field,
  neon,
};

export interface MountedEffect {
  pause(): void;
  resume(): void;
  destroy(): void;
}

const FRAME_MS = 1000 / 30;

/**
 * Pone el efecto en el lienzo. Con `reduced` pinta un solo cuadro ya «avanzado» (imagen estática). Se pausa y se
 * reanuda desde fuera; `destroy` suelta todo. Tope de resolución: 1.25× en celulares y 1.75× en pantallas anchas.
 */
export function mountEffect(
  canvas: HTMLCanvasElement,
  key: FieldVisualKey,
  options: { reduced: boolean },
): MountedEffect {
  const context = canvas.getContext('2d');
  let effect: Effect | null = null;
  let frame = 0;
  let last = 0;
  let running = false;
  let resizeTimer = 0;

  const build = () => {
    if (!context) return;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const small = w < 640;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, w, h);
    effect = EFFECTS[key]({ w, h, small });
    if (options.reduced) {
      for (let i = 0; i < 90; i += 1) {
        effect.step(FRAME_MS);
        if (effect.trails || i === 89) effect.draw(context);
      }
    }
  };

  const tick = (now: number) => {
    if (!running || !effect || !context) return;
    frame = requestAnimationFrame(tick);
    const dt = now - last;
    if (dt < FRAME_MS) return;
    last = now;
    effect.step(Math.min(dt, 100));
    if (!effect.trails) context.clearRect(0, 0, canvas.width, canvas.height);
    effect.draw(context);
  };

  const onMove = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    effect?.pointer?.(event.clientX - box.left, event.clientY - box.top);
  };
  const onLeave = () => effect?.pointer?.(-1, -1);
  const observer = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 150);
  });

  build();
  if (!options.reduced) {
    observer.observe(canvas);
    canvas.parentElement?.addEventListener('pointermove', onMove, { passive: true });
    canvas.parentElement?.addEventListener('pointerleave', onLeave, { passive: true });
  }
  const parent = canvas.parentElement;

  return {
    pause() {
      running = false;
      cancelAnimationFrame(frame);
    },
    resume() {
      if (running || options.reduced) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    },
    destroy() {
      running = false;
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      parent?.removeEventListener('pointermove', onMove);
      parent?.removeEventListener('pointerleave', onLeave);
    },
  };
}
