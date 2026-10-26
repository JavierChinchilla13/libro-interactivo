import { quizAppearanceSchema } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { createUser } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { migrateAccents } from './migrateAccents.js';

useTestDb();

const bg = {
  kind: 'image',
  image: {
    provider: 'cloudinary',
    publicId: 'libro/quiz-bg/uno',
    url: 'https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/uno.jpg',
    width: 1920,
    height: 1080,
    alt: 'Fondo',
    deliveryType: 'upload',
  },
};

async function quizzes() {
  const admin = await createUser({ role: 'ADMIN' });
  const book = await createBook();
  const named = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent(),
    slug: 'a',
    publishedBy: admin._id,
  });
  const free = await createQuiz({
    bookId: book._id,
    order: 2,
    content: simpleContent(),
    slug: 'b',
    publishedBy: admin._id,
  });
  const none = await createQuiz({
    bookId: book._id,
    order: 3,
    content: simpleContent(),
    slug: 'c',
    publishedBy: admin._id,
  });
  await Quiz.collection.updateOne(
    { _id: named._id },
    {
      $set: {
        appearance: { background: bg, accent: 'warning' },
        appearanceRev: 2,
        appearanceHistory: [
          {
            rev: 1,
            at: new Date(),
            by: admin._id,
            action: 'seed',
            changed: ['accent'],
            before: null,
          },
          {
            rev: 2,
            at: new Date(),
            by: admin._id,
            action: 'update',
            changed: ['accent'],
            before: { accent: 'accent' },
          },
        ],
      },
    },
  );
  await Quiz.collection.updateOne(
    { _id: free._id },
    { $set: { appearance: { accent: '#123abc' }, appearanceRev: 1 } },
  );
  return { named, free, none };
}

describe('migrateAccents', () => {
  it('por defecto solo informa: no cambia nada', async () => {
    const { named } = await quizzes();
    const report = await migrateAccents();
    expect(report).toMatchObject({
      scanned: 2,
      withNamedAccent: 1,
      namedAccents: 2,
      rewritten: 0,
      applied: false,
    });
    const stored = await Quiz.collection.findOne({ _id: named._id });
    expect(stored?.appearance.accent).toBe('warning');
    expect(stored?.appearanceHistory[1].before.accent).toBe('accent');
  });

  it('con --apply reescribe el acento vigente y los estados anteriores como hex, sin tocar lo demás, y es idempotente', async () => {
    const { named, free } = await quizzes();
    const report = await migrateAccents({ apply: true });
    expect(report).toMatchObject({
      withNamedAccent: 1,
      namedAccents: 2,
      rewritten: 2,
      applied: true,
    });
    const stored = await Quiz.collection.findOne({ _id: named._id });
    expect(stored?.appearance.accent).toBe('#ffcb66');
    expect(stored?.appearanceHistory[1].before.accent).toBe('#a89bff');
    expect(stored?.appearanceHistory[0].before).toBeNull();
    expect(stored?.appearanceRev).toBe(2); // las revisiones no se tocan
    expect(quizAppearanceSchema.safeParse(stored?.appearance).data?.accent).toBe('#ffcb66');
    // El color libre ya guardado no se toca.
    expect((await Quiz.collection.findOne({ _id: free._id }))?.appearance.accent).toBe('#123abc');
    expect(await migrateAccents({ apply: true })).toMatchObject({
      withNamedAccent: 0,
      namedAccents: 0,
      rewritten: 0,
    });
  });
});
