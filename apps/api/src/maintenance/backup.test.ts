import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContactMessage } from '../models/ContactMessage.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { createUser } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import {
  assertOutsideRepo,
  assertSafeRestoreTarget,
  backupFolderName,
  exportDatabase,
  readManifest,
  redactUri,
  restoreDatabase,
  verifyBackup,
} from './backup.js';

useTestDb();

// La base de destino es otra (la de pruebas se vacía sola, esta no): cada prueba parte de cero.
beforeEach(async () => {
  await mongoose.connection.useDb('libro-prueba-copia').db!.dropDatabase();
});

const { EJSON } = mongoose.mongo.BSON;
const NOW = new Date('2026-10-29T15:07:00Z');
const tempFolder = () => mkdtempSync(join(tmpdir(), 'respaldo-prueba-'));
const copyDb = () => mongoose.connection.useDb('libro-prueba-copia').db!;
const sourceDb = () => mongoose.connection.db!;

/** Un mundo con tipos variados: ObjectId, fechas, anidados, índices únicos y los datos que NO deben respaldarse. */
async function populate() {
  const reader = await createUser({ email: 'lectora@ejemplo.com' });
  const book = await createBook();
  await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Uno' }),
    publishedBy: reader._id,
  });
  await ContactMessage.create({
    name: 'Ana',
    email: 'ana@ejemplo.com',
    message: 'Hola ñandú 😀',
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  });
  await RefreshToken.create({
    userId: reader._id,
    tokenHash: 'huella-de-sesion',
    familyId: 'f1',
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  });
  await PasswordReset.create({
    userId: reader._id,
    tokenHash: 'huella-de-enlace',
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  });
  return { reader, book };
}

const canonical = async (db: ReturnType<typeof sourceDb>, name: string) =>
  (await db.collection(name).find({}).sort({ _id: 1 }).toArray()).map((doc) =>
    EJSON.stringify(doc, { relaxed: false }),
  );

describe('respaldo y restauración', () => {
  it('exporta cada colección con su conteo, su huella y sus índices, sin las sesiones ni los enlaces', async () => {
    await populate();
    const folder = tempFolder();
    const manifest = await exportDatabase(sourceDb(), folder, NOW);

    expect(manifest).toMatchObject({ format: 1, createdAt: NOW.toISOString() });
    expect(manifest.database).toBe(sourceDb().databaseName);
    expect(manifest.excluded).toEqual(['refreshTokens', 'passwordResets']);
    const names = manifest.collections.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['users', 'books', 'quizzes', 'contactMessages']));
    expect(names).not.toContain('refreshTokens');
    expect(names).not.toContain('passwordResets');

    const users = manifest.collections.find((c) => c.name === 'users');
    expect(users?.count).toBe(1);
    // El índice único del correo viaja en el manifiesto.
    expect(users?.indexes.some((i) => i.unique && 'emailNormalized' in i.key)).toBe(true);
    // La huella del manifiesto es la del archivo.
    const file = join(folder, users?.file ?? '');
    expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(users?.sha256);
    expect(readdirSync(folder)).toContain('manifiesto.json');
    // La sesión y el enlace de recuperación no quedaron en ningún archivo.
    expect(readdirSync(folder).join(' ')).not.toMatch(/refreshTokens|passwordResets/);
  });

  it('con --con-sesiones sí las incluye', async () => {
    await populate();
    const manifest = await exportDatabase(sourceDb(), tempFolder(), NOW, { includeSessions: true });
    expect(manifest.collections.map((c) => c.name)).toEqual(
      expect.arrayContaining(['refreshTokens', 'passwordResets']),
    );
    expect(manifest.excluded).toEqual([]);
  });

  it('exportar y restaurar en otra base deja los mismos documentos, con sus tipos, y los mismos índices', async () => {
    await populate();
    const folder = tempFolder();
    const manifest = await exportDatabase(sourceDb(), folder, NOW);

    const target = copyDb();
    const report = await restoreDatabase(target, folder);
    expect(report.ok).toBe(true);
    expect(report.database).toBe('libro-prueba-copia');
    for (const entry of manifest.collections) {
      expect(await canonical(target, entry.name), entry.name).toEqual(
        await canonical(sourceDb(), entry.name),
      );
    }
    // Los índices únicos se recrearon: no deja duplicar un correo.
    const user = (await target.collection('users').findOne({})) as unknown as {
      emailNormalized: string;
    };
    await expect(
      target.collection('users').insertOne({ emailNormalized: user.emailNormalized }),
    ).rejects.toThrow(/duplicate key/i);
    // Los tipos sobreviven (fecha y ObjectId, no texto).
    const message = (await target.collection('contactMessages').findOne({})) as {
      _id: unknown;
      expiresAt: unknown;
      message: string;
    };
    expect(message.expiresAt).toBeInstanceOf(Date);
    expect(message._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(message.message).toBe('Hola ñandú 😀');
  });

  it('se niega a mezclar con una base que ya tiene datos, salvo que se pida vaciarla', async () => {
    await populate();
    const folder = tempFolder();
    await exportDatabase(sourceDb(), folder, NOW);
    const target = copyDb();
    await restoreDatabase(target, folder);

    await expect(restoreDatabase(target, folder)).rejects.toThrow(/ya tiene datos/);
    const again = await restoreDatabase(target, folder, { empty: true });
    expect(again.ok).toBe(true);
    expect(await target.collection('users').countDocuments({})).toBe(1);
  });

  it('verifyBackup detecta un archivo alterado, uno que falta y un conteo que no coincide', async () => {
    await populate();
    const folder = tempFolder();
    const manifest = await exportDatabase(sourceDb(), folder, NOW);
    expect((await verifyBackup(folder)).problems).toEqual([]);

    const users = manifest.collections.find((c) => c.name === 'users');
    appendFileSync(join(folder, users?.file ?? ''), Buffer.from('basura'));
    const tampered = await verifyBackup(folder);
    expect(tampered.problems).toEqual([
      { collection: 'users', problem: expect.stringMatching(/huella no coincide/) },
    ]);
    await expect(restoreDatabase(copyDb(), folder)).rejects.toThrow(/no pasa la verificación/);

    const folder2 = tempFolder();
    const m2 = await exportDatabase(sourceDb(), folder2, NOW);
    const broken = {
      ...m2,
      collections: m2.collections.map((c) => (c.name === 'users' ? { ...c, count: 5 } : c)),
    };
    writeFileSync(join(folder2, 'manifiesto.json'), JSON.stringify(broken));
    expect((await verifyBackup(folder2)).problems[0]?.problem).toMatch(
      /tiene 1 documentos y el manifiesto dice 5/,
    );
  });

  it('una carpeta sin manifiesto no es un respaldo', async () => {
    await expect(readManifest(tempFolder())).rejects.toThrow(/no parece un respaldo/);
  });

  it('no deja la dirección de conexión ni datos de más en la carpeta', async () => {
    await populate();
    const folder = tempFolder();
    await exportDatabase(sourceDb(), folder, NOW);
    const manifestText = readFileSync(join(folder, 'manifiesto.json'), 'utf8');
    expect(manifestText).not.toMatch(/mongodb(\+srv)?:\/\//i);
    expect(manifestText).not.toMatch(/127\.0\.0\.1/);
  });
});

describe('seguridad del destino y de la carpeta', () => {
  it('solo restaura a una base de pruebas local', () => {
    expect(assertSafeRestoreTarget('mongodb://127.0.0.1:27017/libro-prueba')).toEqual({
      database: 'libro-prueba',
    });
    expect(assertSafeRestoreTarget('mongodb://localhost/restauracion-test')).toEqual({
      database: 'restauracion-test',
    });
    expect(assertSafeRestoreTarget('mongodb://localhost:27017/mi-local')).toEqual({
      database: 'mi-local',
    });
  });

  it('se niega con clústeres remotos, hosts ajenos y bases con nombre real', () => {
    const bad = [
      'mongodb+srv://usuario:clave@cluster0.abcd.mongodb.net/libro-prueba',
      'mongodb://cluster0-shard-00-00.abcd.mongodb.net:27017/libro-prueba',
      'mongodb://10.0.0.5:27017/libro-prueba',
      'mongodb://127.0.0.1:27017,otro.example:27017/libro-prueba',
      'mongodb://127.0.0.1:27017/libro-interactivo',
      'mongodb://127.0.0.1:27017/produccion',
      'mongodb://127.0.0.1:27017/',
      'no es una dirección',
    ];
    for (const uri of bad) expect(() => assertSafeRestoreTarget(uri), uri).toThrow();
  });

  it('los errores no repiten la dirección de conexión', () => {
    const uri = 'mongodb+srv://usuario:secreto@cluster0.abcd.mongodb.net/libro';
    expect(redactUri(`No se pudo conectar a ${uri} (timeout)`)).toBe(
      'No se pudo conectar a [dirección de conexión] (timeout)',
    );
    try {
      assertSafeRestoreTarget(uri);
    } catch (error) {
      expect(String(error)).not.toContain('secreto');
    }
  });

  it('el respaldo no puede quedar dentro del repositorio', () => {
    expect(() => assertOutsideRepo('D:/proyecto/repo/respaldos/hoy', 'D:/proyecto/repo')).toThrow(
      /dentro del repositorio/,
    );
    expect(() => assertOutsideRepo('D:/proyecto/repo', 'D:/proyecto/repo')).toThrow();
    expect(() => assertOutsideRepo('D:/proyecto/respaldos/hoy', 'D:/proyecto/repo')).not.toThrow();
  });

  it('la carpeta se llama con la fecha y la hora en UTC', () => {
    expect(backupFolderName(NOW)).toBe('2026-10-29-1507');
    expect(backupFolderName(new Date('2026-01-02T03:04:00Z'))).toBe('2026-01-02-0304');
  });
});

describe('lo que se restaura funciona de verdad', () => {
  it('una cuenta restaurada conserva su correo y la huella de su contraseña', async () => {
    const { reader } = await populate();
    const folder = tempFolder();
    await exportDatabase(sourceDb(), folder, NOW);
    const target = copyDb();
    await restoreDatabase(target, folder);
    const restored = (await target.collection('users').findOne({ _id: reader._id })) as {
      email: string;
      passwordHash: string;
    } | null;
    expect(restored?.email).toBe('lectora@ejemplo.com');
    expect(restored?.passwordHash).toBe((await User.findById(reader._id).orFail()).passwordHash);
  });
});
