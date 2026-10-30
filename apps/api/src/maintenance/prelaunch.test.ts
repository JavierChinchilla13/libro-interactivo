import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../test-utils/db.js';
import { checkPrelaunch, describePrelaunch, maskEmail } from './prelaunch.js';

useTestDb();

const db = () => mongoose.connection.db!;

async function documents(): Promise<number> {
  let total = 0;
  for (const info of await db().listCollections({}, { nameOnly: true }).toArray()) {
    total += await db().collection(info.name).countDocuments({});
  }
  return total;
}

async function seed() {
  await db()
    .collection('books')
    .insertMany([
      {
        slug: 'libro-1',
        title: 'Libro 1',
        status: 'published',
        synopsis: 'Texto normal, por ejemplo este.',
      },
      {
        slug: 'memoria',
        title: 'La Memoria',
        status: 'published',
        synopsis: '<p>Sinopsis real.</p>',
      },
      {
        slug: 'borrador',
        title: 'Libro en preparación',
        status: 'draft',
        synopsis: '[PLACEHOLDER] Sinopsis',
      },
    ]);
  await db()
    .collection('posts')
    .insertOne({ title: 'Evento de ejemplo', slug: 'evento', status: 'published' });
  await db().collection('reviews').insertOne({
    author: 'Lectora',
    text: 'Me gustó, por ejemplo, el final. Más texto de reseña.',
    status: 'published',
  });
  await db()
    .collection('siteSettings')
    .insertOne({
      universe: { headline: '[PLACEHOLDER] Frase del universo' },
      author: { name: 'Autora' },
    });
  await db()
    .collection('users')
    .insertMany([
      {
        email: 'ana@ejemplo.com',
        emailNormalized: 'ana@ejemplo.com',
        name: 'Ana Persona',
        role: 'USER',
        status: 'active',
      },
      {
        email: 'admin@dominio-real.com',
        emailNormalized: 'admin@dominio-real.com',
        name: 'Admin',
        role: 'ADMIN',
        status: 'active',
      },
    ]);
  await db()
    .collection('contactMessages')
    .insertOne({ email: 'visita@example.com', message: 'Hola' });
}

describe('checkPrelaunch', () => {
  it('cuenta lo que hay y marca como visible lo que ya ve el público', async () => {
    await seed();
    const report = await checkPrelaunch(db());
    const books = report.summaries.find((s) => s.collection === 'books');
    expect(books).toMatchObject({ total: 3, visible: 2 });
    expect(report.users).toBe(2);
    expect(report.activeAdmins).toBe(1);
    // Una colección que no existe cuenta cero, sin fallar.
    expect(report.summaries.find((s) => s.collection === 'fanArts')).toMatchObject({
      total: 0,
      visible: 0,
    });
  });

  it('encuentra los textos de muestra y distingue lo visible de lo que es borrador', async () => {
    await seed();
    const { findings } = await checkPrelaunch(db());
    const by = (item: string) => findings.find((f) => f.item === item);
    expect(by('Libro 1')).toMatchObject({
      visible: true,
      matches: expect.arrayContaining(['nombre «Libro 1/2/3»']),
    });
    expect(by('Libro en preparación')).toMatchObject({
      visible: false,
      matches: ['texto [PLACEHOLDER]'],
    });
    expect(by('Evento de ejemplo')).toMatchObject({
      visible: true,
      matches: ['nombre de ejemplo'],
    });
    expect(findings.find((f) => f.collection === 'siteSettings')).toMatchObject({
      visible: true,
      matches: ['texto [PLACEHOLDER]'],
    });
  });

  it('«por ejemplo» en un texto largo no es un aviso, y un libro real no sale', async () => {
    await seed();
    const { findings } = await checkPrelaunch(db());
    expect(findings.find((f) => f.item === 'La Memoria')).toBeUndefined();
    expect(findings.find((f) => f.collection === 'reviews')).toBeUndefined();
    // «Libro 1» tiene «por ejemplo» en la sinopsis: no agrega un aviso de ejemplo por eso.
    expect(findings.find((f) => f.item === 'Libro 1')?.matches).not.toContain('nombre de ejemplo');
  });

  it('enmascara los correos de ejemplo y nunca los repite completos', async () => {
    await seed();
    const report = await checkPrelaunch(db());
    expect(report.exampleEmails).toEqual(
      expect.arrayContaining([
        { collection: 'users', masked: 'a***@ejemplo.com' },
        { collection: 'contactMessages', masked: 'v***@example.com' },
      ]),
    );
    const text =
      JSON.stringify(report) +
      describePrelaunch(report)
        .map((l) => l.text)
        .join('\n');
    expect(text).not.toContain('ana@ejemplo.com');
    expect(text).not.toContain('visita@example.com');
    expect(text).not.toContain('admin@dominio-real.com');
    expect(maskEmail('persona@dominio.com')).toBe('p***@dominio.com');
  });

  it('solo lee: no cambia ningún documento', async () => {
    await seed();
    const before = await documents();
    await checkPrelaunch(db());
    expect(await documents()).toBe(before);
  });

  it('describePrelaunch: ✗ por lo visible y por los correos de ejemplo, ! por los borradores', async () => {
    await seed();
    const lines = describePrelaunch(await checkPrelaunch(db()));
    const failing = lines.filter((l) => l.status === 'fail').map((l) => l.text);
    expect(failing.join('\n')).toMatch(/VISIBLE · Libros: «Libro 1»/);
    expect(failing.join('\n')).toMatch(/correo\(s\) de ejemplo en cuentas/);
    expect(
      lines
        .filter((l) => l.status === 'warn')
        .map((l) => l.text)
        .join('\n'),
    ).toMatch(/borrador · Libros/);
  });

  it('una base limpia pasa: sin avisos y con una administradora', async () => {
    await db()
      .collection('books')
      .insertOne({ slug: 'real', title: 'Memorias Postergadas', status: 'published' });
    await db().collection('users').insertOne({
      email: 'autora@dominio-real.com',
      emailNormalized: 'autora@dominio-real.com',
      role: 'ADMIN',
      status: 'active',
    });
    const lines = describePrelaunch(await checkPrelaunch(db()));
    expect(lines.filter((l) => l.status !== 'ok')).toEqual([]);
    expect(lines.at(-1)?.text).toMatch(/No se encontró contenido de muestra/);
  });

  it('sin ninguna administradora activa falla', async () => {
    const lines = describePrelaunch(await checkPrelaunch(db()));
    expect(lines.some((l) => l.status === 'fail' && /administradora/.test(l.text))).toBe(true);
  });
});
