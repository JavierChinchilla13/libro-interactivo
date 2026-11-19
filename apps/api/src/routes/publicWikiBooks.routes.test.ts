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
  return { ...base, book, quizOf, add, visitor: supertest(base.app) };
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
      // El borrador sigue oculto, como si no existiera.
      expect((await agent.get(`/api/wiki/entries/${draft._id.toString()}`)).status).toBe(404);
    }
  });

  for (const status of ['draft', 'archived'] as const) {
    it(`un libro ${status === 'draft' ? 'en borrador' : 'archivado'} sigue sin wiki para todos, equipo incluido`, async () => {
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

  it('regla del libro más estricto: si la pestaña está bloqueada en un libro, la de la saga no se abre por ningún camino', async () => {
    const w = await world();
    const open = await w.book('published');
    const strict = await w.book('upcoming', []);
    const quiz = await w.quizOf(strict.id);
    await Book.updateOne(
      { _id: strict.id },
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
            },
          ],
        },
      },
    );
    const saga = await w.add({ bookId: null, kind: 'character', name: 'Personaje de la saga' });
    for (const agent of [w.visitor, w.reader]) {
      // En el libro con la pestaña abierta la entrada de la saga sale bloqueada (sin nombre).
      const items = await listOf(agent, entriesUrl(open.id, 'character'));
      expect(items).toEqual([
        { locked: true, id: saga._id.toString(), kind: 'character', order: 1 },
      ]);
      const detail = await agent.get(`/api/wiki/entries/${saga._id.toString()}`);
      expect(detail.status).toBe(403);
      expect(detail.text).not.toContain('Personaje de la saga');
    }
    // El equipo la ve abierta (vista previa).
    expect(names(await listOf(w.editor, entriesUrl(open.id, 'character')))).toEqual([
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
