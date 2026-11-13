import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BACKUP_HISTORY_KEEP,
  BACKUP_HISTORY_SHOWN,
  BACKUP_MAX_BYTES,
  BACKUP_STALE_DAYS,
  archivePasswordProblems,
  type BackupStatusResponse,
  type CreateBackupRequest,
} from '@libro/shared';
import mongoose from 'mongoose';
import type { BackgroundTasks } from '../lib/background.js';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { tarSize, tarStream, type TarEntry } from '../lib/tar.js';
import { backupFolderName, exportDatabase } from '../maintenance/backup.js';
import {
  ARCHIVE_OVERHEAD,
  createArchiveEncryptor,
  type ScryptParams,
} from '../maintenance/backupCrypto.js';
import { BackupDownload } from '../models/BackupDownload.js';
import { User } from '../models/User.js';
import type { MailProvider } from '../providers/mail/MailProvider.js';
import { backupDownloadedEmail } from './email.templates.js';
import { verifyPassword } from './password.service.js';

const DAY_MS = 86_400_000;
const TEMP_PREFIX = 'um-respaldo-';
/** Carpetas temporales de una descarga que no terminó (p. ej. el servidor se reinició a mitad): se borran después. */
const STALE_TEMP_MS = 60 * 60_000;

export interface BackupDownloadDeps {
  clock: Clock;
  mail: MailProvider;
  tasks: BackgroundTasks;
  logger: Logger;
  /** Carpeta de los temporales; por defecto la del sistema (en Render, el disco efímero). */
  tmpDir?: string;
  /** Tope del archivo; por defecto `BACKUP_MAX_BYTES` (200 MB). */
  maxBytes?: number;
  /** Parámetros de scrypt; solo las pruebas los bajan. */
  scrypt?: ScryptParams;
}

export interface PreparedBackup {
  fileName: string;
  /** Tamaño exacto del archivo cifrado. */
  size: number;
  /**
   * Envía el archivo cifrado a `out` **sin cerrarlo** (lo cierra quien llama, después de `dispose`, para que el candado
   * y los temporales ya estén libres cuando el navegador recibe el final). Antes del primer byte registra la descarga y
   * manda el correo de aviso (así una descarga cortada a propósito también queda a la vista); al terminar de escribir
   * la marca como completa.
   */
  writeTo(out: Writable): Promise<void>;
  /** Borra los temporales y suelta el candado. Se llama siempre, haya salido bien o no. */
  dispose(): Promise<void>;
}

/**
 * Respaldo descargable desde el panel (solo administradores). Reutiliza la exportación de `backup:db` (mismo formato:
 * un `.ndjson.gz` por colección y `manifiesto.json`, sin sesiones ni enlaces de recuperación), lo empaqueta en un
 * `.tar` y lo cifra con la contraseña que elige el administrador. Nada queda guardado en el servidor.
 * Uno a la vez en todo el servidor.
 */
export function createBackupDownloadService(deps: BackupDownloadDeps) {
  const tmpBase = deps.tmpDir ?? tmpdir();
  const maxBytes = deps.maxBytes ?? BACKUP_MAX_BYTES;
  let busy = false;

  async function removeStaleTemps(): Promise<void> {
    let names: string[];
    try {
      names = await readdir(tmpBase);
    } catch {
      return;
    }
    const now = Date.now();
    for (const name of names) {
      if (!name.startsWith(TEMP_PREFIX)) continue;
      const path = join(tmpBase, name);
      try {
        if (now - (await stat(path)).mtimeMs > STALE_TEMP_MS) {
          await rm(path, { recursive: true, force: true });
        }
      } catch {
        // Otra descarga pudo borrarla a la vez: no importa.
      }
    }
  }

  async function prune(): Promise<void> {
    const old = await BackupDownload.find({}, { _id: 1 })
      .sort({ at: -1, _id: -1 })
      .skip(BACKUP_HISTORY_KEEP)
      .lean();
    if (old.length > 0) await BackupDownload.deleteMany({ _id: { $in: old.map((d) => d._id) } });
  }

  return {
    async prepare(userId: string, input: CreateBackupRequest): Promise<PreparedBackup> {
      if (busy) {
        throw new AppError(
          'RATE_LIMITED',
          'Ya se está preparando un respaldo. Inténtalo de nuevo en un minuto.',
        );
      }
      busy = true;
      let dir: string | undefined;
      /** Idempotente y nunca lanza: un temporal que no se pudo borrar se anota y lo limpia la próxima descarga. */
      const release = async () => {
        const target = dir;
        dir = undefined;
        try {
          // En Windows un archivo recién leído puede tardar un instante en soltarse: se reintenta.
          if (target)
            await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        } catch {
          deps.logger.warn('No se pudo borrar la carpeta temporal de un respaldo');
        } finally {
          busy = false;
        }
      };
      try {
        const user = await User.findById(userId);
        if (!user || user.status !== 'active' || user.role !== 'ADMIN') {
          throw new AppError('FORBIDDEN', 'Solo un administrador puede descargar un respaldo.');
        }
        if (!(await verifyPassword(user.passwordHash, input.password))) {
          throw new AppError('VALIDATION', 'La contraseña no es correcta.');
        }
        const problems = archivePasswordProblems(input.archivePassword, {
          name: user.name,
          email: user.email,
        });
        if (problems.length > 0) throw new AppError('VALIDATION', problems.join(' '));

        const encryptor = await createArchiveEncryptor(input.archivePassword, deps.scrypt);
        const db = mongoose.connection.db;
        if (!db) throw new AppError('UNAVAILABLE', 'La base de datos no está disponible.');

        await removeStaleTemps();
        dir = await mkdtemp(join(tmpBase, TEMP_PREFIX));
        const now = deps.clock();
        const folderName = backupFolderName(now);
        const folder = join(dir, folderName);
        const manifest = await exportDatabase(db, folder, now);

        const fileEntry = async (file: string): Promise<TarEntry> => {
          const path = join(folder, file);
          return {
            name: `${folderName}/${file}`,
            size: (await stat(path)).size,
            mtime: now,
            content: () => createReadStream(path),
          };
        };
        const entries: TarEntry[] = [{ name: `${folderName}/`, size: 0, mtime: now }];
        for (const entry of manifest.collections) entries.push(await fileEntry(entry.file));
        entries.push(await fileEntry('manifiesto.json'));

        const size = tarSize(entries) + ARCHIVE_OVERHEAD;
        if (size > maxBytes) {
          throw new AppError(
            'UNAVAILABLE',
            `El respaldo pasa de ${Math.round(maxBytes / 1024 / 1024)} MB y no se puede descargar desde el panel. Pídeselo al desarrollador.`,
          );
        }
        const documents = manifest.collections.reduce((sum, entry) => sum + entry.count, 0);

        return {
          fileName: `universo-memorias-respaldo-${folderName}.tar.cifrado`,
          size,
          async writeTo(out) {
            const record = await BackupDownload.create({
              at: now,
              by: user._id,
              ok: false,
              bytes: size,
              collections: manifest.collections.length,
              documents,
              encrypted: true,
            });
            await prune();
            deps.tasks.run('backup-downloaded-email', () =>
              deps.mail.send({
                to: user.email,
                ...backupDownloadedEmail({ name: user.name, at: now }),
              }),
            );
            try {
              await pipeline(Readable.from(encryptor.encrypt(tarStream(entries))), out, {
                end: false,
              });
            } catch (error) {
              deps.logger.warn({ userId }, 'Respaldo cortado antes de terminar');
              throw error;
            }
            await BackupDownload.updateOne({ _id: record._id }, { $set: { ok: true } });
            deps.logger.info({ userId, bytes: size }, 'Respaldo descargado');
          },
          dispose: release,
        };
      } catch (error) {
        await release();
        throw error;
      }
    },

    /** Último respaldo completo y las últimas descargas, con el nombre actual de quien la hizo. */
    async status(): Promise<BackupStatusResponse> {
      const [last, recent] = await Promise.all([
        BackupDownload.findOne({ ok: true }).sort({ at: -1 }).lean(),
        BackupDownload.find().sort({ at: -1, _id: -1 }).limit(BACKUP_HISTORY_SHOWN).lean(),
      ]);
      const users = await User.find(
        { _id: { $in: [...new Set(recent.map((d) => String(d.by)))] } },
        { name: 1 },
      ).lean();
      const names = new Map(users.map((u) => [String(u._id), u.name]));
      return {
        lastAt: last ? last.at.toISOString() : null,
        daysAgo: last
          ? Math.max(0, Math.floor((deps.clock().getTime() - last.at.getTime()) / DAY_MS))
          : null,
        staleAfterDays: BACKUP_STALE_DAYS,
        downloads: recent.map((d) => {
          const name = names.get(String(d.by));
          return {
            at: d.at.toISOString(),
            by: name === undefined ? null : { id: String(d.by), name },
            ok: d.ok,
            bytes: d.bytes,
          };
        }),
      };
    },
  };
}

export type BackupDownloadService = ReturnType<typeof createBackupDownloadService>;
