import {
  apiErrorSchema,
  publicWikiEntriesResponseSchema,
  publicWikiEntryResponseSchema,
  publicWikiSectionsResponseSchema,
} from '@libro/shared';
import type { Types } from 'mongoose';
import request from 'supertest';
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

type Over = Record<string, unknown> & { name: string; kind: string };

/** Libro publicado con 3 quizzes y las 4 pestañas: personajes tras el Quiz 2, poderes tras el Quiz 3, lugares y glosario abiertos. */
async function world(options: { published?: boolean } = {}) {
  const base = await staffWorld();
  const book = await Book.create({
    slug: 'libro-1',
    title: '[PLACEHOLDER] Libro 1',
    order: 1,
    status: options.published === false ? 'draft' : 'published',
    cover: image('c'),
  });
  const quiz = async (order: number) =>
    (
      await createQuiz({
        bookId: book._id,
        order,
        content: simpleContent({ title: `Quiz ${order}` }),
        publishedBy: base.adminUser._id,
      })
    )._id.toString();
  const [q1, q2, q3] = [await quiz(1), await quiz(2), await quiz(3)];
  await Book.updateOne(
    { _id: book._id },
    {
      $set: {
        wikiSections: [
          {
            kind: 'character',
            title: 'Personajes',
            order: 1,
            enabled: true,
            unlockAfter: { kind: 'quiz', refId: q2 },
            lockedMessage: '[PLACEHOLDER] Tras el Quiz 2',
            introHtml: '<p>INTRO-PERSONAJES</p>',
          },
          {
            kind: 'power_field',
            title: 'Poderes',
            order: 2,
            enabled: true,
            unlockAfter: { kind: 'quiz', refId: q3 },
            lockedMessage: '[PLACEHOLDER] Tras el Quiz 3',
          },
          {
            kind: 'place',
            title: 'Lugares',
            order: 3,
            enabled: true,
            introHtml: '<p>Mensaje de lugares</p>',
            mapImage: image('mapa'),
          },
          { kind: 'term', title: 'Glosario', order: 4, enabled: true },
        ],
      },
    },
  );
  const bookId = book._id.toString();
  const add = async (over: Over) => {
    const doc = {
      bookId: book._id,
      slug: normalizeName(over.name).replace(/[^a-z0-9]+/g, '-'),
      nameNormalized: normalizeName(over.name),
      letter: letterOf(over.name),
      status: 'published',
      order: 1,
      ...over,
    };
    return (await WikiEntry.create(doc as never)) as unknown as {
      _id: Types.ObjectId;
      bookId?: Types.ObjectId | null;
    };
  };
  const readerId = (await User.findOne({ email: 'usuario@ejemplo.com' }).orFail())._id;
  const complete = async (...quizIds: string[]) => {
    await UserProgress.updateOne(
      { userId: readerId, bookId: book._id },
      {
        $set: {
          completed: quizIds.map((refId) => ({
            kind: 'quiz',
            refId,
            firstCompletedAt: new Date(),
            currentAttemptId: book._id,
          })),
        },
      },
      { upsert: true },
    );
  };
  return { ...base, book, bookId, q1, q2, q3, add, complete };
}

const entriesUrl = (bookId: string, kind: string, extra = '') =>
  `/api/wiki/entries?bookId=${bookId}&kind=${kind}${extra}`;

describe('GET /api/wiki/sections', () => {
  it('un visitante ve las pestañas con regla bloqueadas, sin introducción ni mapa, y las abiertas completas', async () => {
    const { app, bookId } = await world();
    const res = await request(app).get(`/api/wiki/sections?bookId=${bookId}`).expect(200);
    const { sections } = publicWikiSectionsResponseSchema.parse(res.body);
    expect(sections.map((s) => [s.kind, s.locked])).toEqual([
      ['character', true],
      ['power_field', true],
      ['place', false],
      ['term', false],
    ]);
    expect(sections[0]).toEqual({
      kind: 'character',
      title: 'Personajes',
      locked: true,
      lockedMessage: '[PLACEHOLDER] Tras el Quiz 2',
    });
    expect(sections[2]).toMatchObject({ introHtml: '<p>Mensaje de lugares</p>' });
    expect(sections[2]?.mapImage).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/INTRO-PERSONAJES|unlockAfter/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('se abre solo la pestaña cuyo quiz completó esa persona (el servidor lo recalcula en cada petición)', async () => {
    const { reader, bookId, q2, q1, complete } = await world();
    await complete(q1);
    let body = publicWikiSectionsResponseSchema.parse(
      (await reader.get(`/api/wiki/sections?bookId=${bookId}`).expect(200)).body,
    );
    expect(body.sections.find((s) => s.kind === 'character')?.locked).toBe(true);
    await complete(q1, q2);
    body = publicWikiSectionsResponseSchema.parse(
      (await reader.get(`/api/wiki/sections?bookId=${bookId}`).expect(200)).body,
    );
    const characters = body.sections.find((s) => s.kind === 'character');
    expect(characters).toMatchObject({ locked: false, introHtml: '<p>INTRO-PERSONAJES</p>' });
    expect(characters).not.toHaveProperty('lockedMessage');
    expect(body.sections.find((s) => s.kind === 'power_field')?.locked).toBe(true);
  });

  it('las editoras y administradoras lo ven todo abierto (vista previa)', async () => {
    const { editor, admin, bookId } = await world();
    for (const staff of [editor, admin]) {
      const { sections } = publicWikiSectionsResponseSchema.parse(
        (await staff.get(`/api/wiki/sections?bookId=${bookId}`).expect(200)).body,
      );
      expect(sections.every((s) => !s.locked)).toBe(true);
    }
  });

  it('una pestaña apagada no existe; un libro sin publicar o inexistente da 404; un id inválido, 400', async () => {
    const { app, book, bookId } = await world();
    await Book.updateOne(
      { _id: book._id, 'wikiSections.kind': 'term' },
      { $set: { 'wikiSections.$.enabled': false } },
    );
    const { sections } = publicWikiSectionsResponseSchema.parse(
      (await request(app).get(`/api/wiki/sections?bookId=${bookId}`).expect(200)).body,
    );
    expect(sections.map((s) => s.kind)).not.toContain('term');
    await request(app).get(entriesUrl(bookId, 'term')).expect(404);
    await request(app).get('/api/wiki/sections?bookId=670000000000000000000099').expect(404);
    await request(app).get('/api/wiki/sections?bookId=nope').expect(400);
    await request(app).get('/api/wiki/sections').expect(400);
    await Book.updateOne({ _id: book._id }, { $set: { status: 'draft' } });
    await request(app).get(`/api/wiki/sections?bookId=${bookId}`).expect(404);
  });

  it('un libro antiguo sin el campo de pestañas no rompe: no tiene wiki (sin 500)', async () => {
    const { app, book, bookId } = await world();
    // Libros creados antes de que existieran las pestañas no tienen el campo en la base.
    await Book.collection.updateOne({ _id: book._id }, { $unset: { wikiSections: '' } });
    const res = await request(app).get(`/api/wiki/sections?bookId=${bookId}`).expect(200);
    expect(publicWikiSectionsResponseSchema.parse(res.body).sections).toEqual([]);
    await request(app).get(entriesUrl(bookId, 'term')).expect(404);
  });

  it('una cookie de sesión inválida cuenta como visitante (no da 401)', async () => {
    const { app, bookId } = await world();
    await request(app)
      .get(`/api/wiki/sections?bookId=${bookId}`)
      .set('Cookie', 'libro_at=token-falso')
      .expect(200);
  });
});

describe('GET /api/wiki/entries: pestañas bloqueadas', () => {
  it('pedir el contenido de una pestaña bloqueada da 403 sin ningún dato, por cualquier camino', async () => {
    const { app, reader, bookId, add } = await world();
    await add({ kind: 'character', name: 'Ana Secreta', summary: 'RESUMEN-SECRETO' });
    await add({ kind: 'power_field', name: 'Campo Secreto' });
    for (const agent of [request(app), reader]) {
      for (const kind of ['character', 'power_field']) {
        const res = await agent.get(entriesUrl(bookId, kind));
        expect(res.status).toBe(403);
        expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_UNLOCKED');
        expect(JSON.stringify(res.body)).not.toMatch(/Secret|SECRETO/i);
      }
    }
    // También con búsqueda y filtro por letra: el bloqueo no se salta con filtros.
    const filtered = await request(app).get(entriesUrl(bookId, 'character', '&q=ana&letter=A'));
    expect(filtered.status).toBe(403);
  });

  it('al completar el quiz de la regla, la persona ve las entradas', async () => {
    const { reader, bookId, add, complete, q2 } = await world();
    await add({ kind: 'character', name: 'Ana' });
    await complete(q2);
    const { entries } = publicWikiEntriesResponseSchema.parse(
      (await reader.get(entriesUrl(bookId, 'character')).expect(200)).body,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ locked: false, name: 'Ana' });
  });

  it('una entrada de toda la saga (sin libro) no abre la pestaña bloqueada por consultarla sin libro', async () => {
    const { app, book, add } = await world();
    const entry = await add({ kind: 'character', name: 'Saga Global', bookId: undefined });
    expect(entry.bookId).toBeUndefined();
    const res = await request(app).get(`/api/wiki/entries/${entry._id}`);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('Saga Global');
    // Si el libro deja de estar publicado, la pestaña no existe para nadie.
    await Book.updateOne({ _id: book._id }, { $set: { status: 'draft' } });
    expect((await request(app).get(`/api/wiki/entries/${entry._id}`)).status).toBe(404);
  });
});

describe('entradas de toda la saga con varios libros', () => {
  it('basta que un libro publicado bloquee la pestaña para que la entrada de la saga siga bloqueada', async () => {
    const { app, add } = await world();
    // Un segundo libro publicado que NO bloquea los personajes.
    await Book.create({
      slug: 'libro-2',
      title: '[PLACEHOLDER] Libro 2',
      order: 2,
      status: 'published',
      cover: image('c2'),
      wikiSections: [{ kind: 'character', title: 'Personajes', order: 1, enabled: true }],
    });
    const global = await add({ kind: 'character', name: 'Saga Global', bookId: undefined });
    const res = await request(app).get(`/api/wiki/entries/${global._id}`);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('Saga Global');
  });
});

describe('GET /api/wiki/entries: bloqueo por entrada', () => {
  it('lo bloqueado llega como tarjeta sin datos y lo oculto no llega', async () => {
    const { app, bookId, q1, add } = await world();
    await add({ kind: 'place', name: 'Sala', order: 1 });
    await add({
      kind: 'place',
      name: 'Bóveda Real',
      order: 2,
      unlockAfter: { kind: 'quiz', refId: q1 },
      lockedDisplay: 'show',
      summary: 'RESUMEN-BOVEDA',
      image: image('boveda'),
    });
    await add({
      kind: 'place',
      name: 'Cripta Oculta',
      order: 3,
      unlockAfter: { kind: 'quiz', refId: q1 },
      lockedDisplay: 'hide',
    });
    const res = await request(app).get(entriesUrl(bookId, 'place')).expect(200);
    // Depende de quién pregunta: nunca se guarda en una caché compartida.
    expect(res.headers['cache-control']).toBe('no-store');
    const { entries } = publicWikiEntriesResponseSchema.parse(res.body);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ locked: false, name: 'Sala' });
    expect(Object.keys(entries[1] ?? {}).sort()).toEqual(['id', 'kind', 'locked', 'order']);
    expect(JSON.stringify(res.body)).not.toMatch(/B[óo]veda|Cripta|boveda|cripta|RESUMEN/i);
  });

  it('al completar el quiz de la regla se abren también las ocultas', async () => {
    const { reader, bookId, q1, add, complete } = await world();
    await add({
      kind: 'place',
      name: 'Cripta Oculta',
      unlockAfter: { kind: 'quiz', refId: q1 },
      lockedDisplay: 'hide',
    });
    expect(
      publicWikiEntriesResponseSchema.parse(
        (await reader.get(entriesUrl(bookId, 'place')).expect(200)).body,
      ).entries,
    ).toHaveLength(0);
    await complete(q1);
    const { entries } = publicWikiEntriesResponseSchema.parse(
      (await reader.get(entriesUrl(bookId, 'place')).expect(200)).body,
    );
    expect(entries[0]).toMatchObject({ locked: false, name: 'Cripta Oculta' });
  });

  it('buscar o filtrar por letra no revela entradas bloqueadas: ni su nombre ni que existen', async () => {
    const { app, bookId, q1, add } = await world();
    await add({ kind: 'term', name: 'Alfa' });
    await add({ kind: 'term', name: 'Átomo', order: 2 });
    await add({
      kind: 'term',
      name: 'Zafiro Prohibido',
      order: 3,
      unlockAfter: { kind: 'quiz', refId: q1 },
    });
    const all = publicWikiEntriesResponseSchema.parse(
      (await request(app).get(entriesUrl(bookId, 'term')).expect(200)).body,
    );
    expect(all.entries.map((e) => e.locked)).toEqual([false, false, true]);

    for (const extra of ['&q=zafiro', '&q=ZAFIRO', '&q=prohibido', '&letter=Z']) {
      const res = await request(app)
        .get(entriesUrl(bookId, 'term', extra))
        .expect(200);
      expect(publicWikiEntriesResponseSchema.parse(res.body).entries, extra).toEqual([]);
    }
    // Sin distinguir acentos ni mayúsculas, y solo con lo abierto.
    const found = publicWikiEntriesResponseSchema.parse(
      (
        await request(app)
          .get(entriesUrl(bookId, 'term', '&q=ATOMO'))
          .expect(200)
      ).body,
    );
    expect(found.entries.map((e) => e.locked === false && e.name)).toEqual(['Átomo']);
    const byLetter = publicWikiEntriesResponseSchema.parse(
      (
        await request(app)
          .get(entriesUrl(bookId, 'term', '&letter=A'))
          .expect(200)
      ).body,
    );
    expect(byLetter.entries).toHaveLength(2);
  });

  it('solo se listan las publicadas del libro (o de toda la saga), en el orden manual', async () => {
    const { app, bookId, add } = await world();
    await add({ kind: 'term', name: 'Beta', order: 2 });
    await add({ kind: 'term', name: 'Alfa', order: 1 });
    await add({ kind: 'term', name: 'Borrador', status: 'draft' });
    await add({ kind: 'term', name: 'Archivada', status: 'archived' });
    await add({ kind: 'term', name: 'De otro libro', bookId: '670000000000000000000077' });
    await add({ kind: 'term', name: 'Saga', order: 3, bookId: undefined });
    const { entries } = publicWikiEntriesResponseSchema.parse(
      (await request(app).get(entriesUrl(bookId, 'term')).expect(200)).body,
    );
    expect(entries.map((e) => e.locked === false && e.name)).toEqual(['Alfa', 'Beta', 'Saga']);
  });

  it('no expone la regla de desbloqueo, los enlaces ni la forma de mostrar lo bloqueado', async () => {
    const { app, bookId, q1, add } = await world();
    await add({ kind: 'term', name: 'Con regla', unlockAfter: { kind: 'quiz', refId: q1 } });
    await add({ kind: 'term', name: 'Abierta', order: 2, links: [q1] });
    const text = JSON.stringify(
      (await request(app).get(entriesUrl(bookId, 'term')).expect(200)).body,
    );
    expect(text).not.toMatch(/unlockAfter|lockedDisplay|links|nameNormalized|status|bookId/);
  });
});

describe('GET /api/wiki/entries/:entryId', () => {
  it('una entrada abierta entrega su ficha con los datos y el texto', async () => {
    const { app, add } = await world();
    const entry = await add({
      kind: 'place',
      name: 'Sala',
      group: 'Sala de experimentación',
      summary: 'Un lugar',
      bodyHtml: '<p>Texto</p>',
      fields: [{ label: 'Piso', value: '3' }],
      image: image('sala'),
    });
    const res = await request(app).get(`/api/wiki/entries/${entry._id}`).expect(200);
    const body = publicWikiEntryResponseSchema.parse(res.body);
    expect(body.entry).toMatchObject({
      name: 'Sala',
      group: 'Sala de experimentación',
      bodyHtml: '<p>Texto</p>',
      fields: [{ label: 'Piso', value: '3' }],
    });
    expect(body.related).toEqual([]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('bloqueada con aviso = 403 sin datos; oculta, borrador, archivada e inexistente = 404 idénticos', async () => {
    const { app, q1, add } = await world();
    const locked = await add({
      kind: 'term',
      name: 'Zafiro',
      summary: 'RESUMEN-SECRETO',
      unlockAfter: { kind: 'quiz', refId: q1 },
    });
    const hidden = await add({
      kind: 'term',
      name: 'Cripta',
      unlockAfter: { kind: 'quiz', refId: q1 },
      lockedDisplay: 'hide',
    });
    const draft = await add({ kind: 'term', name: 'Borrador', status: 'draft' });
    const archived = await add({ kind: 'term', name: 'Vieja', status: 'archived' });

    const res403 = await request(app).get(`/api/wiki/entries/${locked._id}`);
    expect(res403.status).toBe(403);
    expect(apiErrorSchema.parse(res403.body).error.code).toBe('NOT_UNLOCKED');
    expect(JSON.stringify(res403.body)).not.toMatch(/Zafiro|SECRETO/);

    const missing = await request(app).get('/api/wiki/entries/670000000000000000000099');
    expect(missing.status).toBe(404);
    for (const id of [hidden._id, draft._id, archived._id]) {
      const res = await request(app).get(`/api/wiki/entries/${id}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(missing.body);
    }
    await request(app).get('/api/wiki/entries/no-es-un-id').expect(400);
  });

  it('una entrada sin regla propia dentro de una pestaña bloqueada también da 403', async () => {
    const { app, reader, add, q2, complete } = await world();
    const entry = await add({ kind: 'character', name: 'Ana', bodyHtml: '<p>BIO-SECRETA</p>' });
    for (const agent of [request(app), reader]) {
      const res = await agent.get(`/api/wiki/entries/${entry._id}`);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toMatch(/Ana|BIO-SECRETA/);
    }
    await complete(q2);
    const ok = await reader.get(`/api/wiki/entries/${entry._id}`).expect(200);
    expect(publicWikiEntryResponseSchema.parse(ok.body).entry.name).toBe('Ana');
  });

  it('las relacionadas: abiertas con datos, bloqueadas como tarjeta sin datos y ocultas sin aparecer', async () => {
    const { app, q1, add } = await world();
    const ana = await add({ kind: 'character', name: 'Ana Reservada' });
    const boveda = await add({
      kind: 'place',
      name: 'Bóveda Real',
      unlockAfter: { kind: 'quiz', refId: q1 },
    });
    const cripta = await add({
      kind: 'place',
      name: 'Cripta Oculta',
      unlockAfter: { kind: 'quiz', refId: q1 },
      lockedDisplay: 'hide',
    });
    const alfa = await add({ kind: 'term', name: 'Alfa' });
    const sala = await add({
      kind: 'place',
      name: 'Sala',
      links: [ana._id, boveda._id, cripta._id, alfa._id],
    });
    const res = await request(app).get(`/api/wiki/entries/${sala._id}`).expect(200);
    const { related } = publicWikiEntryResponseSchema.parse(res.body);
    // Ana está en una pestaña bloqueada → tarjeta bloqueada; Bóveda por su regla; Cripta no aparece.
    expect(related.map((r) => [r.kind, r.locked])).toEqual([
      ['character', true],
      ['place', true],
      ['term', false],
    ]);
    expect(related[2]).toMatchObject({ name: 'Alfa' });
    expect(JSON.stringify(res.body)).not.toMatch(/Ana|B[óo]veda|Cripta/);
  });

  it('los enlaces a entradas sin publicar no aparecen', async () => {
    const { app, add } = await world();
    const draft = await add({ kind: 'term', name: 'Borrador', status: 'draft' });
    const sala = await add({ kind: 'place', name: 'Sala', links: [draft._id] });
    const res = await request(app).get(`/api/wiki/entries/${sala._id}`).expect(200);
    expect(publicWikiEntryResponseSchema.parse(res.body).related).toEqual([]);
  });

  it('las editoras ven también lo bloqueado y lo oculto (vista previa), pero no un borrador', async () => {
    const { editor, q1, add } = await world();
    const hidden = await add({
      kind: 'character',
      name: 'Cripta',
      unlockAfter: { kind: 'quiz', refId: q1 },
      lockedDisplay: 'hide',
    });
    const draft = await add({ kind: 'term', name: 'Borrador', status: 'draft' });
    await editor.get(`/api/wiki/entries/${hidden._id}`).expect(200);
    await editor.get(`/api/wiki/entries/${draft._id}`).expect(404);
  });
});

describe('poderes dentro de su campo', () => {
  it('cada campo trae sus poderes; un poder con regla propia llega bloqueado y sin datos', async () => {
    const { reader, bookId, q1, q3, add, complete } = await world();
    const campo = await add({ kind: 'power_field', name: 'Campo A', order: 1 });
    await add({ kind: 'power', name: 'Poder Uno', parentId: campo._id, order: 1 });
    await add({
      kind: 'power',
      name: 'Poder Secreto',
      parentId: campo._id,
      order: 2,
      unlockAfter: { kind: 'quiz', refId: q1 },
    });
    await add({
      kind: 'power',
      name: 'Poder Oculto',
      parentId: campo._id,
      order: 3,
      unlockAfter: { kind: 'quiz', refId: q1 },
      lockedDisplay: 'hide',
    });
    await complete(q3);
    const res = await reader.get(entriesUrl(bookId, 'power_field')).expect(200);
    const { entries } = publicWikiEntriesResponseSchema.parse(res.body);
    const field = entries[0];
    expect(field).toMatchObject({ locked: false, name: 'Campo A' });
    const powers = field && !field.locked ? (field.powers ?? []) : [];
    expect(powers.map((p) => (p.locked ? 'bloqueado' : p.name))).toEqual([
      'Poder Uno',
      'bloqueado',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/Secreto|Oculto/);
  });

  it('si el campo está bloqueado por su regla, no se entregan ni sus poderes; y el poder suelto da 403', async () => {
    const { reader, bookId, q1, q3, add, complete } = await world();
    const campo = await add({
      kind: 'power_field',
      name: 'Campo Reservado',
      unlockAfter: { kind: 'quiz', refId: q1 },
    });
    const poder = await add({ kind: 'power', name: 'Poder Interno', parentId: campo._id });
    await complete(q3);
    const res = await reader.get(entriesUrl(bookId, 'power_field')).expect(200);
    const { entries } = publicWikiEntriesResponseSchema.parse(res.body);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.locked).toBe(true);
    expect(entries[0]).not.toHaveProperty('powers');
    expect(JSON.stringify(res.body)).not.toMatch(/Reservado|Interno/);
    const direct = await reader.get(`/api/wiki/entries/${poder._id}`);
    expect(direct.status).toBe(403);
    expect(JSON.stringify(direct.body)).not.toContain('Poder Interno');
    // Cumplida la regla del campo, el poder se abre.
    await complete(q1, q3);
    await reader.get(`/api/wiki/entries/${poder._id}`).expect(200);
  });

  it('un poder cuyo campo no está publicado no se entrega', async () => {
    const { reader, q3, add, complete } = await world();
    const campo = await add({ kind: 'power_field', name: 'Campo Viejo', status: 'archived' });
    const poder = await add({ kind: 'power', name: 'Poder Huérfano', parentId: campo._id });
    await complete(q3);
    await reader.get(`/api/wiki/entries/${poder._id}`).expect(404);
  });
});
