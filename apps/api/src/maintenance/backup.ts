import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import mongoose from 'mongoose';

type Db = mongoose.mongo.Db;
const { EJSON } = mongoose.mongo.BSON;

/** Versión del formato de la carpeta de respaldo (`manifiesto.json`). */
export const BACKUP_FORMAT = 1;

/**
 * Colecciones que **no** se respaldan: son temporales y sensibles (huellas de sesiones abiertas y de enlaces para
 * cambiar la contraseña). Al restaurar no hace falta nada de eso y no es buena idea llevarlo a otro equipo.
 */
export const EXCLUDED_COLLECTIONS = ['refreshTokens', 'passwordResets'] as const;

export interface IndexSpec {
  key: Record<string, number | string>;
  name: string;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, unknown>;
}

export interface CollectionEntry {
  name: string;
  count: number;
  /** Archivo `.ndjson.gz` dentro de la carpeta. */
  file: string;
  bytes: number;
  sha256: string;
  indexes: IndexSpec[];
}

export interface Manifest {
  format: number;
  createdAt: string;
  /** Solo el nombre de la base de datos: nunca la dirección de conexión. */
  database: string;
  excluded: string[];
  collections: CollectionEntry[];
}

/** Quita direcciones de conexión de un texto (por si un error del controlador la trae). */
export function redactUri(text: string): string {
  return text.replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, '[dirección de conexión]');
}

/** Nombre de carpeta del respaldo: `AAAA-MM-DD-HHmm` (UTC). */
export function backupFolderName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
}

/** Un respaldo tiene datos personales y huellas: nunca dentro del repositorio (podría subirse por error). */
export function assertOutsideRepo(outDir: string, repoRoot: string): void {
  const rel = relative(resolve(repoRoot), resolve(outDir));
  const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (inside) {
    throw new Error(
      'La carpeta de respaldo está dentro del repositorio. Usa una carpeta fuera de él (por defecto ../libro-interactivo-respaldos).',
    );
  }
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function* serialize(db: Db, name: string, counter: { n: number }): AsyncGenerator<string> {
  for await (const doc of db.collection(name).find({}, { sort: { _id: 1 } })) {
    counter.n += 1;
    yield `${EJSON.stringify(doc, { relaxed: false })}\n`;
  }
}

/**
 * Exporta cada colección a un archivo `.ndjson.gz` (un documento por línea, en EJSON canónico: conserva `ObjectId`,
 * fechas y tipos) y escribe `manifiesto.json` con conteos, huellas SHA-256 e índices. Solo lee la base de datos.
 * Nunca guarda ni imprime la dirección de conexión.
 */
export async function exportDatabase(
  db: Db,
  folder: string,
  now: Date,
  options: { includeSessions?: boolean } = {},
): Promise<Manifest> {
  await mkdir(folder, { recursive: true });
  const excluded: string[] = options.includeSessions ? [] : [...EXCLUDED_COLLECTIONS];
  const infos = await db.listCollections({}, { nameOnly: false }).toArray();
  const names = infos
    .filter((info) => info.type === 'collection' && !info.name.startsWith('system.'))
    .map((info) => info.name)
    .filter((name) => !excluded.includes(name))
    .sort();

  const collections: CollectionEntry[] = [];
  for (const name of names) {
    const file = `${name}.ndjson.gz`;
    const counter = { n: 0 };
    await pipeline(
      Readable.from(serialize(db, name, counter)),
      createGzip(),
      createWriteStream(join(folder, file)),
    );
    const indexes = (await db.collection(name).indexes())
      .filter((index) => index.name !== '_id_')
      .map((index): IndexSpec => {
        const spec: IndexSpec = { key: index.key as IndexSpec['key'], name: String(index.name) };
        if (index.unique) spec.unique = true;
        if (index.sparse) spec.sparse = true;
        if (typeof index.expireAfterSeconds === 'number') {
          spec.expireAfterSeconds = index.expireAfterSeconds;
        }
        if (index.partialFilterExpression) {
          spec.partialFilterExpression = index.partialFilterExpression as Record<string, unknown>;
        }
        return spec;
      });
    collections.push({
      name,
      count: counter.n,
      file,
      bytes: (await stat(join(folder, file))).size,
      sha256: await sha256Of(join(folder, file)),
      indexes,
    });
  }

  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    createdAt: now.toISOString(),
    database: db.databaseName,
    excluded,
    collections,
  };
  await writeFile(join(folder, 'manifiesto.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readManifest(folder: string): Promise<Manifest> {
  let raw: string;
  try {
    raw = await readFile(join(folder, 'manifiesto.json'), 'utf8');
  } catch {
    throw new Error('La carpeta no tiene manifiesto.json: no parece un respaldo.');
  }
  const manifest = JSON.parse(raw) as Manifest;
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error(`Formato de respaldo desconocido (${String(manifest.format)}).`);
  }
  return manifest;
}

export interface VerifyProblem {
  collection: string;
  problem: string;
}

/** Comprueba, sin tocar ninguna base de datos, que cada archivo existe, coincide con su huella y tiene sus documentos. */
export async function verifyBackup(
  folder: string,
): Promise<{ manifest: Manifest; problems: VerifyProblem[] }> {
  const manifest = await readManifest(folder);
  const problems: VerifyProblem[] = [];
  const present = new Set(await readdir(folder));
  for (const entry of manifest.collections) {
    if (!present.has(entry.file)) {
      problems.push({ collection: entry.name, problem: 'falta el archivo' });
      continue;
    }
    if ((await sha256Of(join(folder, entry.file))) !== entry.sha256) {
      problems.push({
        collection: entry.name,
        problem: 'la huella no coincide (archivo alterado o dañado)',
      });
      continue;
    }
    let lines = 0;
    const reader = createInterface({
      input: createReadStream(join(folder, entry.file)).pipe(createGunzip()),
    });
    for await (const line of reader) if (line.trim() !== '') lines += 1;
    if (lines !== entry.count) {
      problems.push({
        collection: entry.name,
        problem: `tiene ${lines} documentos y el manifiesto dice ${entry.count}`,
      });
    }
  }
  return { manifest, problems };
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const TEST_MARK = /(prueba|test|local)/i;

/**
 * Restaurar solo es seguro sobre una base de **pruebas en este equipo**: host local y un nombre de base que contenga
 * «prueba», «test» o «local». Nunca sobre un host remoto (Atlas) ni sobre la base de desarrollo.
 */
export function assertSafeRestoreTarget(uri: string): { database: string } {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('La dirección de destino no es válida.');
  }
  if (url.protocol !== 'mongodb:') {
    throw new Error('Solo se restaura a una base local de este equipo, nunca a un clúster remoto.');
  }
  const hosts = url.host.split(',').map((host) => host.replace(/:\d+$/, ''));
  if (!hosts.every((host) => LOCAL_HOSTS.has(host))) {
    throw new Error('El destino no es local: se niega a restaurar sobre un servidor remoto.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || !TEST_MARK.test(database)) {
    throw new Error(
      'El nombre de la base de destino debe contener «prueba», «test» o «local» (para no pisar una base real).',
    );
  }
  return { database };
}

async function countDocuments(db: Db): Promise<number> {
  let total = 0;
  for (const info of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (info.name.startsWith('system.')) continue;
    total += await db.collection(info.name).estimatedDocumentCount();
  }
  return total;
}

export interface RestoreReport {
  database: string;
  restored: Array<{ name: string; expected: number; actual: number; ok: boolean }>;
  ok: boolean;
}

/**
 * Restaura una carpeta de respaldo en `db`. Antes verifica huellas y conteos. Se niega a mezclar con datos existentes
 * (a menos que se pida vaciar la base de destino, que solo debe ser una base de pruebas) y al terminar compara cada
 * conteo contra el manifiesto y recrea los índices.
 */
export async function restoreDatabase(
  db: Db,
  folder: string,
  options: { empty?: boolean } = {},
): Promise<RestoreReport> {
  const { manifest, problems } = await verifyBackup(folder);
  if (problems.length > 0) {
    throw new Error(
      `El respaldo no pasa la verificación: ${problems.map((p) => `${p.collection}: ${p.problem}`).join('; ')}`,
    );
  }
  const existing = await countDocuments(db);
  if (existing > 0) {
    if (!options.empty) {
      throw new Error(
        'La base de destino ya tiene datos. Usa una base vacía o pide vaciarla (--vaciar).',
      );
    }
    for (const info of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (!info.name.startsWith('system.')) await db.collection(info.name).drop();
    }
  }

  const restored: RestoreReport['restored'] = [];
  for (const entry of manifest.collections) {
    const collection = db.collection(entry.name);
    let batch: Array<Record<string, unknown>> = [];
    const flush = async () => {
      if (batch.length > 0) await collection.insertMany(batch as never[], { ordered: true });
      batch = [];
    };
    const reader = createInterface({
      input: createReadStream(join(folder, entry.file)).pipe(createGunzip()),
    });
    for await (const line of reader) {
      if (line.trim() === '') continue;
      batch.push(EJSON.parse(line, { relaxed: false }) as Record<string, unknown>);
      if (batch.length >= 1000) await flush();
    }
    await flush();
    for (const spec of entry.indexes) {
      const { key, ...rest } = spec;
      await collection.createIndex(key as never, rest as never);
    }
    const actual = await collection.countDocuments({});
    restored.push({ name: entry.name, expected: entry.count, actual, ok: actual === entry.count });
  }
  return { database: db.databaseName, restored, ok: restored.every((item) => item.ok) };
}
