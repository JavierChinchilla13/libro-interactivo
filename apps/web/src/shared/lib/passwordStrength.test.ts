import { describe, expect, it } from 'vitest';
import { passwordStrength } from './passwordStrength';

describe('passwordStrength', () => {
  it('vacía no marca nada', () => {
    expect(passwordStrength('')).toEqual({ level: 0, label: '', problems: [] });
  });

  it('una contraseña que incumple las reglas es nivel 1 y lista los mismos mensajes que el servidor', () => {
    expect(passwordStrength('corta').problems).toEqual([
      'La contraseña debe tener al menos 10 caracteres.',
    ]);
    expect(passwordStrength('password123')).toMatchObject({
      level: 1,
      problems: ['Esa contraseña es demasiado común. Elige otra.'],
    });
    expect(passwordStrength('aaaaaaaaaaaa').problems.join(' ')).toMatch(/demasiado simple/);
  });

  it('no deja usar el nombre ni el correo', () => {
    const result = passwordStrength('Valentina-2026-xx', { name: 'Valentina' });
    expect(result.level).toBe(1);
    expect(result.problems[0]).toMatch(/nombre ni tu correo/);
  });

  it('si cumple las reglas, sube de nivel con la longitud', () => {
    expect(passwordStrength('Nube-Azul-87x').level).toBe(3);
    expect(passwordStrength('Nube-Azul-Cuatro-87').level).toBe(4);
    expect(passwordStrength('Nube-Az-8').level).toBe(1); // 9 caracteres: aún no cumple
    expect(passwordStrength('Sol-Rojo-91x').level).toBe(2);
  });
});
