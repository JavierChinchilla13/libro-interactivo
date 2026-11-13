import { Types } from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AccessToken } from '../models/AccessToken.js';
import { Book } from '../models/Book.js';
import { Card } from '../models/Card.js';
import { Extra } from '../models/Extra.js';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { FanArt } from '../models/FanArt.js';
import { NotificationJob } from '../models/NotificationJob.js';
import { Post } from '../models/Post.js';
import { Quiz } from '../models/Quiz.js';
import { Review } from '../models/Review.js';
import { UserProgress } from '../models/UserProgress.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { staffWorld } from '../test-utils/admin.js';
import { createCard } from '../test-utils/cards.js';
import { fakeImages } from '../test-utils/fakeImages.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook } from '../test-utils/quizFixtures.js';

useTestDb();

/**
 * Archivar, restaurar y eliminar definitivamente (actualizaciones, cartas, extras, fan arts, reseñas y entradas de la
 * wiki): archivar y restaurar son reversibles; eliminar es solo de ADMIN, solo con lo archivado o en borrador, se
 * bloquea si algo depende, y nunca borra imágenes de Cloudinary.
 */
type World = Awaited<ReturnType<typeof staffWorld>>;
const oid = () => new Types.ObjectId();
const image = {
  provider: 'cloudinary',
  publicId: 'libro/demo',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/demo.webp',
  alt: '[PLACEHOLDER] Imagen',
  width: 1200,
  height: 800,
};

const makers = {
  post: (world: World, over: Record<string, unknown> = {}) =>
    Post.create({
      slug: `post-${oid().toString()}`,
      title: '[PLACEHOLDER] Una novedad',
      template: 'text',
      data: {},
      category: 'novedad',
      thumbnail: image,
      status: 'published',
      publishedAt: new Date(),
      authorId: world.adminUser._id,
      ...over,
    }),
  extra: async (world: World, over: Record<string, unknown> = {}) => {
    const found = (await Book.findOne()) ?? (await createBook());
    return Extra.create({
      bookId: found._id,
      slug: `extra-${oid().toString()}`,
      title: '[PLACEHOLDER] Un extra',
      kind: 'text',
      bodyHtml: '<p>[PLACEHOLDER] Texto</p>',
      status: 'published',
      publishedAt: new Date(),
      ...over,
    });
  },
  fanArt: (world: World, over: Record<string, unknown> = {}) =>
    FanArt.create({
      image,
      artistName: '[PLACEHOLDER] Artista',
      permissionConfirmed: true,
      status: 'published',
      createdBy: world.adminUser._id,
      ...over,
    }),
  review: (world: World, over: Record<string, unknown> = {}) =>
    Review.create({
      text: '[PLACEHOLDER] Me encantó.',
      authorName: '[PLACEHOLDER] Lectora',
      status: 'published',
      createdBy: world.adminUser._id,
      ...over,
    }),
  wiki: (_world: World, over: Record<string, unknown> = {}) =>
    WikiEntry.create({
      kind: 'term',
      slug: `termino-${oid().toString()}`,
      name: '[PLACEHOLDER] Término',
      nameNormalized: 'termino',
      letter: 'T',
      status: 'published',
      ...over,
    }),
};

/** Una fila por tipo de contenido: ruta, quién puede archivar y a qué estado vuelve al restaurar. */
const KINDS = [
  {
    name: 'actualización',
    base: '/api/admin/posts',
    make: makers.post,
    restoredTo: 'draft',
    exists: (id: Types.ObjectId) => Post.exists({ _id: id }),
  },
  {
    name: 'fan art',
    base: '/api/admin/fan-arts',
    make: makers.fanArt,
    restoredTo: 'draft',
    exists: (id: Types.ObjectId) => FanArt.exists({ _id: id }),
  },
  {
    name: 'capítulo extra',
    base: '/api/admin/extras',
    make: makers.extra,
    restoredTo: 'draft',
    exists: (id: Types.ObjectId) => Extra.exists({ _id: id }),
  },
  {
    name: 'entrada de la wiki',
    base: '/api/admin/wiki',
    make: makers.wiki,
    restoredTo: 'draft',
    exists: (id: Types.ObjectId) => WikiEntry.exists({ _id: id }),
  },
] as const;

describe.each(KINDS)(
  '$name: archivar, restaurar y eliminar',
  ({ base, make, restoredTo, exists }) => {
    it('archivar y restaurar: los puede hacer un editor, son reversibles y no cambian lo demás', async () => {
      const world = await staffWorld();
      const item = await make(world);
      const archived = await world.editor.post(`${base}/${String(item._id)}/archive`).expect(200);
      expect(archived.body.status).toBe('archived');
      // Archivar dos veces es inocuo.
      await world.editor.post(`${base}/${String(item._id)}/archive`).expect(200);
      const restored = await world.editor.post(`${base}/${String(item._id)}/restore`).expect(200);
      expect(restored.body.status).toBe(restoredTo);
      // Restaurar lo que no está archivado no tiene sentido.
      const again = await world.editor.post(`${base}/${String(item._id)}/restore`);
      expect(again.status).toBe(409);
    });

    it('eliminar: solo ADMIN (sin sesión 401; lector y editor 403) y nada se borra si no puede', async () => {
      const world = await staffWorld();
      const item = await make(world, { status: 'archived' });
      const url = `${base}/${String(item._id)}`;
      expect((await request(world.app).delete(url)).status).toBe(401);
      expect((await world.reader.delete(url)).status).toBe(403);
      expect((await world.editor.delete(url)).status).toBe(403);
      expect(await exists(item._id)).not.toBeNull();
      await world.admin.delete(url).expect(204);
      expect(await exists(item._id)).toBeNull();
    });

    it('eliminar: lo publicado no se elimina (409 que dice que hay que archivarlo primero); un borrador sí', async () => {
      const world = await staffWorld();
      const published = await make(world, { status: 'published' });
      const res = await world.admin.delete(`${base}/${String(published._id)}`);
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/Solo se puede eliminar/);
      expect(res.body.error.message).toMatch(/Archív/);
      expect(await exists(published._id)).not.toBeNull();
      const draft = await make(world, { status: 'draft' });
      await world.admin.delete(`${base}/${String(draft._id)}`).expect(204);
    });

    it('un id que no existe da 404 y uno inválido 400', async () => {
      const world = await staffWorld();
      expect((await world.admin.delete(`${base}/${String(oid())}`)).status).toBe(404);
      expect((await world.admin.post(`${base}/${String(oid())}/archive`)).status).toBe(404);
      expect((await world.admin.delete(`${base}/no-es-un-id`)).status).toBe(400);
    });
  },
);

describe('actualizaciones: bloqueos', () => {
  it('ya se avisó por correo: 409 que lo explica y sugiere archivar; la actualización sigue ahí', async () => {
    const world = await staffWorld();
    const item = await makers.post(world, { status: 'archived' });
    await NotificationJob.collection.insertOne({ kind: 'post', refId: item._id });
    const res = await world.admin.delete(`/api/admin/posts/${String(item._id)}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ya se avisó por correo/);
    expect(res.body.error.message).toMatch(/archivada/);
    expect(await Post.exists({ _id: item._id })).not.toBeNull();
    // Un aviso de otro elemento no la bloquea.
    const other = await makers.post(world, { status: 'archived' });
    await world.admin.delete(`/api/admin/posts/${String(other._id)}`).expect(204);
  });

  it('una programada (publicada con fecha futura) es publicada: primero se archiva', async () => {
    const world = await staffWorld();
    const item = await makers.post(world, { publishedAt: new Date(Date.now() + 86_400_000) });
    expect((await world.admin.delete(`/api/admin/posts/${String(item._id)}`)).status).toBe(409);
    await world.admin.post(`/api/admin/posts/${String(item._id)}/archive`).expect(200);
    await world.admin.delete(`/api/admin/posts/${String(item._id)}`).expect(204);
  });
});

describe('capítulos extra: bloqueos', () => {
  it('ya se avisó por correo o ya lo abrieron lectores: 409 y se conserva', async () => {
    const world = await staffWorld();
    const avisado = await makers.extra(world, { status: 'archived' });
    await NotificationJob.collection.insertOne({ kind: 'extra', refId: avisado._id });
    const res = await world.admin.delete(`/api/admin/extras/${String(avisado._id)}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ya se avisó por correo/);

    const visto = await makers.extra(world, { status: 'archived' });
    await ExtraAccess.create({
      userId: oid(),
      extraId: visto._id,
      bookId: visto.bookId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    const res2 = await world.admin.delete(`/api/admin/extras/${String(visto._id)}`);
    expect(res2.status).toBe(409);
    expect(res2.body.error.message).toMatch(/ya lo abrieron lectores/);
    expect(await Extra.countDocuments()).toBe(2);
  });
});

describe('cartas: archivar, restaurar y eliminar (solo ADMIN en todo)', () => {
  it('archivar y restaurar son de administradores; una carta no tiene borrador (restaurar la publica)', async () => {
    const world = await staffWorld();
    const book = await createBook();
    const card = await createCard({ bookId: book._id, createdBy: world.adminUser._id });
    const url = `/api/admin/cards/${String(card._id)}`;
    expect((await world.editor.post(`${url}/archive`)).status).toBe(403);
    const archived = await world.admin.post(`${url}/archive`).expect(200);
    expect(archived.body.status).toBe('archived');
    const restored = await world.admin.post(`${url}/restore`).expect(200);
    expect(restored.body.status).toBe('published');
    expect((await world.admin.post(`${url}/restore`)).status).toBe(409);
  });

  it('solo se elimina una carta archivada: publicada 409; archivada 204 sin tocar Cloudinary', async () => {
    const fake = fakeImages();
    const world = await staffWorld({ images: fake.provider });
    const book = await createBook();
    const card = await createCard({ bookId: book._id, createdBy: world.adminUser._id });
    const url = `/api/admin/cards/${String(card._id)}`;
    expect((await world.reader.delete(url)).status).toBe(403);
    expect((await world.editor.delete(url)).status).toBe(403);
    const res = await world.admin.delete(url);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/archivada/);
    await world.admin.post(`${url}/archive`).expect(200);
    await world.admin.delete(url).expect(204);
    expect(await Card.exists({ _id: card._id })).toBeNull();
    // Regla vigente: el API nunca borra imágenes de Cloudinary.
    expect(fake.provider.destroy).not.toHaveBeenCalled();
    expect(fake.destroyed).toEqual([]);
  });

  it('una carta ya abierta por lectores no se elimina (409): se les quitaría lo que tienen en su cuenta', async () => {
    const world = await staffWorld();
    const book = await createBook();
    const card = await createCard({
      bookId: book._id,
      createdBy: world.adminUser._id,
      status: 'archived',
    });
    await UserProgress.create({
      userId: oid(),
      bookId: book._id,
      unlocked: [{ kind: 'card', refId: card._id, at: new Date() }],
    });
    const res = await world.admin.delete(`/api/admin/cards/${String(card._id)}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ya la abrieron lectores/);
    expect(await Card.exists({ _id: card._id })).not.toBeNull();
  });

  it('con un QR activo se bloquea (hay que revocarlo); con QR ya revocados se elimina y se van con ella', async () => {
    const world = await staffWorld();
    const book = await createBook();
    const card = await createCard({
      bookId: book._id,
      createdBy: world.adminUser._id,
      status: 'archived',
    });
    const token = (status: 'active' | 'revoked') => ({
      bookId: book._id,
      target: { kind: 'card' as const, refId: card._id },
      tokenHash: oid().toString(),
      label: '[PLACEHOLDER] QR',
      status,
      createdBy: world.adminUser._id,
    });
    await AccessToken.create(token('active'));
    const blocked = await world.admin.delete(`/api/admin/cards/${String(card._id)}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/código QR activo/);
    await AccessToken.updateMany({ 'target.refId': card._id }, { $set: { status: 'revoked' } });
    await AccessToken.create(token('revoked'));
    await world.admin.delete(`/api/admin/cards/${String(card._id)}`).expect(204);
    expect(await AccessToken.countDocuments({ 'target.refId': card._id })).toBe(0);
  });
});

describe('fan arts: la imagen de Cloudinary no se toca', () => {
  it('eliminar uno archivado no llama a Cloudinary', async () => {
    const fake = fakeImages();
    const world = await staffWorld({ images: fake.provider });
    const art = await makers.fanArt(world, { status: 'archived' });
    await world.admin.delete(`/api/admin/fan-arts/${String(art._id)}`).expect(204);
    expect(fake.provider.destroy).not.toHaveBeenCalled();
  });
});

describe('reseñas: archivar es ocultar', () => {
  it('archivar oculta (hidden), restaurar publica, y solo se elimina una archivada', async () => {
    const world = await staffWorld();
    const review = await makers.review(world);
    const url = `/api/admin/reviews/${String(review._id)}`;
    expect((await world.editor.delete(url)).status).toBe(403);
    const blocked = await world.admin.delete(url);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/archivada/);
    const archived = await world.editor.post(`${url}/archive`).expect(200);
    expect(archived.body.status).toBe('hidden');
    // Oculta del público.
    const open = await request(world.app).get('/api/reviews').expect(200);
    expect(JSON.stringify(open.body)).not.toContain('Me encantó');
    const restored = await world.editor.post(`${url}/restore`).expect(200);
    expect(restored.body.status).toBe('published');
    await world.editor.post(`${url}/archive`).expect(200);
    await world.admin.delete(url).expect(204);
    expect(await Review.exists({ _id: review._id })).toBeNull();
  });
});

describe('entradas de la wiki: bloqueos por lo que depende de ellas', () => {
  it('un campo con poderes, o enlazado por otra entrada, no se elimina; sin eso, sí', async () => {
    const world = await staffWorld();
    const field = await makers.wiki(world, {
      kind: 'power_field',
      slug: 'fuego',
      name: '[PLACEHOLDER] Fuego',
      status: 'archived',
    });
    const power = await makers.wiki(world, {
      kind: 'power',
      slug: 'chispa',
      name: '[PLACEHOLDER] Chispa',
      parentId: field._id,
      status: 'archived',
    });
    const res = await world.admin.delete(`/api/admin/wiki/${String(field._id)}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/tiene un poder/);
    await WikiEntry.deleteOne({ _id: power._id });

    const linker = await makers.wiki(world, { links: [field._id], status: 'archived' });
    const res2 = await world.admin.delete(`/api/admin/wiki/${String(field._id)}`);
    expect(res2.status).toBe(409);
    expect(res2.body.error.message).toMatch(/enlaza a esta/);
    await WikiEntry.deleteOne({ _id: linker._id });
    await world.admin.delete(`/api/admin/wiki/${String(field._id)}`).expect(204);
  });

  it('un campo de poder que usa un quiz en un resultado no se elimina (409)', async () => {
    const world = await staffWorld();
    const book = await createBook();
    const field = await makers.wiki(world, {
      kind: 'power_field',
      slug: 'agua',
      name: '[PLACEHOLDER] Agua',
      status: 'archived',
    });
    // Se inserta sin pasar por la validación del modelo: solo importa que un resultado use el campo.
    await Quiz.collection.insertOne({
      bookId: book._id,
      slug: 'quiz-1',
      title: '[PLACEHOLDER] Quiz',
      order: 1,
      status: 'draft',
      draft: { stages: [], results: [{ key: 'r1', fieldSlug: 'agua' }] },
    });
    const res = await world.admin.delete(`/api/admin/wiki/${String(field._id)}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Un quiz usa este campo/);
    expect(await WikiEntry.exists({ _id: field._id })).not.toBeNull();
  });
});

describe('registro de quién borró qué', () => {
  it('queda en el registro del servidor con el administrador, el tipo, el id y el título; nunca correos', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const world = await staffWorld({ logger });
    const item = await makers.post(world, { status: 'archived', title: '[PLACEHOLDER] Prueba' });
    await world.admin.delete(`/api/admin/posts/${String(item._id)}`).expect(204);
    const entry = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((e) => e['audit'] === 'delete');
    expect(entry).toMatchObject({
      audit: 'delete',
      entity: 'post',
      id: String(item._id),
      actorId: String(world.adminUser._id),
      title: '[PLACEHOLDER] Prueba',
    });
    expect(typeof entry?.['time']).toBe('number');
    expect(lines.join('\n')).not.toMatch(/@ejemplo\.com/);
  });
});
