import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { User } from '../models/User.js';
import { createTestApp } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';
import { ensureAdmin } from './ensureAdmin.js';

useTestDb();

const ADMIN = {
  email: 'Admin@Ejemplo.com',
  name: 'Administradora',
  password: 'Cielo-Verde-Nueve-52',
};

describe('ensureAdmin', () => {
  it('crea el administrador, que luego puede iniciar sesión', async () => {
    expect(await ensureAdmin(ADMIN)).toBe('created');
    const stored = await User.findOne({ emailNormalized: 'admin@ejemplo.com' });
    expect(stored?.role).toBe('ADMIN');
    expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);

    const res = await request(createTestApp())
      .post('/api/auth/login')
      .send({ email: 'admin@ejemplo.com', password: ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('es idempotente y no modifica una cuenta existente', async () => {
    await ensureAdmin(ADMIN);
    const before = await User.findOne({ emailNormalized: 'admin@ejemplo.com' });
    expect(await ensureAdmin({ ...ADMIN, password: 'Otra-Clave-Distinta-77' })).toBe('exists');
    const after = await User.findOne({ emailNormalized: 'admin@ejemplo.com' });
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(await User.countDocuments()).toBe(1);
  });

  it('no usa la política de contraseñas a la ligera: rechaza contraseñas débiles', async () => {
    await expect(ensureAdmin({ ...ADMIN, password: 'password123' })).rejects.toThrow(/política/);
    expect(await User.countDocuments()).toBe(0);
  });

  it('rechaza un correo inválido', async () => {
    await expect(ensureAdmin({ ...ADMIN, email: 'no-es-correo' })).rejects.toThrow();
  });
});
