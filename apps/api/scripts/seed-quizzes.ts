/**
 * Carga un libro y tres quizzes de EJEMPLO (todo `[PLACEHOLDER]`) para desarrollar y probar. Uso (con MongoDB y
 * un ADMIN ya creado con `npm run seed:admin`):
 *   npm run seed:quizzes -w apps/api
 * Es idempotente y se niega a correr en producción.
 */
import { parseEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { systemClock } from '../src/lib/clock.js';
import { User } from '../src/models/User.js';
import { seedDemoQuizzes } from '../src/seed/demoQuizzes.js';
import { createProgressService } from '../src/services/progress.service.js';
import { cryptoRandomInt } from '../src/services/quiz-engine.js';
import { createQuizService } from '../src/services/quiz.service.js';
import { createQuizPublishService } from '../src/services/quizPublish.service.js';

const env = parseEnv();
if (env.NODE_ENV === 'production') {
  console.error('Los quizzes de ejemplo no se cargan en producción.');
  process.exit(1);
}

try {
  await connectDb(env.MONGODB_URI);
  const admin = await User.findOne({ role: 'ADMIN', status: 'active' }).sort({ createdAt: 1 });
  if (!admin) {
    console.error(
      'No hay ningún administrador. Crea uno primero con `npm run seed:admin -w apps/api`.',
    );
    process.exit(1);
  }
  const progress = createProgressService({ requireQrUnlock: false });
  const quizzes = createQuizService({ progress, clock: systemClock, random: cryptoRandomInt });
  const publisher = createQuizPublishService({ clock: systemClock, quizzes });

  const result = await seedDemoQuizzes({
    publisher,
    actor: { userId: admin._id.toString(), role: 'ADMIN' },
  });
  console.log(`Libro de ejemplo: ${result.bookId}`);
  console.log(`Quizzes creados: ${result.created.join(', ') || 'ninguno'}`);
  console.log(`Ya existían: ${result.existing.join(', ') || 'ninguno'}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
