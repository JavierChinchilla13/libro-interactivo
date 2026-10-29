import { describe, expect, it } from 'vitest';
import { checkPassword } from '../passwordPolicy.js';
import { googleLoginRequestSchema, loginRequestSchema, registerRequestSchema } from './auth.js';

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
    birth: { year: 1990, month: 6 },
    ageDeclaration: 'adult',
    acceptTerms: true,
    acceptPrivacy: true,
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

  it('exige la edad declarada y los dos consentimientos por separado', () => {
    for (const missing of ['birth', 'ageDeclaration', 'acceptTerms', 'acceptPrivacy']) {
      const body: Record<string, unknown> = { ...valid };
      delete body[missing];
      expect(registerRequestSchema.safeParse(body).success, missing).toBe(false);
    }
    // Un consentimiento en falso o de otro tipo no vale: ni false ni el texto "true".
    for (const field of ['acceptTerms', 'acceptPrivacy']) {
      for (const value of [false, 'true', 1, null]) {
        expect(registerRequestSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
      }
    }
    const result = registerRequestSchema.safeParse({ ...valid, acceptPrivacy: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'Debes autorizar el tratamiento de tus datos',
      );
    }
  });

  it('rechaza mes fuera de 1 a 12, año de texto o decimal y declaraciones desconocidas', () => {
    const bad = [
      { birth: { year: 1990, month: 0 } },
      { birth: { year: 1990, month: 13 } },
      { birth: { year: '1990', month: 6 } },
      { birth: { year: 1990.5, month: 6 } },
      { birth: { year: 1800, month: 6 } },
      { ageDeclaration: 'otra' },
    ];
    for (const change of bad) {
      expect(registerRequestSchema.safeParse({ ...valid, ...change }).success).toBe(false);
    }
  });

  it('solo pasa lo que el esquema conoce (ni día de nacimiento, ni edad, ni rol)', () => {
    const parsed = registerRequestSchema.parse({ ...valid, birthDay: 12, age: 30, role: 'ADMIN' });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'acceptPrivacy',
        'acceptTerms',
        'ageDeclaration',
        'birth',
        'email',
        'name',
        'password',
      ].sort(),
    );
  });
});

describe('loginRequestSchema', () => {
  it('no impone la política de contraseñas al iniciar sesión', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '123' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('googleLoginRequestSchema', () => {
  const credential = 'x'.repeat(30);

  it('acepta solo la credencial (primer paso) o con el perfil completo (segundo paso)', () => {
    expect(googleLoginRequestSchema.safeParse({ credential }).success).toBe(true);
    expect(
      googleLoginRequestSchema.safeParse({
        credential,
        profile: {
          birth: { year: 2000, month: 1 },
          ageDeclaration: 'adult',
          acceptTerms: true,
          acceptPrivacy: true,
        },
      }).success,
    ).toBe(true);
  });

  it('un perfil a medias se rechaza', () => {
    expect(
      googleLoginRequestSchema.safeParse({
        credential,
        profile: { birth: { year: 2000, month: 1 } },
      }).success,
    ).toBe(false);
  });
});
