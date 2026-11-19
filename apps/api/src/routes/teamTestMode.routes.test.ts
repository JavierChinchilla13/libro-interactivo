import {
  apiErrorSchema,
  attemptResponseSchema,
  progressResponseSchema,
  readerLibraryResponseSchema,
  readerExtraResponseSchema,
  readerExtrasResponseSchema,
  publicWikiEntryResponseSchema,
  publicWikiSectionsResponseSchema,
} from '@libro/shared';
import { libro1Story } from '@libro/game-core';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildAccessToken } from '../lib/accessToken.js';
import { parseEnv } from '../config/env.js';
import { letterOf, normalizeName } from '../lib/text.js';
import { AccessToken } from '../models/AccessToken.js';
import { Book } from '../models/Book.js';
import { Card } from '../models/Card.js';
import { Extra } from '../models/Extra.js';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { GameSession } from '../models/GameSession.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { UserProgress } from '../models/UserProgress.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { seedGameStory } from '../seed/gameStory.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { createCard } from '../test-utils/cards.js';
import { useTestDb } from '../test-utils/db.js';
import { playQuizToEnd } from '../test-utils/quizPlay.js';
import { createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const env = parseEnv({ NODE_ENV: 'test' });
const code = (res: { body: unknown }) => apiErrorSchema.parse(res.body).error.code;

type Status = 'published' | 'upcoming' | 'draft' | 'archived';

/**
 * Mundo del modo prueba: con QR obligatorio (como en producción) y un libro por estado, cada uno con un quiz publicado.
 * `published` además lleva dos quizzes y la historia del juego.
 */
async function world() {
  const w = await staffWorld({ env: { REQUIRE_QR_UNLOCK: 'true' } });
  let order = 0;
  const book = async (status: Status, extra: Record<string, unknown> = {}) => {
    order += 1;
    const doc = await Book.create({
      slug: `libro-${order}`,
      title: `[PLACEHOLDER] Libro ${order}`,
      order,
      status,
      cover: image(`c${order}`),
      ...(status === 'upcoming' ? { releaseDate: new Date('2027-03-01T00:00:00Z') } : {}),
      ...extra,
    });
    const bookId = doc._id.toString();
    const quizzes = [];
    for (const [index, settings] of (status === 'published'
      ? [{ allowRetake: false }, {}]
      : [{ allowRetake: false }]
    ).entries()) {
      quizzes.push(
        await createQuiz({
          bookId: doc._id,
          order: index + 1,
          content: simpleContent({ title: `Quiz ${index + 1}`, settings }),
          publishedBy: w.adminUser._id,
        }),
      );
    }
    return { id: bookId, doc, quizzes: quizzes.map((q) => q._id.toString()) };
  };
  const all = {
    published: await book('published'),
    upcoming: await book('upcoming'),
    draft: await book('draft'),
    archived: await book('archived'),
  };
  await seedGameStory({ bookId: all.published.id, story: libro1Story });
  await seedGameStory({ bookId: all.upcoming.id, story: libro1Story });
  await seedGameStory({ bookId: all.archived.id, story: libro1Story });
  return { ...w, ...all, visitor: supertest(w.app) };
}

const progressOf = async (agent: { get: (u: string) => supertest.Test }, bookId: string) =>
  agent.get(`/api/me/progress?bookId=${bookId}`);

describe('biblioteca: el equipo ve los libros sin publicar; los lectores no', () => {
  it('equipo: publicados, próximos y borradores, todos abiertos y marcados; nunca los archivados', async () => {
    const w = await world();
    for (const agent of [w.editor, w.admin]) {
      const { books } = readerLibraryResponseSchema.parse(
        (await agent.get('/api/me/library').expect(200)).body,
      );
      expect(books.map((b) => [b.book.slug, b.access, b.unpublished ?? null])).toEqual([
        ['libro-1', 'open', null],
        ['libro-2', 'open', 'upcoming'],
        ['libro-3', 'open', 'draft'],
      ]);
      // Con avance propio (de prueba): todo disponible, sin candado.
      for (const entry of books) expect(entry.progress?.total).toBeGreaterThan(0);
    }
  });

  it('lector: solo publicados (cerrados sin QR) y «próximamente» solo si la autora lo encendió; nunca la marca', async () => {
    const w = await world();
    const before = readerLibraryResponseSchema.parse(
      (await w.reader.get('/api/me/library').expect(200)).body,
    );
    expect(before.books.map((b) => [b.book.slug, b.access])).toEqual([['libro-1', 'locked']]);
    await Book.updateOne({ _id: w.upcoming.id }, { $set: { showInReaderPanel: true } });
    const after = readerLibraryResponseSchema.parse(
      (await w.reader.get('/api/me/library').expect(200)).body,
    );
    expect(after.books.map((b) => [b.book.slug, b.access])).toEqual([
      ['libro-1', 'locked'],
      ['libro-2', 'upcoming'],
    ]);
    expect(JSON.stringify(after)).not.toContain('unpublished');
    expect((await w.visitor.get('/api/me/library')).status).toBe(401);
  });
});

describe('progreso por libro', () => {
  it('equipo: libros próximos y borradores con todo disponible, sin orden ni QR; archivado 404', async () => {
    const w = await world();
    for (const bookId of [w.upcoming.id, w.draft.id, w.published.id]) {
      for (const agent of [w.editor, w.admin]) {
        const raw = await progressOf(agent, bookId);
        expect(raw.status).toBe(200);
        const res = progressResponseSchema.parse(raw.body);
        expect(res.experiences.every((e) => e.status === 'available')).toBe(true);
        expect(res.experiences.every((e) => e.lockedBy === undefined)).toBe(true);
      }
    }
    // El libro publicado tiene dos quizzes y el juego: los tres disponibles a la vez.
    const published = progressResponseSchema.parse(
      (await progressOf(w.admin, w.published.id)).body,
    );
    expect(published.experiences.map((e) => [e.kind, e.status])).toEqual([
      ['quiz', 'available'],
      ['quiz', 'available'],
      ['game', 'available'],
    ]);
    expect((await progressOf(w.admin, w.archived.id)).status).toBe(404);
    expect((await progressOf(w.editor, w.archived.id)).status).toBe(404);
  });

  it('lector: un libro próximo, borrador o archivado da 404; el publicado sigue con orden y QR', async () => {
    const w = await world();
    for (const bookId of [w.upcoming.id, w.draft.id, w.archived.id]) {
      expect((await progressOf(w.reader, bookId)).status, bookId).toBe(404);
    }
    const published = progressResponseSchema.parse(
      (await progressOf(w.reader, w.published.id)).body,
    );
    expect(published.experiences.map((e) => e.status)).toEqual(['locked', 'locked', 'locked']);
  });

  it('equipo: terminar una prueba marca el quiz como completado en SU hilo, y no cambia el del lector', async () => {
    const w = await world();
    await playQuizToEnd(w.admin, w.upcoming.quizzes[0]!);
    const mine = progressResponseSchema.parse((await progressOf(w.admin, w.upcoming.id)).body);
    expect(mine.experiences[0]?.status).toBe('completed');
    expect(mine.bookCompleted).toBe(false);
    // Un editor no ve las pruebas de la administradora.
    const other = progressResponseSchema.parse((await progressOf(w.editor, w.upcoming.id)).body);
    expect(other.experiences[0]?.status).toBe('available');
    expect(await UserProgress.countDocuments()).toBe(0);
  });
});

describe('quizzes y juego en modo prueba', () => {
  it('el equipo juega un quiz de un libro próximo o borrador, sin QR ni orden; nunca de uno archivado', async () => {
    const w = await world();
    for (const bookId of [w.upcoming, w.draft]) {
      for (const agent of [w.editor, w.admin]) {
        const done = await playQuizToEnd(agent, bookId.quizzes[0]!);
        expect(done.status).toBe('completed');
      }
    }
    // El segundo quiz del publicado se abre sin completar el primero.
    await w.admin.get(`/api/quizzes/${w.published.quizzes[1]}`).expect(200);
    expect((await w.admin.get(`/api/quizzes/${w.archived.quizzes[0]}`)).status).toBe(404);
    expect((await w.admin.post(`/api/quizzes/${w.archived.quizzes[0]}/attempts`)).status).toBe(404);
  });

  it('un lector no entra a los quizzes de un libro próximo, borrador o archivado ni al segundo sin QR', async () => {
    const w = await world();
    for (const quizId of [w.upcoming.quizzes[0], w.draft.quizzes[0], w.archived.quizzes[0]]) {
      expect((await w.reader.get(`/api/quizzes/${quizId}`)).status, quizId).toBe(404);
      expect((await w.reader.post(`/api/quizzes/${quizId}/attempts`)).status, quizId).toBe(404);
    }
    expect((await w.reader.get(`/api/quizzes/${w.published.quizzes[0]}`)).status).toBe(403);
    expect((await w.visitor.get(`/api/quizzes/${w.upcoming.quizzes[0]}`)).status).toBe(401);
  });

  it('el Quiz 1 de una sola vez se repite las veces que haga falta como equipo; el lector sigue con 409', async () => {
    const w = await world();
    const quizId = w.upcoming.quizzes[0]!;
    await playQuizToEnd(w.admin, quizId);
    const intro = await w.admin.get(`/api/quizzes/${quizId}`).expect(200);
    expect(intro.body).toMatchObject({ allowRetake: false, canStart: true });
    for (let i = 0; i < 3; i += 1) await playQuizToEnd(w.admin, quizId);
    expect(await QuizAttempt.countDocuments({ quizId, isTest: true, status: 'completed' })).toBe(4);
    // Los intentos de prueba nunca cuentan contra la regla de un solo intento del lector.
    expect(await QuizAttempt.countDocuments({ quizId, isTest: false })).toBe(0);

    // Un lector con el QR canjeado juega una vez y la segunda da 409 (la regla del lector no cambia).
    const first = w.published.quizzes[0]!;
    const created = (
      await w.admin
        .post('/api/admin/access-tokens')
        .send({ kind: 'quiz', refId: first })
        .expect(201)
    ).body as { id: string };
    await w.reader
      .post('/api/access/redeem')
      .send({ token: buildAccessToken(created.id, env.ACCESS_TOKEN_SECRET) })
      .expect(200);
    await playQuizToEnd(w.reader, first);
    const again = await w.reader.post(`/api/quizzes/${first}/attempts`);
    expect(again.status).toBe(409);
    expect(code(again)).toBe('CONFLICT');
  });

  it('el equipo juega el juego de un libro próximo con una partida de prueba; archivado 404; lector 404', async () => {
    const w = await world();
    for (const agent of [w.editor, w.admin]) {
      await agent.post(`/api/game/${w.upcoming.id}/sessions`).expect(200);
    }
    expect(await GameSession.countDocuments({ isTest: true })).toBe(2);
    expect(await GameSession.countDocuments({ isTest: false })).toBe(0);
    expect((await w.admin.post(`/api/game/${w.archived.id}/sessions`)).status).toBe(404);
    expect((await w.reader.post(`/api/game/${w.upcoming.id}/sessions`)).status).toBe(404);
    expect((await w.reader.post(`/api/game/${w.published.id}/sessions`)).status).toBe(403);
    expect(await UserProgress.countDocuments()).toBe(0);
  });
});

describe('capítulos extra en modo prueba', () => {
  async function extras(w: Awaited<ReturnType<typeof world>>) {
    const make = (bookId: string, slug: string, status: 'draft' | 'published' | 'archived') =>
      Extra.create({
        bookId,
        slug,
        title: `[PLACEHOLDER] ${slug}`,
        kind: 'text',
        bodyHtml: '<p>[PLACEHOLDER] Texto</p>',
        order: 1,
        status,
        ...(status === 'published' ? { publishedAt: new Date() } : {}),
      });
    return {
      published: await make(w.published.id, 'publicado', 'published'),
      inUpcoming: await make(w.upcoming.id, 'en-proximo', 'published'),
      draft: await make(w.published.id, 'borrador', 'draft'),
      archived: await make(w.published.id, 'archivado', 'archived'),
    };
  }

  it('el equipo abre un extra sin completar el libro, incluso en un libro próximo, y uno en borrador por id; no deja registro', async () => {
    const w = await world();
    const e = await extras(w);
    for (const agent of [w.editor, w.admin]) {
      for (const id of [e.published._id, e.inUpcoming._id, e.draft._id]) {
        const res = await agent.get(`/api/extras/${id}`).expect(200);
        expect(readerExtraResponseSchema.parse(res.body).kind).toBe('text');
      }
      expect((await agent.get(`/api/extras/${e.archived._id}`)).status).toBe(404);
    }
    // Sin «visto»: ni contamina lo que ven los lectores ni impide eliminar el extra.
    expect(await ExtraAccess.countDocuments()).toBe(0);
    await w.admin.delete(`/api/admin/extras/${e.draft._id}`).expect(204);
  });

  it('la lista del equipo trae los publicados sin candado, en cualquier libro no archivado; archivado 404', async () => {
    const w = await world();
    await extras(w);
    for (const bookId of [w.published.id, w.upcoming.id]) {
      const list = readerExtrasResponseSchema.parse(
        (await w.admin.get(`/api/extras?bookId=${bookId}`).expect(200)).body,
      );
      expect(list.locked).toBe(false);
      if (!list.locked) expect(list.extras.every((x) => x.opened === false)).toBe(true);
    }
    const published = readerExtrasResponseSchema.parse(
      (await w.admin.get(`/api/extras?bookId=${w.published.id}`)).body,
    );
    // El borrador y el archivado no salen en la lista (solo se abren por id).
    expect(published.locked === false && published.extras.map((x) => x.title)).toEqual([
      '[PLACEHOLDER] publicado',
    ]);
    expect((await w.admin.get(`/api/extras?bookId=${w.archived.id}`)).status).toBe(404);
  });

  it('un lector sigue igual: bloqueado sin completar, 404 en borrador y en libros sin publicar', async () => {
    const w = await world();
    const e = await extras(w);
    expect((await w.reader.get(`/api/extras/${e.published._id}`)).status).toBe(403);
    expect((await w.reader.get(`/api/extras/${e.draft._id}`)).status).toBe(404);
    const locked = readerExtrasResponseSchema.parse(
      (await w.reader.get(`/api/extras?bookId=${w.published.id}`).expect(200)).body,
    );
    expect(locked).toEqual({ locked: true, hasExtras: true });
    expect((await w.reader.get(`/api/extras?bookId=${w.upcoming.id}`)).status).toBe(404);
    expect((await w.visitor.get(`/api/extras/${e.published._id}`)).status).toBe(401);
  });
});

describe('QR: el canje del equipo no escribe nada', () => {
  it('equipo: sin desbloqueo ni contador; lector: sí (igual que siempre)', async () => {
    const w = await world();
    const create = async (kind: 'quiz' | 'card', refId: string) =>
      (await w.admin.post('/api/admin/access-tokens').send({ kind, refId }).expect(201)).body as {
        id: string;
      };
    const card = await createCard({ bookId: w.published.id, createdBy: w.adminUser._id });
    const quizToken = await create('quiz', w.published.quizzes[0]!);
    const cardToken = await create('card', card.id);
    const tokenOf = (id: string) => buildAccessToken(id, env.ACCESS_TOKEN_SECRET);

    for (const agent of [w.editor, w.admin]) {
      for (const t of [quizToken, cardToken]) {
        const res = await agent
          .post('/api/access/redeem')
          .send({ token: tokenOf(t.id) })
          .expect(200);
        expect(res.body).toMatchObject({ alreadyUnlocked: false });
      }
    }
    expect(await UserProgress.countDocuments()).toBe(0);
    const stats = await AccessToken.find().lean();
    expect(stats.every((t) => (t.redeemCount ?? 0) === 0 && !t.lastRedeemedAt)).toBe(true);
    // La carta no queda «abierta por lectores»: se puede archivar y eliminar.
    await w.admin.post(`/api/admin/cards/${card.id}/archive`).expect(200);
    await Card.findById(card.id).orFail();

    // Un lector sí desbloquea y suma al contador.
    await w.reader
      .post('/api/access/redeem')
      .send({ token: tokenOf(quizToken.id) })
      .expect(200);
    expect(await UserProgress.countDocuments()).toBe(1);
    const after = await AccessToken.findById(quizToken.id).lean();
    expect(after?.redeemCount).toBe(1);
  });
});

describe('wiki: el equipo ve libros en borrador y entradas en borrador por id', () => {
  it('libro en borrador: wiki abierta para el equipo, 404 para lectores y visitantes; archivado para nadie', async () => {
    const w = await world();
    for (const id of [w.draft.id, w.archived.id]) {
      await Book.updateOne(
        { _id: id },
        { $set: { wikiSections: [{ kind: 'term', title: 'Glosario', order: 1, enabled: true }] } },
      );
    }
    const url = (id: string) => `/api/wiki/sections?bookId=${id}`;
    for (const agent of [w.editor, w.admin]) {
      const { sections } = publicWikiSectionsResponseSchema.parse(
        (await agent.get(url(w.draft.id)).expect(200)).body,
      );
      expect(sections.map((s) => s.kind)).toEqual(['term']);
      expect((await agent.get(url(w.archived.id))).status).toBe(404);
    }
    for (const agent of [w.reader, w.visitor]) {
      expect((await agent.get(url(w.draft.id))).status).toBe(404);
      expect((await agent.get(url(w.archived.id))).status).toBe(404);
    }
  });

  it('una entrada en borrador se abre por id solo para el equipo y no sale en la lista', async () => {
    const w = await world();
    await Book.updateOne(
      { _id: w.published.id },
      { $set: { wikiSections: [{ kind: 'term', title: 'Glosario', order: 1, enabled: true }] } },
    );
    const add = (name: string, status: 'draft' | 'published' | 'archived') =>
      WikiEntry.create({
        bookId: w.published.id,
        kind: 'term',
        slug: normalizeName(name).replace(/[^a-z0-9]+/g, '-'),
        name,
        nameNormalized: normalizeName(name),
        letter: letterOf(name),
        status,
        order: 1,
      } as never);
    const draft = await add('Término borrador', 'draft');
    const archived = await add('Término archivado', 'archived');
    for (const agent of [w.editor, w.admin]) {
      const detail = publicWikiEntryResponseSchema.parse(
        (await agent.get(`/api/wiki/entries/${draft._id}`).expect(200)).body,
      );
      expect(detail.entry.name).toBe('Término borrador');
      expect((await agent.get(`/api/wiki/entries/${archived._id}`)).status).toBe(404);
      const list = await agent
        .get(`/api/wiki/entries?bookId=${w.published.id}&kind=term`)
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain('Término borrador');
    }
    for (const agent of [w.reader, w.visitor]) {
      expect((await agent.get(`/api/wiki/entries/${draft._id}`)).status).toBe(404);
    }
  });
});

describe('lo que juega el equipo no contamina datos reales', () => {
  it('tras jugar, abrir extras y canjear como equipo no hay progreso, vistas ni intentos reales', async () => {
    const w = await world();
    await playQuizToEnd(w.admin, w.upcoming.quizzes[0]!);
    await w.admin.post(`/api/game/${w.upcoming.id}/sessions`).expect(200);
    expect(await UserProgress.countDocuments()).toBe(0);
    expect(await ExtraAccess.countDocuments()).toBe(0);
    expect(await QuizAttempt.countDocuments({ isTest: false })).toBe(0);
    expect(await GameSession.countDocuments({ isTest: false })).toBe(0);
    const attempt = attemptResponseSchema.parse(await playQuizToEnd(w.editor, w.draft.quizzes[0]!));
    expect(attempt.status).toBe('completed');
  });
});
