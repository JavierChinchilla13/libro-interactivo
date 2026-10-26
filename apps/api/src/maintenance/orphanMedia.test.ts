import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { fakeImages, videoAsset } from '../test-utils/fakeImages.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { createUser } from '../test-utils/auth.js';
import { cleanupOrphanMedia, ORPHAN_GRACE_DAYS } from './orphanMedia.js';

useTestDb();

const NOW = new Date('2026-12-01T00:00:00.000Z');
const clock = () => new Date(NOW);
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const picture = (publicId: string, createdAt: string) => ({
  publicId,
  resource: 'image' as const,
  bytes: 1_000_000,
  format: 'jpg',
  width: 1920,
  height: 1080,
  createdAt,
});

async function quizWithHistory() {
  const admin = await createUser({ role: 'ADMIN' });
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent(),
    publishedBy: admin._id,
  });
  return { quiz, admin };
}

describe('limpieza manual de fondos de quiz huérfanos', () => {
  it('por defecto solo informa: no borra nada', async () => {
    const cloud = fakeImages([picture('libro/quiz-bg/vieja', daysAgo(90))]);
    const report = await cleanupOrphanMedia({ images: cloud.provider, clock });
    expect(report.applied).toBe(false);
    expect(report.orphans.map((o) => o.publicId)).toEqual(['libro/quiz-bg/vieja']);
    expect(report.orphanBytes).toBe(1_000_000);
    expect(report.deleted).toEqual([]);
    expect(cloud.destroyed).toEqual([]);
  });

  it('un archivo referenciado por la apariencia vigente no es huérfano', async () => {
    const { quiz } = await quizWithHistory();
    await Quiz.updateOne(
      { _id: quiz._id },
      {
        $set: {
          appearance: {
            background: { kind: 'image', image: { publicId: 'libro/quiz-bg/vigente' } },
          },
        },
      },
    );
    const cloud = fakeImages([picture('libro/quiz-bg/vigente', daysAgo(200))]);
    const report = await cleanupOrphanMedia({ images: cloud.provider, clock, apply: true });
    expect(report.referenced).toBe(1);
    expect(report.orphans).toEqual([]);
    expect(cloud.destroyed).toEqual([]);
  });

  it('un archivo que solo aparece en el historial (para revertir) tampoco se borra', async () => {
    const { quiz, admin } = await quizWithHistory();
    await Quiz.updateOne(
      { _id: quiz._id },
      {
        $set: {
          appearance: { accent: 'accent' },
          appearanceHistory: [
            {
              rev: 1,
              at: NOW,
              by: admin._id,
              action: 'update',
              changed: ['background'],
              before: {
                background: { kind: 'video', video: { publicId: 'libro/quiz-bg/en-historial' } },
              },
            },
          ],
        },
      },
    );
    const cloud = fakeImages([
      videoAsset('libro/quiz-bg/en-historial', { createdAt: daysAgo(300) }),
      picture('libro/quiz-bg/suelta', daysAgo(300)),
    ]);
    const report = await cleanupOrphanMedia({ images: cloud.provider, clock, apply: true });
    expect(report.referenced).toBe(1);
    expect(report.orphans.map((o) => o.publicId)).toEqual(['libro/quiz-bg/suelta']);
    expect(cloud.destroyed).toEqual(['image:libro/quiz-bg/suelta']);
  });

  it(`una subida reciente (menos de ${ORPHAN_GRACE_DAYS} días) sin guardar todavía se respeta`, async () => {
    const cloud = fakeImages([
      picture('libro/quiz-bg/nueva', daysAgo(2)),
      picture('libro/quiz-bg/limite', daysAgo(ORPHAN_GRACE_DAYS - 1)),
      picture('libro/quiz-bg/pasada', daysAgo(ORPHAN_GRACE_DAYS + 1)),
    ]);
    const report = await cleanupOrphanMedia({ images: cloud.provider, clock, apply: true });
    expect(report.protectedByGrace).toBe(2);
    expect(report.deleted.map((d) => d.publicId)).toEqual(['libro/quiz-bg/pasada']);
  });

  it('solo toca la carpeta de fondos: lo demás de Cloudinary ni se lista ni se borra', async () => {
    const cloud = fakeImages([
      picture('libro/cover/portada', daysAgo(500)),
      picture('libro/wiki/ficha', daysAgo(500)),
      picture('libro/quiz/resultado', daysAgo(500)),
      picture('libro/quiz-bg-extra/x', daysAgo(500)),
      picture('libro/quiz-bg/huerfana', daysAgo(500)),
    ]);
    const report = await cleanupOrphanMedia({ images: cloud.provider, clock, apply: true });
    expect(report.scanned).toBe(1);
    expect(cloud.destroyed).toEqual(['image:libro/quiz-bg/huerfana']);
    expect(cloud.provider.list).toHaveBeenCalledWith({
      prefix: 'libro/quiz-bg/',
      resource: 'image',
    });
    expect(cloud.provider.list).toHaveBeenCalledWith({
      prefix: 'libro/quiz-bg/',
      resource: 'video',
    });
  });

  it('revisa también los videos y no pide nada si no hay archivos', async () => {
    const cloud = fakeImages([videoAsset('libro/quiz-bg/clip', { createdAt: daysAgo(100) })]);
    const report = await cleanupOrphanMedia({ images: cloud.provider, clock, apply: true });
    expect(report.deleted.map((d) => d.resource)).toEqual(['video']);
    const empty = await cleanupOrphanMedia({ images: fakeImages().provider, clock, apply: true });
    expect(empty).toMatchObject({ scanned: 0, orphans: [], deleted: [] });
  });
});
