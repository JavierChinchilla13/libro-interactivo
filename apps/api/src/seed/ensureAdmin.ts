import { PASSWORD_PROBLEM_MESSAGES, checkPassword, emailSchema, nameSchema } from '@libro/shared';
import { normalizeEmail } from '../lib/email.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/password.service.js';

export interface AdminSeedInput {
  email: string;
  name: string;
  password: string;
}

/**
 * Crea el primer administrador si no existe (idempotente). Si ya existe un usuario con ese correo
 * no se toca nada: ni rol ni contraseña. Los datos vienen de variables de entorno, nunca del repo.
 */
export async function ensureAdmin(input: AdminSeedInput): Promise<'created' | 'exists'> {
  const email = emailSchema.parse(input.email);
  const name = nameSchema.parse(input.name);
  const problems = checkPassword(input.password, { name, email });
  if (problems.length > 0) {
    throw new Error(
      `La contraseña del administrador no cumple la política: ${problems
        .map((problem) => PASSWORD_PROBLEM_MESSAGES[problem])
        .join(' ')}`,
    );
  }

  const emailNormalized = normalizeEmail(email);
  if (await User.exists({ emailNormalized })) return 'exists';

  await User.create({
    email,
    emailNormalized,
    name,
    passwordHash: await hashPassword(input.password),
    role: 'ADMIN',
  });
  return 'created';
}
