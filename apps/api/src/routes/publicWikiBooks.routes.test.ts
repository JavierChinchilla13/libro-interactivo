import {
  apiErrorSchema,
  publicWikiEntriesResponseSchema,
  publicWikiEntryResponseSchema,
  publicWikiSectionsResponseSchema,
  type PublicWikiItem,
} from '@libro/shared';
import type request from 'supertest';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { letterOf, normalizeName } from '../lib/text.js';
import { Book } from '../models/Book.js';
import { User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;
const NOT_FOUND = 'No encontramos ese libro';

type Status = 'published' | 'upcoming' | 'draft' | 'archived';
interface Section {
  kind: 'character' | 'power_field' | 'place' | 'term';
  title: string;
  enabled?: boolean;
}

/** Mundo de pruebas de la wiki pública: libros en cualquier estado y entradas del libro o de toda la saga. */
async function world() {
  const base = await staffWorld();
  let order = 0;
  const book = async (status: Status, sections: Section[] | 'todas' = 'todas') => {
    order += 1;
    const doc = await Book.create({
      slug: `libro-${order}`,
      title: `[PLACEHOLDER] Libro ${order}`,
      order,
      status,
      cover: image(`c${order}`),
      ...(status === 'upcoming' ? { releaseDate: new Date('2027-03-01T00:00:00Z') } : {}),
    });
    const all: Section[] = [
      { kind: 'character', title: 'Personajes' },
      { kind: 'power_field', title: 'Poderes' },
      { kind: 'place', title: 'Lugares' },
      { kind: 'term', title: 'Glosario' },
    ];
    const list = sections === 'todas' ? all : sections;
    await Book.updateOne(
      { _id: doc._id },
      {
        $set: {
          wikiSections: list.map((section, index) => ({
            order: index + 1,
            enabled: true,
            ...section,
          })),
        },
      },
    );
    return { id: doc._id.toString() };
  };
  const quizOf = async (bookId: string) =>
    (
      await createQuiz({
        bookId,
        order: 1,
        content: simpleContent({ title: 'Quiz 1' }),
        publishedBy: base.adminUser._id,
      })
    )._id.toString();
  /** Una entrada de la wiki; con `bookId: null` es de toda la saga. */
  const add = async (
    over: Record<string, unknown> & { name: string; kind: string; bookId: string | null },
  ) =>
    (await WikiEntry.create({
      slug: normalizeName(over.name).replace(/[^a-z0-9]+/g, '-'),
      nameNormalized: normalizeName(over.name),
      letter: letterOf(over.name),
      status: 'published',
      order: 1,
      ...over,
    } as never)) as unknown as { _id: { toString(): string } };
  /** Bloquea la pestaña `kind` de un libro tras un quiz de ese libro (con mensaje de la autora). Devuelve el quiz. */
  const lockTab = async (bookId: string, kind: Section['kind']) => {
    const quiz = await quizOf(bookId);
    await Book.updateOne(
      { _id: bookId, 'wikiSections.kind': kind },
      {
        $set: {
          'wikiSections.$.unlockAfter': { kind: 'quiz', refId: quiz },
          'wikiSections.$.lockedMessage': '[PLACEHOLDER] Tras el quiz',
        },
      },
    );
    return quiz;
  };
  const readerId = (await User.findOne({ email: 'usuario@ejemplo.com' }).orFail())._id;
  /** El lector completa un quiz de un libro. */
  const complete = (bookId: string, quizId: string) =>
    UserProgress.updateOne(
      { userId: readerId, bookId },
      {
        $set: {
          completed: [
            { kind: 'quiz', refId: quizId, firstCompletedAt: new Date(), currentAttemptId: bookId },
          ],
        },
      },
      { upsert: true },
    );
  return { ...base, book, quizOf, add, lockTab, complete, visitor: supertest(base.app) };
}

const sectionsUrl = (bookId: string) => `/api/wiki/sections?bookId=${bookId}`;
const entriesUrl = (bookId: string, kind: string, extra = '') =>
  `/api/wiki/entries?bookId=${bookId}&kind=${kind}${extra}`;
const names = (items: PublicWikiItem[]) =>
  items.map((item) => (item.locked ? '(bloqueada)' : item.name));
const listOf = async (agent: { get: (url: string) => request.Test }, url: string) =>
  publicWikiEntriesResponseSchema.parse((await agent.get(url).expect(200)).body).entries;

describe('un libro «próximamente» tiene wiki pública', () => {
  it('visitantes, lectores y equipo ven sus pestañas, su lista y el detalle de lo publicado', async () => {
    const w = await world();
    const upcoming = await w.book('upcoming');
    await w.add({ bookId: upcoming.id, kind: 'term', name: 'Término uno' });
    const draft = await w.add({
      bookId: upcoming.id,
      kind: 'term',
      name: 'Borrador',
      status: 'draft',
    });
    const visible = await w.add({
      bookId: upcoming.id,
      kind: 'term',
      name: 'Término dos',
      order: 2,
    });

    for (const agent of [w.visitor, w.reader, w.editor, w.admin]) {
      const res = await agent.get(sectionsUrl(upcoming.id)).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const { sections } = publicWikiSectionsResponseSchema.parse(res.body);
      expect(sections.map((s) => [s.kind, s.locked])).toEqual([
        ['character', false],
        ['power_field', false],
        ['place', false],
        ['term', false],
      ]);
      expect(names(await listOf(agent, entriesUrl(upcoming.id, 'term')))).toEqual([
        'Término uno',
        'Término dos',
      ]);
      const detail = publicWikiEntryResponseSchema.parse(
        (await agent.get(`/api/wiki/entries/${visible._id.toString()}`).expect(200)).body,
      );
      expect(detail.entry.name).toBe('Término dos');
      // El borrador sigue oculto para el público; el equipo lo abre por id (modo prueba) pero no sale en la lista.
      const staff = agent === w.editor || agent === w.admin;
      expect((await agent.get(`/api/wiki/entries/${draft._id.toString()}`)).status).toBe(
        staff ? 200 : 404,
      );
    }
  });

  // CAMBIO (modo prueba del equipo): un libro en borrador ya tiene wiki para el EQUIPO (se prueba antes de publicar);
  // para lectores y visitantes sigue sin existir. El archivado no existe para nadie.
  it('un libro en borrador tiene wiki para el equipo y no para lectores ni visitantes', async () => {
    const w = await world();
    const draft = await w.book('draft');
    const term = await w.add({ bookId: draft.id, kind: 'term', name: 'Término del borrador' });
    for (const agent of [w.editor, w.admin]) {
      await agent.get(sectionsUrl(draft.id)).expect(200);
      expect(names(await listOf(agent, entriesUrl(draft.id, 'term')))).toEqual([
        'Término del borrador',
      ]);
      await agent.get(`/api/wiki/entries/${term._id.toString()}`).expect(200);
    }
    for (const agent of [w.visitor, w.reader]) {
      for (const url of [sectionsUrl(draft.id), entriesUrl(draft.id, 'term')]) {
        const res = await agent.get(url);
        expect(res.status, url).toBe(404);
        expect(apiErrorSchema.parse(res.body).error.message).toBe(NOT_FOUND);
      }
      expect((await agent.get(`/api/wiki/entries/${term._id.toString()}`)).status).toBe(404);
    }
  });

  for (const status of ['archived'] as const) {
    it(`un libro archivado sigue sin wiki para todos, equipo incluido`, async () => {
      const w = await world();
      const hidden = await w.book(status);
      const term = await w.add({ bookId: hidden.id, kind: 'term', name: 'Término oculto' });
      for (const agent of [w.visitor, w.reader, w.editor, w.admin]) {
        for (const url of [sectionsUrl(hidden.id), entriesUrl(hidden.id, 'term')]) {
          const res = await agent.get(url);
          expect(res.status, url).toBe(404);
          expect(apiErrorSchema.parse(res.body).error.message).toBe(NOT_FOUND);
        }
        expect((await agent.get(`/api/wiki/entries/${term._id.toString()}`)).status).toBe(404);
      }
    });
  }

  it('nada se abre por ser «próximamente»: lo que depende de un quiz queda bloqueado con el mensaje de la autora', async () => {
    const w = await world();
    const upcoming = await w.book('upcoming', []);
    const quiz = await w.quizOf(upcoming.id);
    await Book.updateOne(
      { _id: upcoming.id },
      {
        $set: {
          wikiSections: [
            {
              kind: 'character',
              title: 'Personajes',
              order: 1,
              enabled: true,
              unlockAfter: { kind: 'quiz', refId: quiz },
              lockedMessage: '[PLACEHOLDER] Tras el Quiz 1',
              introHtml: '<p>INTRO-SECRETA</p>',
            },
            { kind: 'term', title: 'Glosario', order: 2, enabled: true },
          ],
        },
      },
    );
    const character = await w.add({
      bookId: upcoming.id,
      kind: 'character',
      name: 'Personaje secreto',
    });
    for (const agent of [w.visitor, w.reader]) {
      const res = await agent.get(sectionsUrl(upcoming.id)).expect(200);
      const { sections } = publicWikiSectionsResponseSchema.parse(res.body);
      expect(sections[0]).toEqual({
        kind: 'character',
        title: 'Personajes',
        locked: true,
        lockedMessage: '[PLACEHOLDER] Tras el Quiz 1',
      });
      expect(JSON.stringify(res.body)).not.toContain('INTRO-SECRETA');
      expect(code(await agent.get(entriesUrl(upcoming.id, 'character')))).toBe('NOT_UNLOCKED');
      const detail = await agent.get(`/api/wiki/entries/${character._id.toString()}`);
      expect(detail.status).toBe(403);
      expect(detail.text).not.toContain('Personaje secreto');
    }
    // El equipo lo ve abierto (vista previa), como siempre.
    expect(names(await listOf(w.editor, entriesUrl(upcoming.id, 'character')))).toEqual([
      'Personaje secreto',
    ]);
  });

  it('una entrada con unlockAfter de quiz: bloqueada no entrega nombre ni contenido y «oculta» ni existe; buscar no la revela', async () => {
    const w = await world();
    const upcoming = await w.book('upcoming');
    const quiz = await w.quizOf(upcoming.id);
    const rule = { unlockAfter: { kind: 'quiz', refId: quiz } };
    const shown = await w.add({
      bookId: upcoming.id,
      kind: 'term',
      name: 'Pista bloqueada',
      bodyHtml: '<p>CUERPO-SECRETO</p>',
      ...rule,
      lockedDisplay: 'show',
    });
    const hidden = await w.add({
      bookId: upcoming.id,
      kind: 'term',
      name: 'Pista oculta',
      bodyHtml: '<p>CUERPO-OCULTO</p>',
      ...rule,
      lockedDisplay: 'hide',
    });
    await w.add({ bookId: upcoming.id, kind: 'term', name: 'Pista libre', order: 3 });

    for (const agent of [w.visitor, w.reader]) {
      const res = await agent.get(entriesUrl(upcoming.id, 'term')).expect(200);
      const entries = publicWikiEntriesResponseSchema.parse(res.body).entries;
      expect(names(entries)).toEqual(['(bloqueada)', 'Pista libre']);
      expect(entries[0]).toEqual({
        locked: true,
        id: shown._id.toString(),
        kind: 'term',
        order: 1,
      });
      expect(res.text).not.toMatch(/Pista bloqueada|Pista oculta|CUERPO/);

      const lockedDetail = await agent.get(`/api/wiki/entries/${shown._id.toString()}`);
      expect(lockedDetail.status).toBe(403);
      expect(lockedDetail.text).not.toMatch(/Pista bloqueada|CUERPO/);
      const hiddenDetail = await agent.get(`/api/wiki/entries/${hidden._id.toString()}`);
      expect(hiddenDetail.status).toBe(404);
      expect(hiddenDetail.text).not.toMatch(/Pista oculta|CUERPO/);

      // Buscar por nombre o por letra solo devuelve lo que la persona ya ve.
      for (const extra of ['&q=bloqueada', '&q=oculta', '&letter=P']) {
        const found = await listOf(agent, entriesUrl(upcoming.id, 'term', extra));
        expect(JSON.stringify(found), extra).not.toMatch(/Pista bloqueada|Pista oculta/);
        expect(
          found.every((item) => !item.locked),
          extra,
        ).toBe(true);
      }
      expect(names(await listOf(agent, entriesUrl(upcoming.id, 'term', '&q=libre')))).toEqual([
        'Pista libre',
      ]);
    }
  });
});

describe('entradas de toda la saga (sin libro)', () => {
  it('salen en la wiki de un libro publicado y en la de uno «próximamente», mezcladas con las del libro y en orden', async () => {
    const w = await world();
    const published = await w.book('published');
    const upcoming = await w.book('upcoming');
    await w.add({ bookId: null, kind: 'character', name: 'Beta de la saga', order: 2 });
    await w.add({ bookId: published.id, kind: 'character', name: 'Alfa del libro uno', order: 1 });
    await w.add({ bookId: upcoming.id, kind: 'character', name: 'Gamma del libro dos', order: 3 });
    await w.add({ bookId: null, kind: 'character', name: 'Borrador de la saga', status: 'draft' });

    for (const agent of [w.visitor, w.reader]) {
      // Cada libro ve lo suyo y lo de toda la saga; nunca lo del otro libro.
      expect(names(await listOf(agent, entriesUrl(published.id, 'character')))).toEqual([
        'Alfa del libro uno',
        'Beta de la saga',
      ]);
      expect(names(await listOf(agent, entriesUrl(upcoming.id, 'character')))).toEqual([
        'Beta de la saga',
        'Gamma del libro dos',
      ]);
    }
  });

  for (const status of ['published', 'upcoming'] as const) {
    it(`con un solo libro «${status}» también salen, en la pestaña que les toca por su tipo`, async () => {
      const w = await world();
      const only = await w.book(status);
      await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
      await w.add({ bookId: null, kind: 'place', name: 'Lugar de la saga' });
      await w.add({ bookId: null, kind: 'term', name: 'Término de la saga' });
      expect(names(await listOf(w.visitor, entriesUrl(only.id, 'character')))).toEqual([
        'Personaje de la saga',
      ]);
      expect(names(await listOf(w.visitor, entriesUrl(only.id, 'place')))).toEqual([
        'Lugar de la saga',
      ]);
      expect(names(await listOf(w.visitor, entriesUrl(only.id, 'term')))).toEqual([
        'Término de la saga',
      ]);
      expect(names(await listOf(w.visitor, entriesUrl(only.id, 'power_field')))).toEqual([]);
    });
  }

  it('un campo de toda la saga trae sus poderes en cada libro, y la ficha abre desde cualquiera de los dos', async () => {
    const w = await world();
    const published = await w.book('published');
    const upcoming = await w.book('upcoming');
    const field = await w.add({ bookId: null, kind: 'power_field', name: 'Campo de la saga' });
    const power = await w.add({
      bookId: null,
      kind: 'power',
      name: 'Poder de la saga',
      parentId: field._id,
    });
    for (const bookId of [published.id, upcoming.id]) {
      const [item] = await listOf(w.visitor, entriesUrl(bookId, 'power_field'));
      if (!item || item.locked || !('powers' in item)) throw new Error('Debía haber un campo');
      expect(item.name).toBe('Campo de la saga');
      expect(item.powers?.map((p) => (p.locked ? '(bloqueada)' : p.name))).toEqual([
        'Poder de la saga',
      ]);
    }
    for (const id of [field._id.toString(), power._id.toString()]) {
      for (const agent of [w.visitor, w.reader])
        await agent.get(`/api/wiki/entries/${id}`).expect(200);
    }
  });

  it('buscar y filtrar por letra encuentran las de la saga dentro del libro, y nunca una bloqueada', async () => {
    const w = await world();
    const upcoming = await w.book('upcoming');
    const quiz = await w.quizOf(upcoming.id);
    await w.add({ bookId: null, kind: 'term', name: 'Zafiro de la saga' });
    await w.add({
      bookId: null,
      kind: 'term',
      name: 'Zeta secreta',
      unlockAfter: { kind: 'quiz', refId: quiz },
      lockedDisplay: 'show',
    });
    expect(names(await listOf(w.reader, entriesUrl(upcoming.id, 'term', '&q=zafiro')))).toEqual([
      'Zafiro de la saga',
    ]);
    expect(names(await listOf(w.reader, entriesUrl(upcoming.id, 'term', '&letter=Z')))).toEqual([
      'Zafiro de la saga',
    ]);
    const all = await listOf(w.reader, entriesUrl(upcoming.id, 'term'));
    expect(names(all).sort()).toEqual(['(bloqueada)', 'Zafiro de la saga']);
    expect(JSON.stringify(all)).not.toContain('Zeta secreta');
  });

  it('con una pestaña apagada en un libro y encendida en otro, la de la saga se ve en el que la tiene encendida', async () => {
    const w = await world();
    const off = await w.book('published', [
      { kind: 'character', title: 'Personajes', enabled: false },
      { kind: 'term', title: 'Glosario' },
    ]);
    const on = await w.book('upcoming');
    await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    expect(names(await listOf(w.visitor, entriesUrl(on.id, 'character')))).toEqual([
      'Personaje de la saga',
    ]);
    // En el libro con la pestaña apagada no existe esa pestaña: por ese camino no se abre nada.
    const res = await w.visitor.get(entriesUrl(off.id, 'character'));
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('Personaje de la saga');
  });

  // CAMBIO DE REGLA (19-nov-2026, `wiki-saga-por-libro`). Esta prueba comprobaba «tan estricta como el libro más estricto»:
  // con la pestaña bloqueada en un libro, la entrada de la saga salía bloqueada TAMBIÉN en la wiki del otro. Con los
  // «próximamente» como libros servidos eso bloquearía la wiki de los libros ya publicados por algo que aún no se puede
  // completar. Ahora una entrada de toda la saga se rige por la pestaña del libro que se está viendo: abierta en el libro
  // con la pestaña abierta (cambia lo esperado), y sigue cerrada, sin ningún dato, en el libro con la pestaña bloqueada.
  it('una pestaña bloqueada en otro libro ya NO bloquea la de la saga en este; en el libro bloqueado sigue cerrada', async () => {
    const w = await world();
    const open = await w.book('published');
    const strict = await w.book('upcoming');
    await w.lockTab(strict.id, 'character');
    const saga = await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    for (const agent of [w.visitor, w.reader]) {
      // (antes: bloqueada) En el libro con la pestaña abierta se ve completa.
      expect(names(await listOf(agent, entriesUrl(open.id, 'character')))).toEqual([
        'Personaje de la saga',
      ]);
      // En el libro con la pestaña bloqueada, la pestaña entera da «no desbloqueado» y no sale nada de la entrada.
      const closed = await agent.get(entriesUrl(strict.id, 'character'));
      expect(closed.status).toBe(403);
      expect(closed.text).not.toContain('Personaje de la saga');
      // La ficha: con contexto del libro abierto abre; con el libro bloqueado, sin ningún dato.
      await agent.get(`/api/wiki/entries/${saga._id.toString()}?bookId=${open.id}`).expect(200);
      const detail = await agent.get(
        `/api/wiki/entries/${saga._id.toString()}?bookId=${strict.id}`,
      );
      expect(detail.status).toBe(403);
      expect(detail.text).not.toContain('Personaje de la saga');
    }
    // El equipo la ve abierta en los dos (vista previa).
    expect(names(await listOf(w.editor, entriesUrl(open.id, 'character')))).toEqual([
      'Personaje de la saga',
    ]);
    expect(names(await listOf(w.editor, entriesUrl(strict.id, 'character')))).toEqual([
      'Personaje de la saga',
    ]);
  });

  it('una entrada de la saga con unlockAfter de quiz queda bloqueada para un lector de un libro «próximamente»', async () => {
    const w = await world();
    const upcoming = await w.book('upcoming');
    const quiz = await w.quizOf(upcoming.id);
    const saga = await w.add({
      bookId: null,
      kind: 'place',
      name: 'Lugar de la saga',
      bodyHtml: '<p>CUERPO-SAGA</p>',
      unlockAfter: { kind: 'quiz', refId: quiz },
      lockedDisplay: 'hide',
    });
    for (const agent of [w.visitor, w.reader]) {
      const res = await agent.get(entriesUrl(upcoming.id, 'place')).expect(200);
      expect(publicWikiEntriesResponseSchema.parse(res.body).entries).toEqual([]);
      expect(res.text).not.toMatch(/Lugar de la saga|CUERPO/);
      expect((await agent.get(`/api/wiki/entries/${saga._id.toString()}`)).status).toBe(404);
    }
  });
});

describe('entradas de toda la saga: se rigen por la pestaña del libro que se ve', () => {
  const idOf = (entry: { _id: { toString(): string } }) => entry._id.toString();
  const ficha = (id: string, query = '') => `/api/wiki/entries/${id}${query}`;
  /** Libro 1 publicado con Personajes abierta; Libro 2 «próximamente» con Personajes bloqueada tras un quiz. */
  async function two() {
    const w = await world();
    const one = await w.book('published');
    const two = await w.book('upcoming');
    const quiz = await w.lockTab(two.id, 'character');
    return { ...w, one, two, quiz };
  }

  it('(a)(b) abierta en la lista del Libro 1; en la del Libro 2 la pestaña bloqueada no entrega nada', async () => {
    const w = await two();
    await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    for (const agent of [w.visitor, w.reader]) {
      expect(names(await listOf(agent, entriesUrl(w.one.id, 'character')))).toEqual([
        'Personaje de la saga',
      ]);
      const closed = await agent.get(entriesUrl(w.two.id, 'character'));
      expect(closed.status).toBe(403);
      expect(code(closed)).toBe('NOT_UNLOCKED');
      expect(closed.text).not.toContain('Personaje de la saga');
    }
  });

  it('(c) la ficha abre con contexto del Libro 1, da «no desbloqueado» sin datos con el del Libro 2 y sin contexto rige el Libro 1', async () => {
    const w = await two();
    const saga = await w.add({
      bookId: null,
      kind: 'character',
      name: 'Personaje de la saga',
      bodyHtml: '<p>CUERPO-SAGA</p>',
    });
    for (const agent of [w.visitor, w.reader]) {
      await agent.get(ficha(idOf(saga), `?bookId=${w.one.id}`)).expect(200);
      const closed = await agent.get(ficha(idOf(saga), `?bookId=${w.two.id}`));
      expect(closed.status).toBe(403);
      expect(code(closed)).toBe('NOT_UNLOCKED');
      expect(closed.text).not.toMatch(/Personaje de la saga|CUERPO-SAGA/);
      // Los enlaces ya compartidos, sin libro, siguen abriendo con el criterio por defecto (el primer libro por orden).
      const bare = publicWikiEntryResponseSchema.parse((await agent.get(ficha(idOf(saga)))).body);
      expect(bare.entry.name).toBe('Personaje de la saga');
    }
  });

  it('(c) quien completó el quiz del Libro 2 la abre con el contexto del Libro 2', async () => {
    const w = await two();
    const saga = await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    expect((await w.reader.get(ficha(idOf(saga), `?bookId=${w.two.id}`))).status).toBe(403);
    await w.complete(w.two.id, w.quiz);
    await w.reader.get(ficha(idOf(saga), `?bookId=${w.two.id}`)).expect(200);
    // El visitante, que no lo completó, sigue sin poder.
    expect((await w.visitor.get(ficha(idOf(saga), `?bookId=${w.two.id}`))).status).toBe(403);
  });

  it('(c) sin contexto se rige por el PRIMER libro por orden, no por el más abierto ni el más cerrado', async () => {
    // Libro 1 con Personajes bloqueada y Libro 2 con la pestaña abierta: sin contexto manda el Libro 1 (cerrado).
    const w = await world();
    const first = await w.book('published');
    const second = await w.book('upcoming');
    await w.lockTab(first.id, 'character');
    const saga = await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    expect((await w.reader.get(ficha(idOf(saga)))).status).toBe(403);
    // Con el contexto del libro abierto, sí (es una pestaña abierta que el propio lector puede ver en esa wiki).
    await w.reader.get(ficha(idOf(saga), `?bookId=${second.id}`)).expect(200);
    expect(names(await listOf(w.reader, entriesUrl(second.id, 'character')))).toEqual([
      'Personaje de la saga',
    ]);
  });

  it('(d) un bookId de un libro borrador, archivado o inexistente se ignora: no abre nada más que el criterio por defecto', async () => {
    // Libro 1 (el primero) con la pestaña BLOQUEADA; el borrador y el archivado la tienen ABIERTA: si se les hiciera caso,
    // abriría. No abre.
    const w = await world();
    const first = await w.book('published');
    await w.lockTab(first.id, 'character');
    const draft = await w.book('draft');
    const archived = await w.book('archived');
    const saga = await w.add({
      bookId: null,
      kind: 'character',
      name: 'Personaje de la saga',
      bodyHtml: '<p>CUERPO-SAGA</p>',
    });
    const missing = '6aff00000000000000000001';
    for (const agent of [w.visitor, w.reader]) {
      for (const bookId of [draft.id, archived.id, missing]) {
        const res = await agent.get(ficha(idOf(saga), `?bookId=${bookId}`));
        expect(res.status, bookId).toBe(403);
        expect(res.text).not.toMatch(/Personaje de la saga|CUERPO-SAGA/);
      }
    }
  });

  it('(d) con la regla por defecto abierta, un libro no servido como contexto da lo mismo que no mandar contexto', async () => {
    const w = await world();
    await w.book('published');
    const draft = await w.book('draft');
    const saga = await w.add({ bookId: null, kind: 'character', name: 'Otra de la saga' });
    const sin = await w.visitor.get(ficha(idOf(saga)));
    expect(sin.status).toBe(200);
    const conBorrador = await w.visitor.get(ficha(idOf(saga), `?bookId=${draft.id}`));
    expect(conBorrador.status).toBe(sin.status);
    expect(conBorrador.body).toEqual(sin.body);
  });

  it('(d) no se puede manipular ?bookId=: lo que no es un id da 400 y una forma rara no concede nada', async () => {
    const w = await two();
    const saga = await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    for (const query of ['?bookId=abc', '?bookId=', '?bookId=a&bookId=b']) {
      const res = await w.reader.get(ficha(idOf(saga), query));
      expect(res.status, query).toBe(400);
      expect(res.text).not.toContain('Personaje de la saga');
    }
    // Una forma de lista no se interpreta como contexto: queda sin contexto (criterio por defecto), nunca abre más.
    const bare = await w.reader.get(ficha(idOf(saga)));
    const list = await w.reader.get(ficha(idOf(saga), `?bookId[]=${w.two.id}`));
    expect(list.status).toBe(bare.status);
    expect(list.body).toEqual(bare.body);
  });

  it('(e) una entrada con unlockAfter propio sin cumplir sigue bloqueada en CUALQUIER contexto', async () => {
    const w = await world();
    const one = await w.book('published');
    const two = await w.book('upcoming');
    const quiz = await w.quizOf(one.id);
    const saga = await w.add({
      bookId: null,
      kind: 'term',
      name: 'Pista de la saga',
      bodyHtml: '<p>CUERPO-PISTA</p>',
      unlockAfter: { kind: 'quiz', refId: quiz },
      lockedDisplay: 'show',
    });
    for (const agent of [w.visitor, w.reader]) {
      for (const bookId of [one.id, two.id]) {
        const items = await listOf(agent, entriesUrl(bookId, 'term'));
        expect(items).toEqual([{ locked: true, id: idOf(saga), kind: 'term', order: 1 }]);
        const res = await agent.get(ficha(idOf(saga), `?bookId=${bookId}`));
        expect(res.status, bookId).toBe(403);
        expect(res.text).not.toMatch(/Pista de la saga|CUERPO-PISTA/);
      }
      expect((await agent.get(ficha(idOf(saga)))).status).toBe(403);
    }
    // Al completar el quiz, se abre en cualquier libro cuya pestaña esté abierta.
    await w.complete(one.id, quiz);
    await w.reader.get(ficha(idOf(saga), `?bookId=${two.id}`)).expect(200);
  });

  it('(f) con lockedDisplay «hide» no existe: ni en la lista ni en la ficha, con ningún contexto', async () => {
    const w = await world();
    const one = await w.book('published');
    const two = await w.book('upcoming');
    const quiz = await w.quizOf(one.id);
    const saga = await w.add({
      bookId: null,
      kind: 'term',
      name: 'Pista oculta de la saga',
      unlockAfter: { kind: 'quiz', refId: quiz },
      lockedDisplay: 'hide',
    });
    for (const agent of [w.visitor, w.reader]) {
      for (const bookId of [one.id, two.id]) {
        const res = await agent.get(entriesUrl(bookId, 'term')).expect(200);
        expect(publicWikiEntriesResponseSchema.parse(res.body).entries).toEqual([]);
        expect(res.text).not.toContain('Pista oculta');
        const detail = await agent.get(ficha(idOf(saga), `?bookId=${bookId}`));
        expect(detail.status).toBe(404);
        expect(detail.text).not.toContain('Pista oculta');
      }
      expect((await agent.get(ficha(idOf(saga)))).status).toBe(404);
    }
  });

  it('(g) un campo de toda la saga y sus poderes siguen la misma regla por libro', async () => {
    const w = await world();
    const one = await w.book('published');
    const two = await w.book('upcoming');
    await w.lockTab(two.id, 'power_field');
    const field = await w.add({ bookId: null, kind: 'power_field', name: 'Campo de la saga' });
    const power = await w.add({
      bookId: null,
      kind: 'power',
      name: 'Poder de la saga',
      parentId: field._id,
    });
    for (const agent of [w.visitor, w.reader]) {
      const [item] = await listOf(agent, entriesUrl(one.id, 'power_field'));
      if (!item || item.locked || !('powers' in item)) throw new Error('Debía haber un campo');
      expect(item.powers?.map((p) => (p.locked ? '(bloqueado)' : p.name))).toEqual([
        'Poder de la saga',
      ]);
      const closed = await agent.get(entriesUrl(two.id, 'power_field'));
      expect(closed.status).toBe(403);
      expect(closed.text).not.toMatch(/Campo de la saga|Poder de la saga/);
      for (const id of [idOf(field), idOf(power)]) {
        await agent.get(ficha(id, `?bookId=${one.id}`)).expect(200);
        const res = await agent.get(ficha(id, `?bookId=${two.id}`));
        expect(res.status, id).toBe(403);
        expect(res.text).not.toMatch(/Campo de la saga|Poder de la saga/);
      }
    }
  });

  it('(g) un poder de la saga no se abre si su campo no está abierto en el libro visto', async () => {
    const w = await world();
    const one = await w.book('published');
    const field = await w.add({ bookId: null, kind: 'power_field', name: 'Campo cerrado' });
    const quiz = await w.quizOf(one.id);
    await WikiEntry.updateOne(
      { _id: field._id },
      { $set: { unlockAfter: { kind: 'quiz', refId: quiz }, lockedDisplay: 'show' } },
    );
    const power = await w.add({
      bookId: null,
      kind: 'power',
      name: 'Poder del campo cerrado',
      parentId: field._id,
    });
    for (const agent of [w.visitor, w.reader]) {
      const res = await agent.get(ficha(idOf(power), `?bookId=${one.id}`));
      expect(res.status).toBe(403);
      expect(res.text).not.toContain('Poder del campo cerrado');
    }
  });

  it('(h) las entradas relacionadas respetan el contexto del libro', async () => {
    const w = await two();
    const saga = await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    // Una entrada del Libro 2 (su pestaña de glosario está abierta) que enlaza al personaje de la saga.
    const own = await w.add({
      bookId: w.two.id,
      kind: 'term',
      name: 'Término del Libro 2',
      links: [saga._id],
    });
    for (const agent of [w.visitor, w.reader]) {
      // Visto desde el Libro 1 (Personajes abierta): el relacionado sale abierto.
      const fromOne = publicWikiEntryResponseSchema.parse(
        (await agent.get(ficha(idOf(own), `?bookId=${w.one.id}`)).expect(200)).body,
      );
      expect(fromOne.related.map((r) => (r.locked ? '(bloqueada)' : r.name))).toEqual([
        'Personaje de la saga',
      ]);
      // Visto desde el Libro 2 (Personajes bloqueada): sale como bloqueado, sin nombre.
      const res = await agent.get(ficha(idOf(own), `?bookId=${w.two.id}`)).expect(200);
      const fromTwo = publicWikiEntryResponseSchema.parse(res.body);
      expect(fromTwo.related).toEqual([
        { locked: true, id: idOf(saga), kind: 'character', order: 1 },
      ]);
      expect(JSON.stringify(fromTwo.related)).not.toContain('Personaje de la saga');
    }
  });

  it('(j) una entrada cerrada en TODOS los libros no la lee un lector con ningún contexto ni manipulando bookId', async () => {
    const w = await world();
    const one = await w.book('published');
    const two = await w.book('upcoming');
    await w.lockTab(one.id, 'character');
    await w.lockTab(two.id, 'character');
    const draft = await w.book('draft');
    const saga = await w.add({
      bookId: null,
      kind: 'character',
      name: 'Personaje cerrado',
      bodyHtml: '<p>CUERPO-CERRADO</p>',
    });
    const contexts = [
      '',
      `?bookId=${one.id}`,
      `?bookId=${two.id}`,
      `?bookId=${draft.id}`,
      '?bookId=6aff00000000000000000001',
    ];
    for (const agent of [w.visitor, w.reader]) {
      for (const query of contexts) {
        const res = await agent.get(ficha(idOf(saga), query));
        expect(res.status, query).toBe(403);
        expect(res.text, query).not.toMatch(/Personaje cerrado|CUERPO-CERRADO/);
      }
      for (const bookId of [one.id, two.id]) {
        expect((await agent.get(entriesUrl(bookId, 'character'))).status).toBe(403);
      }
    }
    // El equipo la ve (vista previa).
    await w.editor.get(ficha(idOf(saga), `?bookId=${one.id}`)).expect(200);
  });

  it('las entradas que sí pertenecen a un libro no cambian: las rige su propio libro, sea cual sea el contexto', async () => {
    const w = await two();
    // De un libro cuyo glosario está abierto: abre con cualquier contexto.
    const own = await w.add({ bookId: w.one.id, kind: 'term', name: 'Término del Libro 1' });
    for (const query of ['', `?bookId=${w.one.id}`, `?bookId=${w.two.id}`]) {
      expect((await w.reader.get(ficha(idOf(own), query))).status, query).toBe(200);
    }
    // De un libro cuya pestaña está bloqueada: cerrada con cualquier contexto (no se abre «mirándola» desde el Libro 1).
    const locked = await w.add({
      bookId: w.two.id,
      kind: 'character',
      name: 'Personaje del Libro 2',
    });
    for (const query of ['', `?bookId=${w.one.id}`, `?bookId=${w.two.id}`]) {
      const res = await w.reader.get(ficha(idOf(locked), query));
      expect(res.status, query).toBe(403);
      expect(res.text).not.toContain('Personaje del Libro 2');
    }
  });
});
