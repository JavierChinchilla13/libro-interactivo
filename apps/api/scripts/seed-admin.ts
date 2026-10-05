/**
 * Crea el primer administrador. Uso (con MongoDB disponible):
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_NAME=... SEED_ADMIN_PASSWORD=... npm run seed:admin -w apps/api
 * Los valores también pueden ir en apps/api/.env (que git ignora). Es idempotente.
 */
import { parseEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { ensureAdmin } from '../src/seed/ensureAdmin.js';

const env = parseEnv();
const email = process.env['SEED_ADMIN_EMAIL'];
const name = process.env['SEED_ADMIN_NAME'] ?? 'Administradora';
const password = process.env['SEED_ADMIN_PASSWORD'];

if (!email || !password) {
  console.error('Faltan SEED_ADMIN_EMAIL y/o SEED_ADMIN_PASSWORD.');
  process.exit(1);
}

try {
  await connectDb(env.MONGODB_URI);
  const result = await ensureAdmin({ email, name, password });
  console.log(
    result === 'created'
      ? `Administrador creado: ${email}`
      : `Ya existe un usuario con el correo ${email}; no se modificó nada.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
