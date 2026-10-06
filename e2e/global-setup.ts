import { spawnSync } from 'node:child_process';

/** Credenciales de PRUEBA (solo existen en la base `libro-e2e`; no son reales). */
export const E2E_ADMIN = {
  email: 'admin-e2e@ejemplo.com',
  name: 'Admin E2E',
  password: 'Nube-Azul-Cuatro-87',
};

/** Crea (si no existe) la administradora de las pruebas E2E con el script oficial `seed:admin`. */
export default function globalSetup(): void {
  const result = spawnSync('npm', ['run', 'seed:admin', '-w', 'apps/api'], {
    shell: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/libro-e2e',
      SEED_ADMIN_EMAIL: E2E_ADMIN.email,
      SEED_ADMIN_NAME: E2E_ADMIN.name,
      SEED_ADMIN_PASSWORD: E2E_ADMIN.password,
    },
  });
  if (result.status !== 0) {
    throw new Error(`No se pudo crear la administradora E2E:\n${result.stdout}\n${result.stderr}`);
  }
}
