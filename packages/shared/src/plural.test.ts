import { describe, expect, it } from 'vitest';
import { plural, pluralWord } from './plural.js';

describe('plural', () => {
  it('solo el 1 va en singular: 0, 1, 2 y números grandes', () => {
    expect(plural(0, 'lector', 'lectores')).toBe('0 lectores');
    expect(plural(1, 'lector', 'lectores')).toBe('1 lector');
    expect(plural(2, 'lector', 'lectores')).toBe('2 lectores');
    expect(plural(26347, 'día', 'días')).toBe('26347 días');
  });

  it('concuerda adjetivos y frases enteras, no solo sustantivos', () => {
    expect(plural(1, 'nuevo', 'nuevos')).toBe('1 nuevo');
    expect(plural(3, 'nuevo', 'nuevos')).toBe('3 nuevos');
    expect(plural(1, 'mensaje sin atender', 'mensajes sin atender')).toBe('1 mensaje sin atender');
  });

  it('pluralWord da solo la palabra, para concordar verbos y adjetivos de alrededor', () => {
    expect(`Lo ${pluralWord(1, 'recibiría', 'recibirían')} 1 lector`).toBe('Lo recibiría 1 lector');
    expect(`Lo ${pluralWord(4, 'recibiría', 'recibirían')} 4 lectores`).toBe(
      'Lo recibirían 4 lectores',
    );
  });

  it('acepta bigint y valores ausentes (cuentan como 0)', () => {
    expect(plural(1n, 'cosa', 'cosas')).toBe('1 cosa');
    expect(plural(undefined, 'cosa', 'cosas')).toBe('0 cosas');
    expect(plural(null, 'cosa', 'cosas')).toBe('0 cosas');
  });
});
