import type { RandomInt } from '../services/quiz-engine.js';

/** Generador pseudoaleatorio con semilla (mulberry32): mismas semillas, mismas secuencias. */
export function seededRandom(seed: number): RandomInt {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (maxExclusive) => Math.floor(next() * maxExclusive);
}
