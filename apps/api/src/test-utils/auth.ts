import type { Role } from '@libro/shared';
import type { Express } from 'express';
import request from 'supertest';
import { User } from '../models/User.js';
import { hashPassword } from '../services/password.service.js';

export const MINUTE = 60_000;
export const PASSWORD = 'Nube-Azul-Cuatro-87';
export const NEW_PASSWORD = 'Sol-Rojo-Siete-91x';

export async function createUser(
  overrides: { email?: string; name?: string; role?: Role; status?: 'active' | 'disabled' } = {},
) {
  const email = overrides.email ?? 'usuario@ejemplo.com';
  return User.create({
    email,
    emailNormalized: email.toLowerCase(),
    name: overrides.name ?? 'Persona de Prueba',
    passwordHash: await hashPassword(PASSWORD),
    role: overrides.role ?? 'USER',
    status: overrides.status ?? 'active',
  });
}

/** Inicia sesión y devuelve un agente que conserva las cookies (como un navegador). */
export async function loginAgent(app: Express, email = 'usuario@ejemplo.com') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

export function setCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] ?? []) as unknown as string[];
}

export function cookieValue(res: request.Response, name: string): string | undefined {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`));
  const value = line?.split(';')[0]?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : undefined;
}

/** Extrae el token del enlace de recuperación de un correo. */
export function resetTokenFrom(text: string): string {
  const match = /\/restablecer\/([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error('El correo no contiene un enlace de recuperación');
  return match[1];
}
