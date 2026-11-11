import {
  CARD_PUBLIC_ID_PATTERN,
  accessTokenResponseSchema,
  adminCardListResponseSchema,
  adminCardSchema,
  apiErrorSchema,
  imageSignatureResponseSchema,
  readerCardSchema,
  readerCardsResponseSchema,
  resolveAccessResponseSchema,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { buildAccessToken } from '../lib/accessToken.js';
import { AccessToken } from '../models/AccessToken.js';
import { Book } from '../models/Book.js';
import { Card } from '../models/Card.js';
import { UserProgress } from '../models/UserProgress.js';
import { createCardService } from '../services/card.service.js';
import { eraseUserData } from '../services/userErasure.service.js';
import { staffWorld } from '../test-utils/admin.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { cardPublicId, createCard } from '../test-utils/cards.js';
import { useTestDb } from '../test-utils/db.js';
import { cardImageAsset, fakeImages } from '../test-utils/fakeImages.js';
import { createBook } from '../test-utils/quizFixtures.js';

useTestDb();

const SECRET = parseEnv({ NODE_ENV: 'test' }).ACCESS_TOKEN_SECRET;
const GENERIC = { error: { code: 'TOKEN_INVALID', message: 'Este código no es válido' } };
const MISSING = '670000000000000000000001';

async function world() {
  const cloud = fakeImages();
  // Con el QR exigido (como en producción): así se comprueba que una carta no abre el libro.
  const w = await staffWorld({ images: cloud.provider, env: { REQUIRE_QR_UNLOCK: 'true' } });
  const book = await createBook();
  /** Sube «a Cloudinary» una imagen válida y devuelve su `publicId`. */
  const upload = (over: Parameters<typeof cardImageAsset>[1] = {}) => {
    const publicId = cardPublicId();
    cloud.set(cardImageAsset(publicId, over));
    return publicId;
  };
  const input = (over: Record<string, unknown> = {}) => ({
    bookId: book._id.toString(),
    title: '[PLACEHOLDER] Carta uno',
    order: 1,
    status: 'published',
    image: { publicId: upload() },
    ...over,
  });
  const create = async (over: Record<string, unknown> = {}) =>
    adminCardSchema.parse(
      (await w.admin.post('/api/admin/cards').send(input(over)).expect(201)).body,
    );
  /** QR de la carta (como lo haría la administradora) y su token para escanearlo. */
  const qr = async (cardId: string) => {
    const created = accessTokenResponseSchema.parse(
      (
        await w.admin
          .post('/api/admin/access-tokens')
          .send({ kind: 'card', refId: cardId })
          .expect(201)
      ).body,
    );
    return { ...created, token: buildAccessToken(created.id, SECRET) };
  };
  return { ...w, cloud, book, upload, input, create, qr };
}

describe('permisos de /api/admin/cards (solo administradoras)', () => {
  it('sin sesión 401; lectora 403; EDITORA 403 (ni siquiera ve la lista); ADMIN permitida', async () => {
    const { app, reader, editor, admin, book, input } = await world();
    const bookId = book._id.toString();
    await request(app).get(`/api/admin/cards?bookId=${bookId}`).expect(401);
    for (const agent of [reader, editor]) {
      expect((await agent.get(`/api/admin/cards?bookId=${bookId}`)).status).toBe(403);
      expect((await agent.post('/api/admin/cards').send(input())).status).toBe(403);
      expect((await agent.get(`/api/admin/cards/${MISSING}`)).status).toBe(403);
      expect((await agent.put(`/api/admin/cards/${MISSING}`).send(input())).status).toBe(403);
      expect(
        (await agent.patch('/api/admin/cards/reorder').send({ bookId, ids: [MISSING] })).status,
      ).toBe(403);
      expect((await agent.post('/api/admin/cards/upload-signature').send({ bookId })).status).toBe(
        403,
      );
    }
    expect(await Card.countDocuments()).toBe(0);
    await admin.get(`/api/admin/cards?bookId=${bookId}`).expect(200);
    await admin.post('/api/admin/cards').send(input()).expect(201);
  });
});

describe('firma de subida: el identificador lo genera el servidor', () => {
  it('cada firma trae un public_id nuevo, aleatorio y no adivinable, en libro/cartas', async () => {
    const { admin, book } = await world();
    const ids = new Set<string>();
    for (let n = 0; n < 5; n += 1) {
      const res = await admin
        .post('/api/admin/cards/upload-signature')
        .send({ bookId: book._id.toString() })
        .expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const signed = imageSignatureResponseSchema.parse(res.body);
      const publicId = signed.params['public_id'] ?? '';
      expect(publicId).toMatch(CARD_PUBLIC_ID_PATTERN);
      // Al menos 20 caracteres aleatorios después de la carpeta.
      expect(publicId.slice('libro/cartas/'.length).length).toBeGreaterThanOrEqual(20);
      expect(signed.maxBytes).toBe(8 * 1024 * 1024);
      ids.add(publicId);
    }
    expect(ids.size).toBe(5);
  });

  it('un libro que no existe da 404 y el cuerpo mal formado, 400', async () => {
    const { admin } = await world();
    expect(
      (await admin.post('/api/admin/cards/upload-signature').send({ bookId: MISSING })).status,
    ).toBe(404);
    expect((await admin.post('/api/admin/cards/upload-signature').send({})).status).toBe(400);
  });
});

describe('crear, editar, ordenar y archivar', () => {
  it('crea una carta: el servidor mide la imagen con Cloudinary y en la base no queda ninguna URL', async () => {
    const { admin, book, input, upload, adminUser } = await world();
    const publicId = upload({ width: 1000, height: 1500, bytes: 900_000, format: 'png' });
    const res = await admin
      .post('/api/admin/cards')
      .send(input({ image: { publicId }, alt: '  Una carta con un dragón  ' }))
      .expect(201);
    const card = adminCardSchema.parse(res.body);
    expect(card).toMatchObject({
      bookId: book._id.toString(),
      title: '[PLACEHOLDER] Carta uno',
      alt: 'Una carta con un dragón',
      status: 'published',
      image: { publicId, width: 1000, height: 1500, bytes: 900_000, format: 'png' },
    });
    // Entrega optimizada y con el ancho acotado.
    expect(card.image.url).toContain('/image/upload/f_auto,q_auto,c_limit,w_480/');
    expect(card.image.url.endsWith(publicId)).toBe(true);
    const stored = await Card.findById(card.id).lean();
    expect(JSON.stringify(stored)).not.toMatch(/https?:\/\//);
    expect(stored?.createdBy.toString()).toBe(adminUser._id.toString());
  });

  it('valida el cuerpo: título vacío, identificador de imagen ajeno o corto, orden y estado', async () => {
    const { admin, input } = await world();
    for (const bad of [
      { title: '   ' },
      { title: 'x'.repeat(121) },
      { image: { publicId: 'libro/quiz-bg/aaaaaaaaaaaaaaaaaaaaaaaa' } },
      { image: { publicId: 'libro/cartas/corto' } },
      { image: { publicId: 'libro/cartas/../quiz-bg/aaaaaaaaaaaaaaaaaaaaaaaa' } },
      { order: 0 },
      { status: 'draft' },
      { bookId: 'no-es-un-id' },
    ]) {
      const res = await admin.post('/api/admin/cards').send(input(bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await Card.countDocuments()).toBe(0);
  });

  it('verifica la imagen en Cloudinary: inexistente, pesada, de otro formato o de tamaño raro se rechazan', async () => {
    const { admin, input, upload } = await world();
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['no existe', { image: { publicId: cardPublicId() } }, /No encontramos esa imagen/],
      [
        'pesa 9 MB',
        { image: { publicId: upload({ bytes: 9 * 1024 * 1024 }) } },
        /pesa 9,0 MB; el máximo es 8 MB/,
      ],
      ['es un gif', { image: { publicId: upload({ format: 'gif' }) } }, /JPG, PNG o WebP/],
      ['muy pequeña', { image: { publicId: upload({ width: 200, height: 400 }) } }, /muy pequeña/],
      ['descomunal', { image: { publicId: upload({ width: 9000, height: 3000 }) } }, /muy grande/],
    ];
    for (const [name, body, message] of cases) {
      const res = await admin.post('/api/admin/cards').send(input(body));
      expect(res.status, name).toBe(400);
      expect(apiErrorSchema.parse(res.body).error.message, name).toMatch(message);
    }
    expect(await Card.countDocuments()).toBe(0);
  });

  it('un libro inexistente da 404 y la misma imagen en dos cartas, 409', async () => {
    const { admin, input, create } = await world();
    expect((await admin.post('/api/admin/cards').send(input({ bookId: MISSING }))).status).toBe(
      404,
    );
    const first = await create();
    const dup = await admin
      .post('/api/admin/cards')
      .send(input({ image: { publicId: first.image.publicId } }));
    expect(dup.status).toBe(409);
    expect(apiErrorSchema.parse(dup.body).error.code).toBe('CONFLICT');
  });

  it('edita título, texto alternativo y estado; cambiar la imagen la vuelve a verificar; no cambia de libro', async () => {
    const { admin, book, input, create, upload, cloud } = await world();
    const card = await create({ alt: 'Alt viejo' });
    const inspected = cloud.provider.inspect as unknown as { mock: { calls: unknown[] } };
    const before = inspected.mock.calls.length;

    // Misma imagen: no se vuelve a consultar a Cloudinary.
    const edited = adminCardSchema.parse(
      (
        await admin
          .put(`/api/admin/cards/${card.id}`)
          .send(
            input({
              title: 'Título nuevo',
              alt: '',
              status: 'archived',
              image: { publicId: card.image.publicId },
            }),
          )
          .expect(200)
      ).body,
    );
    expect(edited).toMatchObject({ title: 'Título nuevo', status: 'archived' });
    expect(edited.alt).toBeUndefined();
    expect(inspected.mock.calls.length).toBe(before);

    // Imagen nueva: se verifica (y una que no cumple se rechaza sin tocar la carta).
    const bad = await admin
      .put(`/api/admin/cards/${card.id}`)
      .send(input({ image: { publicId: upload({ format: 'gif' }) } }));
    expect(bad.status).toBe(400);
    const next = upload({ width: 800, height: 1200 });
    const swapped = adminCardSchema.parse(
      (
        await admin
          .put(`/api/admin/cards/${card.id}`)
          .send(input({ image: { publicId: next } }))
          .expect(200)
      ).body,
    );
    expect(swapped.image).toMatchObject({ publicId: next, width: 800, height: 1200 });
    // El API nunca borra la imagen anterior de Cloudinary.
    expect(cloud.destroyed).toEqual([]);

    const other = await Book.create({ slug: 'otro', title: 'Otro', order: 2, status: 'published' });
    expect(
      (
        await admin
          .put(`/api/admin/cards/${card.id}`)
          .send(input({ bookId: other._id.toString(), image: { publicId: next } }))
      ).status,
    ).toBe(400);
    expect((await admin.put(`/api/admin/cards/${MISSING}`).send(input())).status).toBe(404);
    expect((await admin.get(`/api/admin/cards/${MISSING}`)).status).toBe(404);
    expect(book).toBeDefined();
  });

  it('lista por libro en orden y reordena; una lista que ya cambió responde 409', async () => {
    const { admin, book, create } = await world();
    const a = await create({ title: 'A', order: 1 });
    const b = await create({ title: 'B', order: 2 });
    const c = await create({ title: 'C', order: 3 });
    const bookId = book._id.toString();
    const titles = async () =>
      adminCardListResponseSchema
        .parse((await admin.get(`/api/admin/cards?bookId=${bookId}`).expect(200)).body)
        .cards.map((card) => card.title);
    expect(await titles()).toEqual(['A', 'B', 'C']);

    const reordered = await admin
      .patch('/api/admin/cards/reorder')
      .send({ bookId, ids: [c.id, a.id, b.id] })
      .expect(200);
    expect(
      adminCardListResponseSchema.parse(reordered.body).cards.map((card) => card.title),
    ).toEqual(['C', 'A', 'B']);
    expect(await titles()).toEqual(['C', 'A', 'B']);

    for (const ids of [
      [a.id, b.id],
      [a.id, b.id, c.id, MISSING],
      [a.id, a.id, b.id],
    ]) {
      expect((await admin.patch('/api/admin/cards/reorder').send({ bookId, ids })).status).toBe(
        409,
      );
    }
    expect(await titles()).toEqual(['C', 'A', 'B']);
  });
});

describe('QR de una carta (reutiliza el sistema de QR)', () => {
  it('se crea desde «Códigos QR»: solo el hash en la base, un solo QR activo, se rota y se descarga', async () => {
    const { admin, create, qr, book } = await world();
    const card = await create({ title: '[PLACEHOLDER] La carta secreta' });
    const code = await qr(card.id);
    expect(code).toMatchObject({
      status: 'active',
      target: { kind: 'card', refId: card.id },
      bookId: book._id.toString(),
    });
    expect(code.label).toBe('[PLACEHOLDER] Libro 1 — Carta: [PLACEHOLDER] La carta secreta');
    const stored = await AccessToken.findById(code.id).lean();
    expect(stored?.tokenHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(code.token.split('.')[1]);

    expect(
      (await admin.post('/api/admin/access-tokens').send({ kind: 'card', refId: card.id })).status,
    ).toBe(409);
    expect(
      (await admin.post('/api/admin/access-tokens').send({ kind: 'card', refId: MISSING })).status,
    ).toBe(404);

    const pdf = await admin.get(`/api/admin/access-tokens/${code.id}/qr.pdf`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['cache-control']).toBe('no-store');
    await admin.get(`/api/admin/access-tokens/${code.id}/qr.svg`).expect(200);

    const rotated = await admin.post(`/api/admin/access-tokens/${code.id}/rotate`).expect(201);
    expect(accessTokenResponseSchema.parse(rotated.body).target).toEqual({
      kind: 'card',
      refId: card.id,
    });
  });

  it('antes de iniciar sesión, resolver el QR no revela el título de la carta', async () => {
    const { app, create, qr } = await world();
    const card = await create({ title: '[PLACEHOLDER] El título secreto' });
    const { token } = await qr(card.id);
    const res = await request(app).get(`/api/access/resolve/${token}`).expect(200);
    expect(resolveAccessResponseSchema.parse(res.body)).toEqual({
      valid: true,
      bookTitle: '[PLACEHOLDER] Libro 1',
      kind: 'card',
      title: 'Una carta',
    });
    expect(JSON.stringify(res.body)).not.toContain('secreto');
  });
});

describe('la lectora: solo ve lo que abrió', () => {
  it('sin sesión 401; sin abrir, ninguna carta: ni lista, ni título, ni imagen, ni cuántas hay', async () => {
    const { app, reader, create } = await world();
    const card = await create({ title: '[PLACEHOLDER] No abierta' });
    await request(app).get('/api/cards').expect(401);
    await request(app).get(`/api/cards/${card.id}`).expect(401);

    const list = await reader.get('/api/cards').expect(200);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(readerCardsResponseSchema.parse(list.body)).toEqual({ cards: [], testMode: false });
    expect(list.body).not.toHaveProperty('locked');

    // Una carta que existe y una que no dan EXACTAMENTE lo mismo (no se revela qué cartas existen).
    const real = await reader.get(`/api/cards/${card.id}`);
    const fake = await reader.get(`/api/cards/${MISSING}`);
    expect(real.status).toBe(404);
    expect(real.body).toEqual(fake.body);
    expect(JSON.stringify(real.body)).not.toMatch(/libro\/cartas|cloudinary|No abierta/);
  });

  it('al escanear su QR la carta se abre y queda en la cuenta: lista, vista grande y cabeceras privadas', async () => {
    const { reader, create, qr, book } = await world();
    const card = await create({ title: '[PLACEHOLDER] Abierta', alt: 'Un dragón sobre una torre' });
    const { token } = await qr(card.id);

    const redeemed = await reader.post('/api/access/redeem').send({ token }).expect(200);
    expect(redeemed.body).toMatchObject({
      kind: 'card',
      refId: card.id,
      bookId: book._id.toString(),
      title: '[PLACEHOLDER] Abierta',
      alreadyUnlocked: false,
    });
    // Escanear dos veces es inofensivo.
    expect(
      (await reader.post('/api/access/redeem').send({ token }).expect(200)).body.alreadyUnlocked,
    ).toBe(true);

    const list = await reader.get('/api/cards').expect(200);
    expect(list.headers['cache-control']).toBe('private, no-store');
    const { cards, testMode } = readerCardsResponseSchema.parse(list.body);
    expect(testMode).toBe(false);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: card.id,
      title: '[PLACEHOLDER] Abierta',
      alt: 'Un dragón sobre una torre',
      bookTitle: '[PLACEHOLDER] Libro 1',
    });
    expect(cards[0]?.imageUrl).toContain('/f_auto,q_auto,c_limit,w_480/libro/cartas/');

    const one = await reader.get(`/api/cards/${card.id}`).expect(200);
    expect(one.headers['cache-control']).toBe('private, no-store');
    expect(readerCardSchema.parse(one.body).imageUrl).toContain(
      '/f_auto,q_auto,c_limit,w_1200/libro/cartas/',
    );
  });

  it('sin texto alternativo propio, el alt es el título', async () => {
    const { reader, create, qr } = await world();
    const card = await create({ title: '[PLACEHOLDER] Solo título' });
    await reader
      .post('/api/access/redeem')
      .send({ token: (await qr(card.id)).token })
      .expect(200);
    expect(readerCardSchema.parse((await reader.get(`/api/cards/${card.id}`)).body).alt).toBe(
      '[PLACEHOLDER] Solo título',
    );
  });

  it('se abre en cualquier momento, sin prerrequisitos; una carta de otra lectora no se ve', async () => {
    const { app, create, qr, reader } = await world();
    const card = await create();
    const other = await createUser({ email: 'otra@ejemplo.com' });
    const otherAgent = await loginAgent(app, other.email);
    await otherAgent
      .post('/api/access/redeem')
      .send({ token: (await qr(card.id)).token })
      .expect(200);
    expect(
      readerCardsResponseSchema.parse((await otherAgent.get('/api/cards')).body).cards,
    ).toHaveLength(1);
    // La lectora que no la abrió sigue sin ver nada.
    expect(
      readerCardsResponseSchema.parse((await reader.get('/api/cards')).body).cards,
    ).toHaveLength(0);
    expect((await reader.get(`/api/cards/${card.id}`)).status).toBe(404);
  });

  it('abrir una carta no abre el libro ni cuenta como avance', async () => {
    const { reader, create, qr } = await world();
    const card = await create();
    await reader
      .post('/api/access/redeem')
      .send({ token: (await qr(card.id)).token })
      .expect(200);
    const library = await reader.get('/api/me/library').expect(200);
    expect(library.body.books).toHaveLength(1);
    expect(library.body.books[0].access).toBe('locked');
    const progress = await UserProgress.findOne().lean();
    expect(progress?.completed).toHaveLength(0);
    expect(progress?.unlocked).toHaveLength(1);
  });

  it('un QR revocado o inválido da el mensaje genérico; lo ya abierto se conserva para siempre', async () => {
    const { app, admin, reader, create, qr } = await world();
    const card = await create();
    const code = await qr(card.id);
    await reader.post('/api/access/redeem').send({ token: code.token }).expect(200);
    await admin.post(`/api/admin/access-tokens/${code.id}/revoke`).send({}).expect(200);

    const late = await createUser({ email: 'tarde@ejemplo.com' });
    const lateAgent = await loginAgent(app, late.email);
    for (const token of [
      code.token,
      `${code.token}x`,
      'basura',
      buildAccessToken(MISSING, SECRET),
    ]) {
      const res = await lateAgent.post('/api/access/redeem').send({ token });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(GENERIC);
    }
    expect(
      readerCardsResponseSchema.parse((await lateAgent.get('/api/cards')).body).cards,
    ).toHaveLength(0);
    // La que ya la había abierto la sigue viendo.
    expect(
      readerCardsResponseSchema.parse((await reader.get('/api/cards')).body).cards,
    ).toHaveLength(1);
    expect((await reader.get(`/api/cards/${card.id}`)).status).toBe(200);
  });

  it('una carta archivada deja de abrirse y de verse; al publicarla de nuevo vuelve', async () => {
    const { admin, reader, create, qr, input, app } = await world();
    const card = await create();
    const { token } = await qr(card.id);
    await reader.post('/api/access/redeem').send({ token }).expect(200);
    const archive = (status: string) =>
      admin
        .put(`/api/admin/cards/${card.id}`)
        .send(input({ status, image: { publicId: card.image.publicId } }));
    await archive('archived').then((res) => expect(res.status).toBe(200));

    expect(
      readerCardsResponseSchema.parse((await reader.get('/api/cards')).body).cards,
    ).toHaveLength(0);
    expect((await reader.get(`/api/cards/${card.id}`)).status).toBe(404);
    const fresh = await createUser({ email: 'nueva@ejemplo.com' });
    const freshAgent = await loginAgent(app, fresh.email);
    const res = await freshAgent.post('/api/access/redeem').send({ token });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(GENERIC);

    await archive('published').then((response) => expect(response.status).toBe(200));
    expect(
      readerCardsResponseSchema.parse((await reader.get('/api/cards')).body).cards,
    ).toHaveLength(1);
  });

  it('con el libro sin publicar la carta no sale ni se abre (como lo demás del libro)', async () => {
    const { reader, create, qr, book } = await world();
    const card = await create();
    const { token } = await qr(card.id);
    await reader.post('/api/access/redeem').send({ token }).expect(200);
    await Book.updateOne({ _id: book._id }, { $set: { status: 'draft' } });
    expect(
      readerCardsResponseSchema.parse((await reader.get('/api/cards')).body).cards,
    ).toHaveLength(0);
    expect((await reader.get(`/api/cards/${card.id}`)).status).toBe(404);
    const res = await reader.post('/api/access/redeem').send({ token });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(GENERIC);
  });

  it('orden: por libro y, dentro de cada libro, el de la autora', async () => {
    const { reader, admin, adminUser, book } = await world();
    const second = await Book.create({
      slug: 'libro-2',
      title: '[PLACEHOLDER] Libro 2',
      order: 2,
      status: 'published',
    });
    const c1 = await createCard({
      bookId: second._id,
      createdBy: adminUser._id,
      title: 'L2-A',
      order: 1,
    });
    const c2 = await createCard({
      bookId: book._id,
      createdBy: adminUser._id,
      title: 'L1-B',
      order: 2,
    });
    const c3 = await createCard({
      bookId: book._id,
      createdBy: adminUser._id,
      title: 'L1-A',
      order: 1,
    });
    for (const card of [c1, c2, c3]) {
      const created = accessTokenResponseSchema.parse(
        (
          await admin
            .post('/api/admin/access-tokens')
            .send({ kind: 'card', refId: card._id.toString() })
            .expect(201)
        ).body,
      );
      await reader
        .post('/api/access/redeem')
        .send({ token: buildAccessToken(created.id, SECRET) })
        .expect(200);
    }
    const { cards } = readerCardsResponseSchema.parse((await reader.get('/api/cards')).body);
    expect(cards.map((card) => card.title)).toEqual(['L1-A', 'L1-B', 'L2-A']);
  });
});

describe('administradora en modo prueba', () => {
  it('ve todas las publicadas y puede abrirlas sin QR; la editora no recibe nada', async () => {
    const { admin, editor, create, input } = await world();
    const open = await create({ title: 'Publicada' });
    const hidden = await create({ title: 'Archivada', status: 'archived' });
    const all = readerCardsResponseSchema.parse((await admin.get('/api/cards').expect(200)).body);
    expect(all.testMode).toBe(true);
    expect(all.cards.map((card) => card.title)).toEqual(['Publicada']);
    expect((await admin.get(`/api/cards/${open.id}`)).status).toBe(200);
    expect((await admin.get(`/api/cards/${hidden.id}`)).status).toBe(404);

    // La editora es una lectora más para las cartas.
    expect(readerCardsResponseSchema.parse((await editor.get('/api/cards')).body)).toEqual({
      cards: [],
      testMode: false,
    });
    expect((await editor.get(`/api/cards/${open.id}`)).status).toBe(404);
    expect(input).toBeDefined();
  });
});

describe('la imagen no sale por ningún otro lado', () => {
  it('ni listas públicas, ni libros, ni el mapa del sitio, ni el avance, ni la biblioteca', async () => {
    const { app, reader, admin, create, qr, book } = await world();
    const card = await create();
    await reader
      .post('/api/access/redeem')
      .send({ token: (await qr(card.id)).token })
      .expect(200);
    const publicId = card.image.publicId;
    const urls = [
      '/api/books',
      `/api/books/${book.slug}`,
      '/api/site',
      '/sitemap.xml',
      '/api/sitemap.xml',
      '/api/posts',
      '/api/wiki/entries',
    ];
    for (const url of urls) {
      const res = await request(app).get(url);
      expect(JSON.stringify(res.body) + res.text, url).not.toContain('libro/cartas');
      expect(res.text, url).not.toContain(publicId);
    }
    for (const url of [
      '/api/me',
      '/api/me/library',
      `/api/me/progress?bookId=${book._id.toString()}`,
      '/api/me/results',
    ]) {
      const res = await reader.get(url);
      expect(res.text, url).not.toContain('libro/cartas');
    }
    // Solo el panel de administración conoce el identificador.
    expect((await admin.get(`/api/admin/cards?bookId=${book._id.toString()}`)).text).toContain(
      publicId,
    );
  });
});

describe('cuenta, respaldo y límites del servicio', () => {
  it('borrar la cuenta borra sus cartas abiertas (los desbloqueos)', async () => {
    const { reader, create, qr } = await world();
    const card = await create();
    await reader
      .post('/api/access/redeem')
      .send({ token: (await qr(card.id)).token })
      .expect(200);
    expect(await UserProgress.countDocuments({ 'unlocked.kind': 'card' })).toBe(1);
    const user = await createUser({ email: 'borrar@ejemplo.com' });
    await UserProgress.create({
      userId: user._id,
      bookId: card.bookId,
      unlocked: [{ kind: 'card', refId: card.id, at: new Date() }],
    });
    await eraseUserData(user._id);
    expect(await UserProgress.countDocuments({ userId: user._id })).toBe(0);
    // Las de otra persona no se tocan; la carta en sí tampoco.
    expect(await UserProgress.countDocuments({ 'unlocked.kind': 'card' })).toBe(1);
    expect(await Card.countDocuments()).toBe(1);
  });

  it('con CARDS_SHOW_LOCKED encendido el API dice cuántas faltan (sin títulos ni imágenes); apagado, nada', async () => {
    const { adminUser, book, reader, create, qr } = await world();
    const opened = await create({ title: 'Abierta' });
    await create({ title: 'Secreta A' });
    await create({ title: 'Secreta B' });
    await reader
      .post('/api/access/redeem')
      .send({ token: (await qr(opened.id)).token })
      .expect(200);
    const viewer = {
      userId: (await UserProgress.findOne().lean())?.userId.toString() ?? '',
      role: 'USER' as const,
    };
    const images = fakeImages().provider;
    const on = await createCardService({
      images,
      clock: () => new Date(),
      showLocked: true,
    }).listForReader(viewer);
    expect(on.locked).toBe(2);
    expect(on.cards.map((card) => card.title)).toEqual(['Abierta']);
    expect(JSON.stringify(on)).not.toContain('Secreta');
    const off = await createCardService({
      images,
      clock: () => new Date(),
      showLocked: false,
    }).listForReader(viewer);
    expect(off).not.toHaveProperty('locked');
    expect(adminUser).toBeDefined();
    expect(book).toBeDefined();
  });
});
