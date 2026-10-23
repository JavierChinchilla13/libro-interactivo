import {
  attemptResponseSchema,
  readerLibraryResponseSchema,
  resultsListResponseSchema,
  type QuizContent,
  type StagePayload,
} from '@libro/shared';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const QR = { REQUIRE_QR_UNLOCK: 'true' };

type BookStatus = 'draft' | 'published' | 'upcoming' | 'archived';

async function addBook(
  slug: string,
  order: number,
  status: BookStatus,
  extra: Record<string, unknown> = {},
) {
  return Book.create({ slug, title: `[PLACEHOLDER] ${slug}`, order, status, ...extra });
}

async function world(env: Record<string, string> = QR, role: 'USER' | 'EDITOR' | 'ADMIN' = 'USER') {
  const harness = createTestHarness({ env });
  const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const user = role === 'USER' ? await createUser() : admin;
  const agent = await loginAgent(harness.app, user.email);
  return { ...harness, admin, user, agent };
}

const library = async (agent: TestAgent) =>
  readerLibraryResponseSchema.parse((await agent.get('/api/me/library').expect(200)).body);

describe('GET /api/me/library', () => {
  it('sin sesión responde 401', async () => {
    const { app } = createTestHarness();
    await request(app).get('/api/me/library').expect(401);
  });

  it('sin libros devuelve la lista vacía', async () => {
    const { agent } = await world();
    expect((await library(agent)).books).toEqual([]);
  });

  it.each(['USER', 'ADMIN'] as const)(
    'borrador y archivado nunca aparecen (%s, aunque el interruptor esté encendido)',
    async (role) => {
      const { agent } = await world(QR, role);
      await addBook('libro-borrador', 1, 'draft', { showInReaderPanel: true });
      await addBook('libro-archivado', 2, 'archived', { showInReaderPanel: true });
      expect((await library(agent)).books).toEqual([]);
    },
  );

  it('publicado sin abrir sale bloqueado y solo con datos públicos; el canje del primer quiz lo abre', async () => {
    const { agent, admin, user } = await world();
    const book = await addBook('libro-1', 1, 'published', { tagline: 'Lema' });
    const content: QuizContent = simpleContent();
    const quiz = await createQuiz({
      bookId: book._id,
      order: 1,
      content,
      publishedBy: admin._id,
    });

    const locked = await library(agent);
    expect(locked.books).toHaveLength(1);
    expect(locked.books[0]).toMatchObject({
      access: 'locked',
      book: { slug: 'libro-1', status: 'published', tagline: 'Lema' },
    });
    expect(locked.books[0]).not.toHaveProperty('progress');
    expect(locked.books[0]).not.toHaveProperty('field');

    await UserProgress.create({
      userId: user._id,
      bookId: book._id,
      unlocked: [{ kind: 'quiz', refId: quiz._id, at: new Date() }],
    });
    const open = await library(agent);
    expect(open.books[0]).toMatchObject({
      access: 'open',
      progress: {
        done: 0,
        total: 1,
        bookCompleted: false,
        nextExperience: { kind: 'quiz', id: quiz.id, title: content.title },
      },
    });
  });

  it('canjear el QR del juego también abre el libro', async () => {
    const { agent, user } = await world();
    const book = await addBook('libro-1', 1, 'published');
    expect((await library(agent)).books[0]?.access).toBe('locked');
    await UserProgress.create({
      userId: user._id,
      bookId: book._id,
      unlocked: [{ kind: 'game', refId: book._id, at: new Date() }],
    });
    expect((await library(agent)).books[0]?.access).toBe('open');
  });

  it('un libro bloqueado no entrega nada protegido: ni quizzes, ni claves de resultado, ni progreso', async () => {
    const { agent, admin } = await world();
    const book = await addBook('libro-1', 1, 'published');
    const content = simpleContent();
    await createQuiz({ bookId: book._id, order: 1, content, publishedBy: admin._id });
    const res = await agent.get('/api/me/library').expect(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(content.title);
    expect(text).not.toMatch(/resultKey|stages|questions|answers|nextExperience|fieldSlug|"progress"/);
    expect(Object.keys(res.body.books[0]).sort()).toEqual(['access', 'book']);
  });

  it('sin exigir QR, un libro publicado está abierto', async () => {
    const { agent } = await world({});
    await addBook('libro-1', 1, 'published');
    expect((await library(agent)).books[0]?.access).toBe('open');
  });

  it('el personal ve abiertos los publicados (puede probar todo)', async () => {
    const { agent } = await world(QR, 'ADMIN');
    await addBook('libro-1', 1, 'published');
    expect((await library(agent)).books[0]?.access).toBe('open');
  });

  it('«próximamente»: apagado no aparece; encendido aparece, con fecha o sin ella, sin progreso', async () => {
    const { agent } = await world();
    await addBook('libro-2', 2, 'upcoming', { releaseDate: new Date('2027-03-01T00:00:00Z') });
    await addBook('libro-3', 3, 'upcoming', { showInReaderPanel: false });
    expect((await library(agent)).books).toEqual([]);

    await Book.updateMany({ status: 'upcoming' }, { $set: { showInReaderPanel: true } });
    await Book.updateOne({ slug: 'libro-3' }, { $unset: { releaseDate: 1 } });
    const shown = await library(agent);
    expect(shown.books.map((b) => [b.book.slug, b.access])).toEqual([
      ['libro-2', 'upcoming'],
      ['libro-3', 'upcoming'],
    ]);
    expect(shown.books[0]?.book.releaseDate).toBe('2027-03-01');
    expect(shown.books[1]?.book.releaseDate).toBeUndefined();
    expect(shown.books[0]).not.toHaveProperty('progress');
    // El interruptor solo cuenta para «próximamente»: en un publicado no cambia nada.
    expect(JSON.stringify(shown)).not.toContain('showInReaderPanel');
  });

  it('un libro «próximamente» encendido y uno publicado salen en orden', async () => {
    const { agent } = await world({});
    await addBook('libro-2', 2, 'upcoming', { showInReaderPanel: true });
    await addBook('libro-1', 1, 'published', { showInReaderPanel: true });
    const got = await library(agent);
    expect(got.books.map((b) => [b.book.slug, b.access])).toEqual([
      ['libro-1', 'open'],
      ['libro-2', 'upcoming'],
    ]);
  });
});

describe('«Tu campo» en el panel', () => {
  async function playFirst(agent: TestAgent, quizId: string) {
    const started = await agent.post(`/api/quizzes/${quizId}/attempts`).expect(200);
    const first = attemptResponseSchema.parse(started.body);
    if (first.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    const stage: StagePayload = first.stage;
    await agent
      .post(`/api/attempts/${first.attemptId}/stages/${stage.stageId}/answers`)
      .send({
        answers: stage.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id })),
      })
      .expect(200);
  }

  it('llega solo clave visual y nombre, en la biblioteca y en la lista de resultados', async () => {
    const { agent, admin } = await world({});
    const book = await addBook('libro-1', 1, 'published');
    await WikiEntry.create({
      bookId: book._id,
      kind: 'power_field',
      slug: 'transformacion',
      name: 'Transformación',
      nameNormalized: 'transformacion',
      letter: 'T',
      visualKey: 'gradient',
      order: 1,
      status: 'published',
    });
    const content: QuizContent = simpleContent();
    content.results[0] = { ...content.results[0]!, fieldSlug: 'transformacion' };
    const quiz = await createQuiz({ bookId: book._id, order: 1, content, publishedBy: admin._id });

    expect((await library(agent)).books[0]).not.toHaveProperty('field');
    await playFirst(agent, quiz.id);

    const got = await library(agent);
    expect(got.books[0]?.field).toEqual({ key: 'gradient', fieldName: 'Transformación' });
    expect(got.books[0]?.progress?.done).toBe(1);
    expect(JSON.stringify(got)).not.toMatch(/fieldSlug|"transformacion"|resultKey/);

    const list = resultsListResponseSchema.parse(
      (await agent.get('/api/me/results').query({ bookId: book.id }).expect(200)).body,
    );
    expect(list.results[0]?.visual).toEqual({ key: 'gradient', fieldName: 'Transformación' });
    expect(JSON.stringify(list)).not.toMatch(/fieldSlug|"transformacion"|resultKey/);
  });
});
