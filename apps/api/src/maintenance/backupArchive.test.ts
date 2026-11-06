import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tarStream, type TarEntry } from '../lib/tar.js';
import { User } from '../models/User.js';
import { createUser } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { backupFolderName, exportDatabase, restoreDatabase, verifyBackup } from './backup.js';
import {
  NEEDS_KEY_MESSAGE,
  detectBackupSource,
  extractBackupTar,
  openBackupSource,
} from './backupArchive.js';
import { WRONG_KEY_MESSAGE, createArchiveEncryptor } from './backupCrypto.js';

useTestDb();

const FAST = { logN: 14, r: 8, p: 1 };
const KEY = 'Faro-Lejano-Ocho-2026';
const NOW = new Date('2026-11-05T18:30:00Z');
const NAME = backupFolderName(NOW);

let work: string;
let tmp: string;
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'archivo-prueba-'));
  tmp = await mkdtemp(join(tmpdir(), 'archivo-temporal-'));
  await mongoose.connection.useDb('libro-prueba-archivo').db!.dropDatabase();
});
afterEach(async () => {
  await rm(work, { recursive: true, force: true });
  await rm(tmp, { recursive: true, force: true });
});

async function writeAll(path: string, chunks: AsyncIterable<Buffer>): Promise<void> {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  await writeFile(path, Buffer.concat(parts));
}

/** Un respaldo real en carpeta, su `.tar` y su `.tar.cifrado` (como los del panel). */
async function backups() {
  await createUser({ email: 'lectora@ejemplo.com' });
  await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const folder = join(work, NAME);
  const manifest = await exportDatabase(mongoose.connection.db!, folder, NOW);
  const files = [...manifest.collections.map((c) => c.file), 'manifiesto.json'];
  const entries: TarEntry[] = [{ name: `${NAME}/`, size: 0, mtime: NOW }];
  for (const file of files) {
    const path = join(folder, file);
    entries.push({
      name: `${NAME}/${file}`,
      size: (await stat(path)).size,
      mtime: NOW,
      content: () => createReadStream(path),
    });
  }
  const tar = join(work, 'respaldo.tar');
  await writeAll(tar, tarStream(entries));
  const sealed = join(work, 'respaldo.tar.cifrado');
  const encryptor = await createArchiveEncryptor(KEY, FAST);
  await writeAll(sealed, encryptor.encrypt(tarStream(entries)));
  return { folder, tar, sealed, manifest };
}

describe('abrir un respaldo para restore:db', () => {
  it('reconoce carpeta, .tar y .tar.cifrado', async () => {
    const { folder, tar, sealed } = await backups();
    expect(await detectBackupSource(folder)).toBe('folder');
    expect(await detectBackupSource(tar)).toBe('tar');
    expect(await detectBackupSource(sealed)).toBe('encrypted');
    await expect(detectBackupSource(join(work, 'no-existe'))).rejects.toThrow(/No existe/);
  });

  it('una carpeta se usa tal cual y no se borra', async () => {
    const { folder } = await backups();
    const opened = await openBackupSource(folder, { tmpDir: tmp });
    expect(opened).toMatchObject({ kind: 'folder', folder });
    await opened.cleanup();
    expect((await verifyBackup(folder)).problems).toEqual([]);
  });

  it('un .tar se extrae a una carpeta temporal que pasa la verificación y se borra al terminar', async () => {
    const { tar, manifest } = await backups();
    const opened = await openBackupSource(tar, { tmpDir: tmp });
    expect(opened.kind).toBe('tar');
    const check = await verifyBackup(opened.folder);
    expect(check.problems).toEqual([]);
    expect(check.manifest.collections).toEqual(manifest.collections);
    await opened.cleanup();
    await opened.cleanup(); // dos veces no es un error
    expect(await readdir(tmp)).toEqual([]);
  });

  it('un .tar.cifrado se descifra con la contraseña (o la pide) y se restaura en una base de pruebas', async () => {
    const { sealed } = await backups();
    let asked = 0;
    const opened = await openBackupSource(sealed, {
      tmpDir: tmp,
      askPassword: () => {
        asked += 1;
        return Promise.resolve(KEY);
      },
    });
    expect(asked).toBe(1);
    expect(opened.kind).toBe('encrypted');
    // El .tar descifrado no queda: solo la carpeta extraída.
    const [workDir] = await readdir(tmp);
    expect(await readdir(join(tmp, workDir!))).toEqual(['extraido']);

    const copy = mongoose.connection.useDb('libro-prueba-archivo').db!;
    const report = await restoreDatabase(copy, opened.folder);
    expect(report.ok).toBe(true);
    const admin = await copy.collection('users').findOne({ email: 'admin@ejemplo.com' });
    const original = await User.findOne({ email: 'admin@ejemplo.com' }).lean();
    expect(admin?.['passwordHash']).toBe(original?.passwordHash);
    await opened.cleanup();
    expect(await readdir(tmp)).toEqual([]);
  });

  it('sin contraseña pide --clave; con la equivocada falla y no deja nada', async () => {
    const { sealed } = await backups();
    await expect(openBackupSource(sealed, { tmpDir: tmp })).rejects.toThrow(NEEDS_KEY_MESSAGE);
    await expect(
      openBackupSource(sealed, { tmpDir: tmp, password: 'Otra-Clave-Distinta-99' }),
    ).rejects.toThrow(WRONG_KEY_MESSAGE);
    expect(await readdir(tmp)).toEqual([]);
  });
});

describe('extractBackupTar solo acepta la forma de un respaldo', () => {
  async function tarOf(entries: TarEntry[]): Promise<string> {
    const path = join(work, `t-${Math.random().toString(36).slice(2)}.tar`);
    await writeAll(path, tarStream(entries));
    return path;
  }
  const file = (name: string, text = '{}'): TarEntry => {
    const data = Buffer.from(text);
    return { name, size: data.length, mtime: NOW, content: () => [data] };
  };
  const dir = (name: string): TarEntry => ({ name, size: 0, mtime: NOW });

  it.each([
    ['sin carpeta principal', [file('manifiesto.json')], /carpeta principal/],
    [
      'archivo fuera de la carpeta',
      [dir('a/'), file('a/manifiesto.json'), file('b/x.json')],
      /no trae/,
    ],
    ['subcarpetas', [dir('a/'), file('a/manifiesto.json'), dir('a/sub/')], /no trae/],
    [
      'nombres repetidos',
      [dir('a/'), file('a/manifiesto.json'), file('a/manifiesto.json')],
      /no trae/,
    ],
    ['sin manifiesto', [dir('a/'), file('a/users.ndjson.gz')], /manifiesto/],
  ])('rechaza: %s', async (_label, entries, message) => {
    const out = join(work, 'salida');
    await expect(extractBackupTar(await tarOf(entries), out)).rejects.toThrow(message);
  });

  it('un archivo cualquiera (ni tar ni cifrado) no se acepta', async () => {
    const junk = join(work, 'cualquiera.bin');
    await writeFile(junk, Buffer.alloc(3000, 1));
    await expect(openBackupSource(junk, { tmpDir: tmp })).rejects.toThrow(/tar/);
    expect(await readdir(tmp)).toEqual([]);
  });
});
