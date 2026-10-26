import { spawnSync } from 'node:child_process';
import { MongoClient } from 'mongodb';

/** Credenciales de PRUEBA (solo existen en la base `libro-e2e`; no son reales). */
export const E2E_ADMIN = {
  email: 'admin-e2e@ejemplo.com',
  name: 'Admin E2E',
  password: 'Nube-Azul-Cuatro-87',
};

const E2E_DB = 'mongodb://127.0.0.1:27017/libro-e2e';

/**
 * Vacía los documentos de la base de pruebas (conserva colecciones e índices). Cada corrida deja libros, quizzes y
 * cuentas; con cientos acumulados los paneles tardan y las pruebas largas se vuelven inestables.
 */
async function emptyDatabase(): Promise<void> {
  const client = await MongoClient.connect(E2E_DB);
  try {
    const db = client.db();
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (!name.startsWith('system.')) await db.collection(name).deleteMany({});
    }
  } finally {
    await client.close();
  }
}

/** Limpia la base de pruebas y crea la administradora de las E2E con el script oficial `seed:admin`. */
export default async function globalSetup(): Promise<void> {
  await emptyDatabase();
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
