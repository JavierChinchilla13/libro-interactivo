/**
 * Carga el juego del libro 1 (historia de `@libro/game-core`, todo `[PLACEHOLDER]`) en la base de datos. Uso:
 *   npm run seed:game -w apps/api            (el libro publicado con menor orden)
 *   BOOK_SLUG=libro-1 npm run seed:game -w apps/api
 * Es idempotente: repetirlo no duplica ni cambia nada si la historia no cambió.
 */
import { libro1Story } from '@libro/game-core';
import { parseEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Book } from '../src/models/Book.js';
import { seedGameStory } from '../src/seed/gameStory.js';

const env = parseEnv();
try {
  await connectDb(env.MONGODB_URI);
  const slug = process.env['BOOK_SLUG'];
  const book = slug
    ? await Book.findOne({ slug })
    : await Book.findOne({ status: 'published' }).sort({ order: 1 });
  if (!book) {
    console.error('No hay un libro donde cargar el juego (crea o publica uno primero).');
    process.exit(1);
  }
  const result = await seedGameStory({ bookId: book.id, story: libro1Story });
  console.log(
    `${result.created ? 'Juego cargado' : 'El juego ya estaba al día'}: versión ${result.version} del libro «${book.title}» (${result.id})`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
