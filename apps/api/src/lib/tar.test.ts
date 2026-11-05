import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BLOCK,
  listTar,
  parseTarHeader,
  tarHeader,
  tarSize,
  tarStream,
  type TarEntry,
} from './tar.js';

const MTIME = new Date('2026-11-05T10:20:00Z');

async function collect(entries: TarEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of tarStream(entries)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sample(): TarEntry[] {
  const a = Buffer.from('{"a":1}\n');
  const b = Buffer.alloc(1300, 7); // más de dos bloques: prueba el relleno
  const empty = Buffer.alloc(0);
  return [
    { name: '2026-11-05-1020/', size: 0, mtime: MTIME },
    { name: '2026-11-05-1020/users.ndjson.gz', size: b.length, mtime: MTIME, content: () => [b] },
    { name: '2026-11-05-1020/vacia.ndjson.gz', size: 0, mtime: MTIME, content: () => [empty] },
    { name: '2026-11-05-1020/manifiesto.json', size: a.length, mtime: MTIME, content: () => [a] },
  ];
}

function reader(buf: Buffer) {
  return (position: number, length: number) =>
    Promise.resolve(buf.subarray(position, position + length));
}

const temps: string[] = [];
afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('escritor tar', () => {
  it('produce exactamente el tamaño que anuncia tarSize (múltiplo de 512, con dos bloques de cierre)', async () => {
    const entries = sample();
    const tar = await collect(entries);
    expect(tar.length).toBe(tarSize(entries));
    expect(tar.length % BLOCK).toBe(0);
    expect(tar.subarray(tar.length - 2 * BLOCK).every((byte) => byte === 0)).toBe(true);
  });

  it('las cabeceras son ustar válidas y se leen de vuelta con nombre, tipo y tamaño', async () => {
    const tar = await collect(sample());
    const listed = await listTar(reader(tar), tar.length);
    expect(listed.map(({ name, size, type }) => ({ name, size, type }))).toEqual([
      { name: '2026-11-05-1020/', size: 0, type: 'dir' },
      { name: '2026-11-05-1020/users.ndjson.gz', size: 1300, type: 'file' },
      { name: '2026-11-05-1020/vacia.ndjson.gz', size: 0, type: 'file' },
      { name: '2026-11-05-1020/manifiesto.json', size: 8, type: 'file' },
    ]);
    const manifest = listed[3]!;
    expect(tar.subarray(manifest.offset, manifest.offset + manifest.size).toString()).toBe(
      '{"a":1}\n',
    );
    const header = tarHeader({ name: 'x/y.json', size: 5, mtime: MTIME });
    expect(header.toString('ascii', 257, 263)).toBe('ustar\0');
    expect(parseTarHeader(header)).toEqual({ name: 'x/y.json', size: 5, type: 'file' });
  });

  it('rechaza nombres peligrosos o demasiado largos', () => {
    for (const name of [
      '../fuera.txt',
      '/absoluto.txt',
      'a/../b.txt',
      'a/./b.txt',
      'con espacio.txt',
      'c:\\windows.txt',
      'ñandú.txt',
      `${'a'.repeat(101)}`,
      '',
    ]) {
      expect(() => tarHeader({ name, size: 0, mtime: MTIME }), name).toThrow(/no válido/);
    }
    expect(() => tarHeader({ name: 'carpeta/', size: 3, mtime: MTIME })).toThrow(/carpeta/);
  });

  it('corta con un error si un contenido no tiene el tamaño anunciado (el .tar quedaría corrupto)', async () => {
    const short: TarEntry = {
      name: 'a.txt',
      size: 10,
      mtime: MTIME,
      content: () => [Buffer.from('abc')],
    };
    await expect(collect([short])).rejects.toThrow(/tamaño anunciado/);
    const long: TarEntry = {
      name: 'a.txt',
      size: 2,
      mtime: MTIME,
      content: () => [Buffer.from('abc')],
    };
    await expect(collect([long])).rejects.toThrow(/tamaño anunciado/);
  });

  it('el lector rechaza un .tar cortado, una suma de control alterada y tipos que no son archivo o carpeta', async () => {
    const tar = await collect(sample());
    await expect(listTar(reader(tar), tar.length - 2 * BLOCK)).rejects.toThrow(/cortado/);
    await expect(listTar(reader(tar.subarray(0, 700)), 700)).rejects.toThrow(/cortado/);

    const altered = Buffer.from(tar);
    altered[0] = 'X'.charCodeAt(0);
    await expect(listTar(reader(altered), altered.length)).rejects.toThrow(/suma de control/);

    const link = tarHeader({ name: 'enlace', size: 0, mtime: MTIME });
    link.write('2', 156, 1, 'ascii'); // enlace simbólico
    link.fill(0x20, 148, 156);
    let sum = 0;
    for (const byte of link) sum += byte;
    link.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    expect(() => parseTarHeader(link)).toThrow(/no admitido/);
  });

  it('el tar del sistema lo abre (se salta si no hay tar instalado)', async (ctx) => {
    const probe = spawnSync('tar', ['--version'], { encoding: 'utf8' });
    if (probe.status !== 0) ctx.skip();
    const dir = await mkdtemp(join(tmpdir(), 'tar-prueba-'));
    temps.push(dir);
    const file = join(dir, 'respaldo.tar');
    await writeFile(file, await collect(sample()));
    // Desde la carpeta del archivo y con nombre relativo: el tar de Windows no entiende rutas `D:\…` con `-f`.
    const listing = spawnSync('tar', ['-tf', 'respaldo.tar'], { cwd: dir, encoding: 'utf8' });
    expect(listing.status, listing.stderr).toBe(0);
    expect(listing.stdout.split(/\r?\n/).filter(Boolean)).toEqual([
      '2026-11-05-1020/',
      '2026-11-05-1020/users.ndjson.gz',
      '2026-11-05-1020/vacia.ndjson.gz',
      '2026-11-05-1020/manifiesto.json',
    ]);
    const extract = spawnSync('tar', ['-xf', 'respaldo.tar'], { cwd: dir, encoding: 'utf8' });
    expect(extract.status, extract.stderr).toBe(0);
    expect(await readFile(join(dir, '2026-11-05-1020', 'manifiesto.json'), 'utf8')).toBe(
      '{"a":1}\n',
    );
    expect((await readFile(join(dir, '2026-11-05-1020', 'users.ndjson.gz'))).length).toBe(1300);
  });
});
