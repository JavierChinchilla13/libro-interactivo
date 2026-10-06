import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  updateProfileRequestSchema,
} from './account.js';
import { contactRequestSchema } from './contact.js';

const GOOD = 'Nube-Azul-Cuatro-87';

describe('changePasswordRequestSchema', () => {
  it('acepta la contraseña nueva escrita dos veces', () => {
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword: 'la-actual',
      newPassword: GOOD,
      newPasswordConfirm: GOOD,
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza si las dos contraseñas nuevas no coinciden', () => {
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword: 'la-actual',
      newPassword: GOOD,
      newPasswordConfirm: `${GOOD}x`,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.message)).toContain('Las contraseñas no coinciden');
    }
  });

  it('aplica la política de contraseñas a la nueva', () => {
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword: 'la-actual',
      newPassword: 'password123',
      newPasswordConfirm: 'password123',
    });
    expect(parsed.success).toBe(false);
  });

  it('exige la contraseña actual', () => {
    expect(
      changePasswordRequestSchema.safeParse({
        currentPassword: '',
        newPassword: GOOD,
        newPasswordConfirm: GOOD,
      }).success,
    ).toBe(false);
  });
});

describe('otros esquemas de cuenta', () => {
  it('forgot-password normaliza el correo', () => {
    expect(forgotPasswordRequestSchema.parse({ email: ' ANA@Ejemplo.com ' }).email).toBe(
      'ana@ejemplo.com',
    );
  });

  it('reset-password exige un token con forma razonable y contraseñas iguales y válidas', () => {
    const base = { token: 'a'.repeat(43), newPassword: GOOD, newPasswordConfirm: GOOD };
    expect(resetPasswordRequestSchema.safeParse(base).success).toBe(true);
    expect(resetPasswordRequestSchema.safeParse({ ...base, token: 'corto' }).success).toBe(false);
    expect(
      resetPasswordRequestSchema.safeParse({ ...base, newPasswordConfirm: 'otra' }).success,
    ).toBe(false);
  });

  it('el perfil solo admite nombre (el correo no se puede cambiar)', () => {
    expect(updateProfileRequestSchema.parse({ name: '  Ana  ', email: 'x@y.co' })).toEqual({
      name: 'Ana',
    });
    expect(updateProfileRequestSchema.safeParse({ name: 'A' }).success).toBe(false);
  });
});

describe('contactRequestSchema', () => {
  const base = {
    name: 'Visitante',
    email: 'visita@ejemplo.com',
    message: 'Hola, me encantó el libro.',
    startedAt: 1_700_000_000_000,
  };

  it('acepta un mensaje válido y completa el honeypot vacío', () => {
    const parsed = contactRequestSchema.parse(base);
    expect(parsed.website).toBe('');
  });

  it('rechaza mensajes muy cortos o demasiado largos y correos inválidos', () => {
    expect(contactRequestSchema.safeParse({ ...base, message: 'corto' }).success).toBe(false);
    expect(contactRequestSchema.safeParse({ ...base, message: 'x'.repeat(5001) }).success).toBe(
      false,
    );
    expect(contactRequestSchema.safeParse({ ...base, email: 'no-es-correo' }).success).toBe(false);
  });
});
