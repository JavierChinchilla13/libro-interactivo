import { describe, expect, it } from 'vitest';
import { ageBand, ageFromBirth, checkBirth, expectedDeclaration } from './age.js';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('ageFromBirth (conservadora: cumple al terminar su mes de nacimiento)', () => {
  it('nacida en 03/2010: 15 durante todo marzo de 2026 y 16 desde abril', () => {
    const birth = { year: 2010, month: 3 };
    expect(ageFromBirth(birth, at('2026-03-01'))).toBe(15);
    expect(ageFromBirth(birth, at('2026-03-31'))).toBe(15);
    expect(ageFromBirth(birth, at('2026-04-01'))).toBe(16);
    expect(ageFromBirth(birth, at('2027-03-31'))).toBe(16);
    expect(ageFromBirth(birth, at('2027-04-01'))).toBe(17);
  });

  it('cambio de año: nacida en diciembre cuenta un año menos hasta que termina diciembre', () => {
    const birth = { year: 2008, month: 12 };
    expect(ageFromBirth(birth, at('2026-12-31'))).toBe(17);
    expect(ageFromBirth(birth, at('2027-01-01'))).toBe(18);
  });

  it('el mes de nacimiento todavía no cuenta el año; el siguiente sí', () => {
    expect(ageFromBirth({ year: 2000, month: 1 }, at('2026-01-15'))).toBe(25);
    expect(ageFromBirth({ year: 2000, month: 1 }, at('2026-02-01'))).toBe(26);
  });
});

describe('checkBirth', () => {
  const now = at('2026-10-28');

  it('acepta un pasado normal y el mes actual (todavía sin cumplir nada)', () => {
    expect(checkBirth({ year: 1990, month: 6 }, now)).toEqual({ valid: true, age: 36 });
    expect(checkBirth({ year: 2026, month: 10 }, now)).toEqual({ valid: true, age: -1 });
  });

  it('rechaza fechas futuras, incluido el mes que viene', () => {
    expect(checkBirth({ year: 2026, month: 11 }, now).valid).toBe(false);
    expect(checkBirth({ year: 2027, month: 1 }, now).valid).toBe(false);
  });

  it('rechaza mes 0 o 13 y valores que no son enteros', () => {
    expect(checkBirth({ year: 1990, month: 0 }, now).valid).toBe(false);
    expect(checkBirth({ year: 1990, month: 13 }, now).valid).toBe(false);
    expect(checkBirth({ year: 1990.5, month: 6 }, now).valid).toBe(false);
    expect(checkBirth({ year: 1990, month: Number.NaN }, now).valid).toBe(false);
  });

  it('rechaza más de 120 años y acepta justo 120', () => {
    expect(checkBirth({ year: 1900, month: 1 }, now).valid).toBe(false);
    expect(checkBirth({ year: 1906, month: 10 }, now)).toEqual({ valid: true, age: 119 });
    expect(checkBirth({ year: 1905, month: 10 }, now)).toEqual({ valid: true, age: 120 });
    expect(checkBirth({ year: 1905, month: 9 }, now)).toEqual({ valid: false });
  });
});

describe('ageBand y la declaración esperada', () => {
  it('15 no puede; 16 y 17 con autorización; 18 en adelante adulta', () => {
    expect(ageBand(15)).toBe('under');
    expect(ageBand(0)).toBe('under');
    expect(ageBand(16)).toBe('minor');
    expect(ageBand(17)).toBe('minor');
    expect(ageBand(18)).toBe('adult');
    expect(expectedDeclaration('minor')).toBe('minor_with_guardian');
    expect(expectedDeclaration('adult')).toBe('adult');
  });
});
