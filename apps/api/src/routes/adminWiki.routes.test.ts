import {
  apiErrorSchema,
  wikiEntryResponseSchema,
  wikiListResponseSchema,
  type WikiEntryInputPayload,
  type WikiEntryResponse,
} from '@libro/shared';
import type TestAgent from 'supertest/lib/agent.js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { WikiEntry } from '../models/WikiEntry.js';
import { image, staffWorld, validEntry } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;

async function make(agent: TestAgent, body: WikiEntryInputPayload): Promise<WikiEntryResponse> {
  const res = await agent.post('/api/admin/wiki').send(body).expect(201);
  return wikiEntryResponseSchema.parse(res.body);
}

describe('permisos de /api/admin/wiki', () => {
  it('sin sesión 401, lector 403, EDITOR y ADMIN permitidos', async () => {
    const { app, reader, editor, admin } = await staffWorld();
    await request(app).get('/api/admin/wiki').expect(401);
    expect((await reader.get('/api/admin/wiki')).status).toBe(403);
    expect((await reader.post('/api/admin/wiki').send(validEntry())).status).toBe(403);
    expect(
      (
        await reader
          .patch('/api/admin/wiki/reorder')
          .send({ kind: 'term', ids: ['670000000000000000000001'] })
      ).status,
    ).toBe(403);
    expect(await WikiEntry.countDocuments()).toBe(0);
    await editor.get('/api/admin/wiki').expect(200);
    await admin.post('/api/admin/wiki').send(validEntry()).expect(201);
  });
});

describe('crear y leer entradas', () => {
  it('crea una entrada de cada tipo con su letra y nombre normalizado', async () => {
    const { editor } = await staffWorld();
    const field = await make(
      editor,
      validEntry({ kind: 'power_field', slug: 'campo-1', name: 'Campo Uno' }),
    );
    const power = await make(
      editor,
      validEntry({ kind: 'power', slug: 'poder-1', name: 'Poder Uno', parentId: field.id }),
    );
    const character = await make(
      editor,
      validEntry({
        kind: 'character',
        slug: 'personaje-1',
        name: 'Álvaro',
        fields: [{ label: 'Edad', value: '17' }],
      }),
    );
    const place = await make(
      editor,
      validEntry({
        kind: 'place',
        slug: 'lugar-1',
        name: 'Sala 3',
        group: 'Sala de experimentación',
        links: [character.id],
      }),
    );
    const term = await make(
      editor,
      validEntry({ kind: 'term', slug: 'termino-1', name: '  Éter' }),
    );

    expect(character.letter).toBe('A'); // «Álvaro» → A (sin acento)
    expect(term.letter).toBe('E');
    expect(place.letter).toBe('S');
    expect(power.parentId).toBe(field.id);
    expect(place.links).toEqual([character.id]);
    expect(character.fields).toEqual([{ label: 'Edad', value: '17' }]);
    expect(character.lockedDisplay).toBe('show');
    const stored = await WikiEntry.findById(character.id).lean();
    expect(stored?.nameNormalized).toBe('alvaro');
  });

  it('una entrada que no empieza por letra va a «#»', async () => {
    const { editor } = await staffWorld();
    const entry = await make(editor, validEntry({ name: '3 Hermanas' }));
    expect(entry.letter).toBe('#');
  });

  it('sanea el HTML del cuerpo y rechaza imágenes que no sean de Cloudinary', async () => {
    const { editor } = await staffWorld();
    const res = await editor
      .post('/api/admin/wiki')
      .send(
        validEntry({
          bodyHtml: '<p>Texto</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
          image: image('ficha'),
        }),
      )
      .expect(201);
    expect(JSON.stringify(res.body)).not.toMatch(/<script|javascript:|alert\(1\)/);
    expect(wikiEntryResponseSchema.parse(res.body).bodyHtml).toContain('<p>Texto</p>');

    const external = await editor
      .post('/api/admin/wiki')
      .send(validEntry({ slug: 'otro', image: image('x', { url: 'https://malo.com/a.png' }) }));
    expect(external.status).toBe(400);
  });

  it('GET por id y 404 / 400', async () => {
    const { editor } = await staffWorld();
    const entry = await make(editor, validEntry());
    const got = wikiEntryResponseSchema.parse(
      (await editor.get(`/api/admin/wiki/${entry.id}`).expect(200)).body,
    );
    expect(got.slug).toBe('termino-1');
    expect((await editor.get('/api/admin/wiki/670000000000000000000099')).status).toBe(404);
    expect((await editor.get('/api/admin/wiki/no-es-un-id')).status).toBe(400);
  });
});

describe('reglas de integridad', () => {
  it('un poder sin campo se rechaza; el campo debe existir y ser un campo de poder', async () => {
    const { editor } = await staffWorld();
    const sinCampo = await editor
      .post('/api/admin/wiki')
      .send(validEntry({ kind: 'power', slug: 'p', name: 'Poder' }));
    expect(sinCampo.status).toBe(400);
    expect(code(sinCampo)).toBe('VALIDATION');

    const inexistente = await editor.post('/api/admin/wiki').send(
      validEntry({
        kind: 'power',
        slug: 'p',
        name: 'Poder',
        parentId: '670000000000000000000099',
      }),
    );
    expect(inexistente.status).toBe(400);

    const lugar = await make(editor, validEntry({ kind: 'place', slug: 'l', name: 'Lugar' }));
    const noEsCampo = await editor
      .post('/api/admin/wiki')
      .send(validEntry({ kind: 'power', slug: 'p', name: 'Poder', parentId: lugar.id }));
    expect(noEsCampo.status).toBe(400);
    expect(await WikiEntry.countDocuments({ kind: 'power' })).toBe(0);
  });

  it('solo un poder puede tener campo', async () => {
    const { editor } = await staffWorld();
    const field = await make(editor, validEntry({ kind: 'power_field', slug: 'c', name: 'Campo' }));
    const res = await editor
      .post('/api/admin/wiki')
      .send(validEntry({ kind: 'term', parentId: field.id }));
    expect(res.status).toBe(400);
  });

  it('los enlaces deben existir; una entrada no se enlaza a sí misma', async () => {
    const { editor } = await staffWorld();
    const res = await editor
      .post('/api/admin/wiki')
      .send(validEntry({ kind: 'place', links: ['670000000000000000000099'] }));
    expect(res.status).toBe(400);
    const place = await make(editor, validEntry({ kind: 'place', slug: 'l', name: 'Lugar' }));
    const self = await editor
      .put(`/api/admin/wiki/${place.id}`)
      .send(validEntry({ kind: 'place', slug: 'l', name: 'Lugar', links: [place.id] }));
    expect(self.status).toBe(400);
  });

  it('el slug es único por tipo y libro (se puede repetir en otro tipo)', async () => {
    const { editor } = await staffWorld();
    await make(editor, validEntry({ kind: 'term', slug: 'mismo' }));
    const dup = await editor
      .post('/api/admin/wiki')
      .send(validEntry({ kind: 'term', slug: 'mismo', name: 'Otro' }));
    expect(dup.status).toBe(409);
    expect(code(dup)).toBe('CONFLICT');
    await make(editor, validEntry({ kind: 'place', slug: 'mismo' }));
    const book = await createBook();
    await make(editor, validEntry({ kind: 'term', slug: 'mismo', bookId: book._id.toString() }));
  });

  it('bookId debe existir; el bloqueo debe apuntar a un quiz existente (del libro)', async () => {
    const { editor, adminUser } = await staffWorld();
    expect(
      (
        await editor
          .post('/api/admin/wiki')
          .send(validEntry({ bookId: '670000000000000000000099' }))
      ).status,
    ).toBe(404);

    const book = await createBook();
    const other = await createBook({ slug: 'otro' });
    const quiz = await createQuiz({
      bookId: book._id,
      order: 1,
      content: simpleContent(),
      publishedBy: adminUser._id,
    });
    const body = (refId: string) =>
      validEntry({
        kind: 'character',
        slug: 'p',
        name: 'P',
        bookId: book._id.toString(),
        unlockAfter: { kind: 'quiz', refId },
        lockedDisplay: 'hide',
      });
    expect(
      (await editor.post('/api/admin/wiki').send(body('670000000000000000000099'))).status,
    ).toBe(400);
    const ok = await editor.post('/api/admin/wiki').send(body(quiz._id.toString())).expect(201);
    expect(wikiEntryResponseSchema.parse(ok.body)).toMatchObject({
      lockedDisplay: 'hide',
      unlockAfter: { kind: 'quiz' },
    });
    const wrongBook = await editor
      .post('/api/admin/wiki')
      .send({ ...body(quiz._id.toString()), slug: 'q', bookId: other._id.toString() });
    expect(wrongBook.status).toBe(400);
  });

  it('valida el cuerpo: tipo, slug y nombre', async () => {
    const { editor } = await staffWorld();
    for (const body of [
      { ...validEntry(), kind: 'otro' },
      validEntry({ slug: 'Slug Malo' }),
      validEntry({ name: '' }),
      validEntry({ order: 0 }),
      validEntry({ fields: [{ label: '', value: 'x' }] }),
    ]) {
      expect((await editor.post('/api/admin/wiki').send(body)).status).toBe(400);
    }
  });
});

describe('PUT /api/admin/wiki/:id', () => {
  it('reemplaza la entrada, recalcula la letra y archiva con status', async () => {
    const { editor } = await staffWorld();
    const entry = await make(editor, validEntry({ name: 'Zeta', summary: 'resumen', group: 'g' }));
    expect(entry.letter).toBe('Z');
    const res = await editor
      .put(`/api/admin/wiki/${entry.id}`)
      .send(validEntry({ name: 'Beta', status: 'archived' }))
      .expect(200);
    const updated = wikiEntryResponseSchema.parse(res.body);
    expect(updated).toMatchObject({ name: 'Beta', letter: 'B', status: 'archived' });
    expect(updated.summary).toBeUndefined(); // omitido en el reemplazo = se quita
    expect(await WikiEntry.countDocuments()).toBe(1); // se archiva, no se borra
  });

  it('no permite cambiar el tipo, respeta el slug único y responde 404', async () => {
    const { editor } = await staffWorld();
    const a = await make(editor, validEntry({ slug: 'a', name: 'A' }));
    await make(editor, validEntry({ slug: 'b', name: 'B' }));
    expect(
      (await editor.put(`/api/admin/wiki/${a.id}`).send(validEntry({ slug: 'a', kind: 'place' })))
        .status,
    ).toBe(400);
    expect(
      (await editor.put(`/api/admin/wiki/${a.id}`).send(validEntry({ slug: 'b' }))).status,
    ).toBe(409);
    expect(
      (await editor.put('/api/admin/wiki/670000000000000000000099').send(validEntry())).status,
    ).toBe(404);
  });
});

describe('GET /api/admin/wiki (buscar y filtrar)', () => {
  async function seed(agent: TestAgent) {
    const names = ['Álvaro', 'Ana', 'Beto', 'Éter', '7 Mares'];
    for (const [i, name] of names.entries()) {
      await make(agent, validEntry({ kind: 'term', slug: `t-${i}`, name, order: i + 1 }));
    }
    await make(agent, validEntry({ kind: 'place', slug: 'l', name: 'Alameda' }));
    await make(
      agent,
      validEntry({ kind: 'term', slug: 'borrador', name: 'Aurora', status: 'draft' }),
    );
  }

  it('filtra por tipo y por estado', async () => {
    const { editor } = await staffWorld();
    await seed(editor);
    const names = async (query: Record<string, string>) =>
      wikiListResponseSchema
        .parse((await editor.get('/api/admin/wiki').query(query).expect(200)).body)
        .entries.map((e) => e.name);
    expect(await names({ kind: 'place' })).toEqual(['Alameda']);
    expect(await names({ kind: 'term', status: 'draft' })).toEqual(['Aurora']);
    expect((await names({ kind: 'term' })).length).toBe(6);
  });

  it('busca por nombre sin distinguir acentos ni mayúsculas, y el texto especial no rompe la búsqueda', async () => {
    const { editor } = await staffWorld();
    await seed(editor);
    const names = async (q: string) =>
      wikiListResponseSchema
        .parse((await editor.get('/api/admin/wiki').query({ q }).expect(200)).body)
        .entries.map((e) => e.name)
        .sort();
    expect(await names('alvaro')).toEqual(['Álvaro']);
    expect(await names('ÉTER')).toEqual(['Éter']);
    expect(await names('al')).toEqual(['Alameda', 'Álvaro']);
    expect(await names('.*')).toEqual([]); // se toma literal, no como expresión regular
    expect(await names('(')).toEqual([]);
  });

  it('filtra por letra (el glosario) y agrupa los que no empiezan por letra en «#»', async () => {
    const { editor } = await staffWorld();
    await seed(editor);
    const names = async (letter: string) =>
      wikiListResponseSchema
        .parse(
          (await editor.get('/api/admin/wiki').query({ kind: 'term', letter }).expect(200)).body,
        )
        .entries.map((e) => e.name)
        .sort();
    expect(await names('A')).toEqual(['Ana', 'Aurora', 'Álvaro']);
    expect(await names('E')).toEqual(['Éter']);
    expect(await names('#')).toEqual(['7 Mares']);
    expect((await editor.get('/api/admin/wiki').query({ letter: 'a' })).status).toBe(400);
  });

  it('lista los poderes de un campo (parentId) y los lugares enlazados a un personaje', async () => {
    const { editor } = await staffWorld();
    const field = await make(editor, validEntry({ kind: 'power_field', slug: 'c', name: 'Campo' }));
    const otherField = await make(
      editor,
      validEntry({ kind: 'power_field', slug: 'd', name: 'Otro campo' }),
    );
    await make(
      editor,
      validEntry({ kind: 'power', slug: 'p1', name: 'P1', parentId: field.id, order: 2 }),
    );
    await make(
      editor,
      validEntry({ kind: 'power', slug: 'p2', name: 'P2', parentId: field.id, order: 1 }),
    );
    await make(
      editor,
      validEntry({ kind: 'power', slug: 'p3', name: 'P3', parentId: otherField.id }),
    );
    const res = wikiListResponseSchema.parse(
      (await editor.get('/api/admin/wiki').query({ parentId: field.id }).expect(200)).body,
    );
    expect(res.entries.map((e) => e.name)).toEqual(['P2', 'P1']); // por orden manual
  });
});

describe('PATCH /api/admin/wiki/reorder', () => {
  it('numera las entradas en el orden recibido', async () => {
    const { editor } = await staffWorld();
    const a = await make(editor, validEntry({ slug: 'a', name: 'A', order: 1 }));
    const b = await make(editor, validEntry({ slug: 'b', name: 'B', order: 2 }));
    const c = await make(editor, validEntry({ slug: 'c', name: 'C', order: 3 }));
    const res = await editor
      .patch('/api/admin/wiki/reorder')
      .send({ kind: 'term', ids: [c.id, a.id, b.id] })
      .expect(200);
    const { entries } = wikiListResponseSchema.parse(res.body);
    expect(entries.map((e) => [e.name, e.order])).toEqual([
      ['C', 1],
      ['A', 2],
      ['B', 3],
    ]);
  });

  it('rechaza ids repetidos, inexistentes o de otro tipo o libro', async () => {
    const { editor } = await staffWorld();
    const term = await make(editor, validEntry({ slug: 'a', name: 'A' }));
    const place = await make(editor, validEntry({ kind: 'place', slug: 'l', name: 'L' }));
    const book = await createBook();
    const inBook = await make(
      editor,
      validEntry({ slug: 'z', name: 'Z', bookId: book._id.toString() }),
    );
    for (const body of [
      { kind: 'term', ids: [term.id, term.id] },
      { kind: 'term', ids: [term.id, '670000000000000000000099'] },
      { kind: 'term', ids: [term.id, place.id] },
      { kind: 'term', ids: [term.id, inBook.id] },
      { kind: 'term', ids: [] },
    ]) {
      expect(
        (await editor.patch('/api/admin/wiki/reorder').send(body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    const scoped = await editor
      .patch('/api/admin/wiki/reorder')
      .send({ kind: 'term', bookId: book._id.toString(), ids: [inBook.id] });
    expect(scoped.status).toBe(200);
  });
});
