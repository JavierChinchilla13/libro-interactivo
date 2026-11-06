import { describe, expect, it } from 'vitest';
import {
  BACKUP_ARCHIVE_PASSWORD_MIN,
  archivePasswordProblems,
  createBackupRequestSchema,
  isBackupStale,
} from './backup.js';

const ACCOUNT = 'Nube-Azul-Cuatro-87';
const ARCHIVE = 'Faro-Lejano-Ocho-2026';

describe('createBackupRequestSchema', () => {
  it('acepta la contraseña de la cuenta y una del archivo válida, repetida', () => {
    expect(
      createBackupRequestSchema.safeParse({
        password: ACCOUNT,
        archivePassword: ARCHIVE,
        archivePasswordConfirm: ARCHIVE,
      }).success,
    ).toBe(true);
  });

  it.each([
    [
      'sin contraseña de la cuenta',
      { password: '', archivePassword: ARCHIVE, archivePasswordConfirm: ARCHIVE },
    ],
    [
      'archivo de 11 caracteres',
      { password: ACCOUNT, archivePassword: 'Corta-20261', archivePasswordConfirm: 'Corta-20261' },
    ],
    [
      'no coinciden',
      { password: ACCOUNT, archivePassword: ARCHIVE, archivePasswordConfirm: `${ARCHIVE}x` },
    ],
    [
      'igual a la de la cuenta',
      { password: ACCOUNT, archivePassword: ACCOUNT, archivePasswordConfirm: ACCOUNT },
    ],
    [
      'demasiado común',
      {
        password: ACCOUNT,
        archivePassword: 'password12345',
        archivePasswordConfirm: 'password12345',
      },
    ],
    [
      'más de 128',
      {
        password: ACCOUNT,
        archivePassword: 'a'.repeat(129),
        archivePasswordConfirm: 'a'.repeat(129),
      },
    ],
    ['sin confirmar', { password: ACCOUNT, archivePassword: ARCHIVE }],
  ])('rechaza: %s', (_label, body) => {
    expect(createBackupRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('archivePasswordProblems', () => {
  it('pide al menos 12 caracteres y aplica la política del sitio con nombre y correo', () => {
    expect(BACKUP_ARCHIVE_PASSWORD_MIN).toBe(12);
    expect(archivePasswordProblems(ARCHIVE)).toEqual([]);
    expect(archivePasswordProblems('Corta-2026')).toEqual([
      'La contraseña del archivo debe tener al menos 12 caracteres.',
    ]);
    expect(
      archivePasswordProblems('Valeria-Respaldo-26', { name: 'Valeria Mora', email: 'v@x.co' }),
    ).toEqual(['La contraseña no puede contener tu nombre ni tu correo.']);
  });
});

describe('isBackupStale', () => {
  it('avisa si nunca hubo respaldo o desde los 7 días', () => {
    expect(isBackupStale({ daysAgo: null })).toBe(true);
    expect(isBackupStale({ daysAgo: 0 })).toBe(false);
    expect(isBackupStale({ daysAgo: 6 })).toBe(false);
    expect(isBackupStale({ daysAgo: 7 })).toBe(true);
  });
});
