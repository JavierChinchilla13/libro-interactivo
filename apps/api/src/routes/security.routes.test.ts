import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { staffWorld } from '../test-utils/admin.js';
import { createTestHarness } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const OID = '670000000000000000000001';

describe('piso de seguridad de /api/admin', () => {
  it('cualquier ruta bajo /admin exige sesión y rol, existan o no (no se filtra qué existe)', async () => {
    const { app, reader, editor, admin } = await staffWorld();
    for (const path of ['/api/admin/no-existe', '/api/admin/posts/x/y/z', '/api/admin']) {
      expect((await request(app).get(path)).status, `anónimo ${path}`).toBe(401);
      expect((await reader.get(path)).status, `lectora ${path}`).toBe(403);
      // Con rol suficiente, lo que no existe es un 404 normal.
      expect((await editor.get(path)).status, `editora ${path}`).toBe(404);
      expect((await admin.get(path)).status, `administradora ${path}`).toBe(404);
    }
  });

  it('los métodos que modifican también quedan detrás del piso', async () => {
    const { app, reader } = await staffWorld();
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const path = '/api/admin/no-existe';
      expect((await request(app)[method](path).send({})).status, `${method} anónimo`).toBe(401);
      expect((await reader[method](path).send({})).status, `${method} lectora`).toBe(403);
    }
  });
});

/** Cuerpos hostiles: ninguno puede producir un 500 ni dejar una respuesta sin la forma estándar de error. */
const HOSTILE_BODIES: Record<string, unknown> = {
  vacio: {},
  arreglo: [],
  contaminacionDePrototipo: JSON.parse(
    '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"x":1}}}',
  ),
  operadoresMongo: {
    email: { $ne: null },
    password: { $ne: null },
    token: { $gt: '' },
    bookId: { $ne: '' },
    id: { $where: '1' },
    name: { $regex: '.*' },
    q: { $ne: 'x' },
  },
  tiposEquivocados: {
    email: 123,
    password: ['a', 'b'],
    name: true,
    token: { a: 1 },
    bookId: 5,
    message: null,
    title: [],
    slug: {},
    order: 'uno',
    status: 7,
  },
  textosLargos: {
    email: `${'a'.repeat(5000)}@ejemplo.com`,
    password: 'x'.repeat(10_000),
    name: 'n'.repeat(5000),
    message: 'm'.repeat(20_000),
    title: 't'.repeat(10_000),
    slug: 's'.repeat(2000),
  },
  caracteresRaros: {
    email: 'a\u0000b@ejemplo.com',
    name: '‮evil\u0000',
    message: '😀'.repeat(200) + '́'.repeat(500),
    title: '<script>alert(1)</script>',
    token: '../../etc/passwd',
  },
  profundo: JSON.parse(`${'{"a":'.repeat(60)}1${'}'.repeat(60)}`),
};

const PUBLIC_WRITES = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/contact',
];

const READER_WRITES = [
  '/api/access/redeem',
  '/api/auth/change-password',
  `/api/quizzes/${OID}/attempts`,
  `/api/attempts/${OID}/stages/etapa-1/answers`,
];

const ADMIN_WRITES = [
  '/api/admin/books',
  '/api/admin/quizzes',
  '/api/admin/wiki',
  '/api/admin/posts',
  '/api/admin/fan-arts',
  '/api/admin/reviews',
  '/api/admin/extras',
  '/api/admin/extras/upload-url',
  '/api/admin/users',
  '/api/admin/access-tokens',
  '/api/admin/uploads/image-signature',
  `/api/admin/quizzes/${OID}/publish`,
  `/api/admin/quizzes/${OID}/preview`,
];

function expectSafe(res: { status: number; body: unknown }, label: string) {
  expect(res.status, `${label} → ${res.status}`).toBeLessThan(500);
  if (res.status >= 400) {
    expect(res.body, `${label}: forma de error`).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String) },
    });
  }
}

describe('fuzzing: cuerpos hostiles nunca producen un 500', () => {
  it('endpoints públicos', async () => {
    const { app } = createTestHarness();
    for (const path of PUBLIC_WRITES) {
      for (const [name, body] of Object.entries(HOSTILE_BODIES)) {
        const res = await request(app)
          .post(path)
          .send(body as object);
        expectSafe(res, `${path} [${name}]`);
      }
    }
  });

  it('endpoints de lectora', async () => {
    const { reader } = await staffWorld();
    for (const path of READER_WRITES) {
      for (const [name, body] of Object.entries(HOSTILE_BODIES)) {
        expectSafe(await reader.post(path).send(body as object), `${path} [${name}]`);
      }
    }
    for (const [name, body] of Object.entries(HOSTILE_BODIES)) {
      expectSafe(await reader.patch('/api/me').send(body as object), `PATCH /api/me [${name}]`);
      expectSafe(await reader.delete('/api/me').send(body as object), `DELETE /api/me [${name}]`);
    }
  });

  it('endpoints de administración (con sesión de administradora)', async () => {
    const { admin } = await staffWorld();
    for (const path of ADMIN_WRITES) {
      for (const [name, body] of Object.entries(HOSTILE_BODIES)) {
        expectSafe(await admin.post(path).send(body as object), `POST ${path} [${name}]`);
      }
    }
    for (const path of [
      `/api/admin/books/${OID}`,
      `/api/admin/wiki/${OID}`,
      `/api/admin/posts/${OID}`,
      `/api/admin/fan-arts/${OID}`,
      `/api/admin/reviews/${OID}`,
      `/api/admin/extras/${OID}`,
      `/api/admin/quizzes/${OID}/draft`,
    ]) {
      for (const [name, body] of Object.entries(HOSTILE_BODIES)) {
        expectSafe(await admin.put(path).send(body as object), `PUT ${path} [${name}]`);
      }
    }
    for (const path of [
      `/api/admin/users/${OID}`,
      `/api/admin/contact-messages/${OID}`,
      `/api/admin/quizzes/${OID}`,
      '/api/admin/site-settings',
      '/api/admin/wiki/reorder',
    ]) {
      for (const [name, body] of Object.entries(HOSTILE_BODIES)) {
        expectSafe(await admin.patch(path).send(body as object), `PATCH ${path} [${name}]`);
      }
    }
  });

  it('JSON roto, tipo de contenido incorrecto y cuerpos enormes', async () => {
    const { app } = createTestHarness();
    expectSafe(
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"a":'),
      'JSON roto',
    );
    expectSafe(
      await request(app).post('/api/auth/login').set('Content-Type', 'text/plain').send('hola'),
      'texto plano',
    );
    expectSafe(
      await request(app)
        .post('/api/contact')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ message: 'x'.repeat(300_000) })),
      'cuerpo de 300 kb',
    );
  });
});

describe('fuzzing: parámetros de ruta y de consulta', () => {
  const PATH_JUNK = [
    '%00',
    '..%2f..%2fetc%2fpasswd',
    '%E0%A4%A',
    'a'.repeat(5000),
    '{"$ne":null}',
    '__proto__',
    'constructor',
    '%3Cscript%3E',
  ];

  it('rutas públicas con parámetros basura responden 4xx, nunca 500', async () => {
    const { app } = createTestHarness();
    for (const junk of PATH_JUNK) {
      for (const base of [
        '/api/books/',
        '/api/posts/',
        '/api/wiki/entries/',
        '/api/access/resolve/',
      ]) {
        const res = await request(app).get(`${base}${junk}`);
        expect(res.status, `${base}${junk.slice(0, 20)}`).toBeLessThan(500);
      }
    }
  });

  it('operadores de Mongo y arreglos en la consulta no rompen ni se ejecutan', async () => {
    const { app, reader } = await staffWorld();
    const queries = [
      '?bookId[$ne]=x',
      `?bookId=${OID}&kind[$gt]=`,
      '?q[$regex]=.*',
      '?letter[]=a&letter[]=b',
      '?page[$gt]=0',
      '?pageSize=-1',
      '?category=%00',
      '?status[$ne]=draft',
    ];
    for (const q of queries) {
      for (const base of [
        '/api/wiki/entries',
        '/api/wiki/sections',
        '/api/posts',
        '/api/fan-arts',
        '/api/reviews',
        '/api/books',
        '/api/me/progress',
        '/api/extras',
      ]) {
        const anon = await request(app).get(`${base}${q}`);
        expect(anon.status, `anónimo ${base}${q}`).toBeLessThan(500);
        const own = await reader.get(`${base}${q}`);
        expect(own.status, `lectora ${base}${q}`).toBeLessThan(500);
      }
    }
  });

  it('la administración tampoco se rompe con consultas hostiles', async () => {
    const { admin } = await staffWorld();
    const queries = [
      '?q[$ne]=1',
      '?status[$gt]=',
      '?page=999999999',
      '?pageSize=1e9',
      '?role[]=ADMIN',
    ];
    for (const q of queries) {
      for (const base of [
        '/api/admin/users',
        '/api/admin/contact-messages',
        '/api/admin/posts',
        '/api/admin/wiki',
        '/api/admin/fan-arts',
        '/api/admin/quizzes',
        '/api/admin/access-tokens',
      ]) {
        const res = await admin.get(`${base}${q}`);
        expect(res.status, `${base}${q}`).toBeLessThan(500);
      }
    }
  });
});
