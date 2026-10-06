import { describe, expect, it } from 'vitest';
import { checkPassword } from '../passwordPolicy.js';
import { loginRequestSchema, registerRequestSchema } from './auth.js';

describe('checkPassword', () => {
  it('acepta una contraseña razonable', () => {
    expect(checkPassword('Nube-Azul-Cuatro-87')).toEqual([]);
  });

  it('rechaza contraseñas cortas', () => {
    expect(checkPassword('Corta1!')).toContain('TOO_SHORT');
  });

  it('rechaza contraseñas comunes aunque cambien mayúsculas o acentos', () => {
    expect(checkPassword('Password123')).toContain('TOO_COMMON');
    expect(checkPassword('Contraseña123')).toContain('TOO_COMMON');
    expect(checkPassword('QWERTYUIOP')).toContain('TOO_COMMON');
  });

  it('rechaza repeticiones y secuencias', () => {
    expect(checkPassword('aaaaaaaaaaaa')).toContain('TOO_SIMPLE');
    expect(checkPassword('abababababab')).toContain('TOO_SIMPLE');
    expect(checkPassword('abcdefghijkl')).toContain('TOO_SIMPLE');
    expect(checkPassword('zyxwvutsrqpo')).toContain('TOO_SIMPLE');
  });

  it('rechaza contraseñas que contienen el nombre o el correo', () => {
    expect(checkPassword('Marianela-2026-x', { name: 'Marianela Soto' })).toContain('PERSONAL');
    expect(checkPassword('lectora.fiel-99!', { email: 'lectora.fiel@ejemplo.com' })).toContain(
      'PERSONAL',
    );
    expect(checkPassword('Nube-Azul-Cuatro-87', { name: 'Ana', email: 'ana@ejemplo.com' })).toEqual(
      [],
    );
  });

  it('rechaza contraseñas excesivamente largas', () => {
    expect(checkPassword('x1'.repeat(70) + 'Zq')).toContain('TOO_LONG');
  });
});

describe('registerRequestSchema', () => {
  const valid = {
    name: '  Ana López ',
    email: '  ANA@Ejemplo.COM ',
    password: 'Nube-Azul-Cuatro-87',
  };

  it('normaliza nombre y correo', () => {
    const parsed = registerRequestSchema.parse(valid);
    expect(parsed.name).toBe('Ana López');
    expect(parsed.email).toBe('ana@ejemplo.com');
  });

  it('rechaza correo inválido y contraseñas débiles con mensajes en español', () => {
    const result = registerRequestSchema.safeParse({
      ...valid,
      email: 'no-es-correo',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages).toContain('correo válido');
      expect(messages).toContain('demasiado común');
    }
  });
});

describe('loginRequestSchema', () => {
  it('no impone la política de contraseñas al iniciar sesión', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '123' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
