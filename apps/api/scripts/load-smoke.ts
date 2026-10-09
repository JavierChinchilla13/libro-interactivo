/**
 * Prueba de carga ligera (humo): levanta el API real en un puerto efímero con MongoDB en memoria y mide latencia y
 * errores de los endpoints más usados. No sustituye una prueba de carga en el entorno de producción: sirve para
 * detectar regresiones gordas (p. ej. una consulta sin índice) antes de publicar.
 *   npm run load:smoke -w apps/api            # 5 s por endpoint, 20 conexiones simultáneas
 *   npm run load:smoke -w apps/api -- --seconds 10 --concurrency 40
 * Los límites de peticiones por IP se relajan para medir el servidor, no el limitador.
 */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { createTestHarness } from '../src/test-utils/app.js';
import { PASSWORD, createUser } from '../src/test-utils/auth.js';
import { createBook, createQuiz, simpleContent } from '../src/test-utils/quizFixtures.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const SECONDS = flag('seconds', 5);
const CONCURRENCY = flag('concurrency', 20);

interface Target {
  name: string;
  method: 'GET' | 'POST';
  path: string | (() => string);
  body?: unknown;
  auth?: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

const mongo = await MongoMemoryServer.create();
try {
  await connectDb(mongo.getUri());
  const { app } = createTestHarness();
  const reader = await createUser({ email: 'carga@ejemplo.com' });
  const admin = await createUser({ email: 'admin-carga@ejemplo.com', role: 'ADMIN' });
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz de carga' }),
    publishedBy: admin._id,
  });

  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'carga@ejemplo.com', password: PASSWORD }),
  });
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  const targets: Target[] = [
    { name: 'GET /api/health', method: 'GET', path: '/api/health' },
    { name: 'GET /api/books', method: 'GET', path: '/api/books' },
    { name: 'GET /api/site', method: 'GET', path: '/api/site' },
    { name: 'GET /api/me', method: 'GET', path: '/api/me', auth: true },
    {
      name: 'GET /api/me/progress',
      method: 'GET',
      path: `/api/me/progress?bookId=${book._id}`,
      auth: true,
    },
    { name: 'GET /api/quizzes/:id', method: 'GET', path: `/api/quizzes/${quiz._id}`, auth: true },
    {
      name: 'POST /api/auth/login (Argon2)',
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'carga@ejemplo.com', password: PASSWORD },
    },
  ];

  console.log(`Carga ligera: ${SECONDS} s por endpoint, ${CONCURRENCY} conexiones simultáneas\n`);
  console.log(
    'endpoint'.padEnd(34),
    'req/s'.padStart(8),
    'p50'.padStart(8),
    'p95'.padStart(8),
    'p99'.padStart(8),
    'errores'.padStart(9),
  );

  let failed = false;
  for (const target of targets) {
    const latencies: number[] = [];
    let errors = 0;
    const until = Date.now() + SECONDS * 1000;
    const worker = async () => {
      while (Date.now() < until) {
        const started = performance.now();
        try {
          const response = await fetch(
            `${base}${typeof target.path === 'function' ? target.path() : target.path}`,
            {
              method: target.method,
              headers: {
                ...(target.body ? { 'Content-Type': 'application/json' } : {}),
                ...(target.auth ? { Cookie: cookie } : {}),
              },
              ...(target.body ? { body: JSON.stringify(target.body) } : {}),
            },
          );
          await response.arrayBuffer();
          if (response.status >= 400) errors += 1;
        } catch {
          errors += 1;
        }
        latencies.push(performance.now() - started);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    latencies.sort((a, b) => a - b);
    if (errors > 0) failed = true;
    console.log(
      target.name.padEnd(34),
      String(Math.round(latencies.length / SECONDS)).padStart(8),
      `${percentile(latencies, 50).toFixed(0)} ms`.padStart(8),
      `${percentile(latencies, 95).toFixed(0)} ms`.padStart(8),
      `${percentile(latencies, 99).toFixed(0)} ms`.padStart(8),
      String(errors).padStart(9),
    );
  }

  server.close();
  void reader;
  if (failed) process.exitCode = 1;
} finally {
  await disconnectDb();
  await mongo.stop();
}
