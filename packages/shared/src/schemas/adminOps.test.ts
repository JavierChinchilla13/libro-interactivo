import { describe, expect, it } from 'vitest';
import {
  adminMessageListQuerySchema,
  adminUserListQuerySchema,
  createStaffUserRequestSchema,
  deleteAccountRequestSchema,
  updateUserRequestSchema,
} from './adminOps.js';
import { contactSettingsSchema } from './site.js';

describe('administración de usuarios', () => {
  it('la lista tiene valores por defecto y topes de página', () => {
    expect(adminUserListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(adminUserListQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(adminUserListQuerySchema.parse({ q: '  ana  ' }).q).toBe('ana');
    expect(adminUserListQuerySchema.safeParse({ role: 'DIOS' }).success).toBe(false);
  });

  it('solo se crean cuentas de editora o administradora, nunca de lectora', () => {
    const base = { name: 'Ana Pérez', email: 'ana@ejemplo.com' };
    expect(createStaffUserRequestSchema.safeParse({ ...base, role: 'EDITOR' }).success).toBe(true);
    expect(createStaffUserRequestSchema.safeParse({ ...base, role: 'ADMIN' }).success).toBe(true);
    expect(createStaffUserRequestSchema.safeParse({ ...base, role: 'USER' }).success).toBe(false);
    expect(
      createStaffUserRequestSchema.safeParse({ ...base, email: 'no-es-correo', role: 'EDITOR' })
        .success,
    ).toBe(false);
  });

  it('cambiar un usuario exige al menos un campo válido', () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ role: 'EDITOR' }).success).toBe(true);
    expect(updateUserRequestSchema.safeParse({ status: 'disabled' }).success).toBe(true);
    expect(updateUserRequestSchema.safeParse({ status: 'borrado' }).success).toBe(false);
  });

  it('borrar la propia cuenta exige la contraseña', () => {
    expect(deleteAccountRequestSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountRequestSchema.safeParse({ password: '' }).success).toBe(false);
    expect(deleteAccountRequestSchema.safeParse({ password: 'x' }).success).toBe(true);
  });
});

describe('mensajes y ajustes de contacto', () => {
  it('el filtro de mensajes solo admite los tres estados', () => {
    expect(adminMessageListQuerySchema.parse({}).status).toBe('all');
    expect(adminMessageListQuerySchema.safeParse({ status: 'otro' }).success).toBe(false);
  });

  it('la retención va de 1 a 3650 días y el correo opcional debe ser válido', () => {
    const ok = { storeMessages: true, retentionDays: 365 };
    expect(contactSettingsSchema.safeParse(ok).success).toBe(true);
    expect(contactSettingsSchema.safeParse({ ...ok, retentionDays: 0 }).success).toBe(false);
    expect(contactSettingsSchema.safeParse({ ...ok, retentionDays: 3651 }).success).toBe(false);
    expect(contactSettingsSchema.safeParse({ ...ok, retentionDays: 1.5 }).success).toBe(false);
    expect(contactSettingsSchema.safeParse({ ...ok, recipientEmail: 'x' }).success).toBe(false);
    expect(contactSettingsSchema.safeParse({ ...ok, recipientEmail: '' }).success).toBe(false);
    expect(contactSettingsSchema.safeParse({ ...ok, recipientEmail: 'a@b.co' }).success).toBe(true);
  });
});
