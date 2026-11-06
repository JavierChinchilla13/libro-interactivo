import { mkdir, mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { listTar, type ParsedTarEntry } from '../lib/tar.js';
import { decryptArchiveFile, isEncryptedArchive } from './backupCrypto.js';

/**
 * Abre un respaldo para `restore:db`, venga como venga:
 * - una **carpeta** de `backup:db` (con `manifiesto.json`): se usa tal cual;
 * - un **`.tar`** con esa carpeta dentro: se extrae a una carpeta temporal;
 * - un **`.tar.cifrado`** descargado desde el panel: se descifra con la contraseña del archivo y se extrae.
 *
 * Lo temporal (que trae datos personales) vive en la carpeta temporal del sistema y se borra con `cleanup()`.
 */

export type BackupSourceKind = 'folder' | 'tar' | 'encrypted';

export interface OpenedBackup {
  kind: BackupSourceKind;
  /** Carpeta con `manifiesto.json`, lista para `verifyBackup` o `restoreDatabase`. */
  folder: string;
  /** Borra lo extraído (no hace nada si era una carpeta). Se puede llamar más de una vez. */
  cleanup(): Promise<void>;
}

export const NEEDS_KEY_MESSAGE =
  'El archivo está cifrado (descargado desde el panel): agrega --clave y escribe la contraseña del archivo cuando la pida.';

/** ¿Qué es la ruta? Sin abrir nada más que los primeros bytes. */
export async function detectBackupSource(path: string): Promise<BackupSourceKind> {
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new Error('No existe ese archivo o carpeta.');
  }
  if (info.isDirectory()) return 'folder';
  if (!info.isFile()) throw new Error('La ruta no es un archivo ni una carpeta.');
  return (await isEncryptedArchive(path)) ? 'encrypted' : 'tar';
}

/** Un nombre de carpeta o de archivo del respaldo: solo letras, números, `.`, `_` y `-`, y nunca `.` ni `..`. */
const SAFE_PART = /^[A-Za-z0-9._-]+$/;
function isSafePart(part: string | undefined): part is string {
  return part !== undefined && SAFE_PART.test(part) && part !== '.' && part !== '..';
}

/** ¿`target` queda dentro de `root`? (con la regla de rutas de este sistema: en Windows `\` también separa). */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export interface ExtractionPlan {
  top: string;
  files: Array<{ entry: ParsedTarEntry; target: string }>;
}

/**
 * Decide qué se extrae y adónde, **sin escribir nada**. Solo acepta lo que produce el panel: **una** carpeta de
 * primer nivel con archivos dentro (sin subcarpetas, sin enlaces, sin nombres repetidos) y que trae `manifiesto.json`.
 * Cada parte del nombre pasa `SAFE_PART` (nada de `..`, `.` ni barras invertidas, que en Windows separan carpetas) y,
 * además, cada destino se comprueba con `path.resolve` para que quede dentro de `outDir`. No depende de que el lector
 * de tar ya haya filtrado los nombres.
 */
export function planBackupExtraction(entries: ParsedTarEntry[], outDir: string): ExtractionPlan {
  const root = resolve(outDir);
  const first = entries[0];
  const top = first?.type === 'dir' ? first.name.replace(/\/$/, '') : undefined;
  if (!isSafePart(top) || !isInside(root, resolve(root, top))) {
    throw new Error('El archivo no tiene la forma de un respaldo (falta la carpeta principal).');
  }
  const seen = new Set<string>();
  const files: ExtractionPlan['files'] = [];
  for (const entry of entries.slice(1)) {
    const parts = entry.name.split('/');
    const target = resolve(root, entry.name);
    if (
      entry.type !== 'file' ||
      parts.length !== 2 ||
      parts[0] !== top ||
      !isSafePart(parts[1]) ||
      seen.has(entry.name) ||
      !isInside(resolve(root, top), target)
    ) {
      throw new Error(`El archivo trae algo que un respaldo no trae: «${entry.name}».`);
    }
    seen.add(entry.name);
    files.push({ entry, target });
  }
  if (!seen.has(`${top}/manifiesto.json`)) {
    throw new Error('El archivo no trae manifiesto.json: no parece un respaldo.');
  }
  return { top, files };
}

/** Extrae un `.tar` de respaldo en `outDir` según `planBackupExtraction`. Devuelve la carpeta extraída. */
export async function extractBackupTar(tarPath: string, outDir: string): Promise<string> {
  const handle = await open(tarPath, 'r');
  try {
    const size = (await handle.stat()).size;
    const read = async (position: number, length: number) => {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, position);
      return buf.subarray(0, bytesRead);
    };
    const { top, files } = planBackupExtraction(await listTar(read, size), outDir);
    const folder = resolve(outDir, top);
    await mkdir(folder, { recursive: true });
    for (const { entry, target } of files) {
      const out = await open(target, 'wx');
      try {
        // Por partes de 1 MB: el archivo puede ser grande.
        for (let done = 0; done < entry.size;) {
          const length = Math.min(1024 * 1024, entry.size - done);
          const chunk = await read(entry.offset + done, length);
          if (chunk.length !== length) throw new Error('El archivo tar está cortado.');
          await out.write(chunk);
          done += length;
        }
      } finally {
        await out.close();
      }
    }
    return folder;
  } finally {
    await handle.close();
  }
}

/**
 * Prepara el respaldo de `path` para verificarlo o restaurarlo. `password` es la contraseña del archivo (solo para
 * el `.tar.cifrado`); `askPassword` se llama solo si hace falta y no vino `password`.
 */
export async function openBackupSource(
  path: string,
  options: {
    password?: string | undefined;
    askPassword?: (() => Promise<string>) | undefined;
    tmpDir?: string | undefined;
  } = {},
): Promise<OpenedBackup> {
  const kind = await detectBackupSource(path);
  if (kind === 'folder') return { kind, folder: path, cleanup: async () => {} };

  let password: string | undefined;
  if (kind === 'encrypted') {
    password = options.password ?? (options.askPassword ? await options.askPassword() : undefined);
    if (!password) throw new Error(NEEDS_KEY_MESSAGE);
  }

  const work = await mkdtemp(join(options.tmpDir ?? tmpdir(), 'um-restaurar-'));
  const cleanup = () => rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  try {
    let tarPath = path;
    if (kind === 'encrypted' && password) {
      tarPath = join(work, 'respaldo.tar');
      await decryptArchiveFile(path, tarPath, password);
    }
    const folder = await extractBackupTar(tarPath, join(work, 'extraido'));
    if (tarPath !== path) await rm(tarPath, { force: true });
    return { kind, folder, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
