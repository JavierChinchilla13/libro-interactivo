import type { CreateBackupRequest } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { BackupDownloadService } from '../services/backupDownload.service.js';

/** `/admin/backups`: solo administradores. Nada de esto se cachea. */
export function createAdminBackupController(backups: BackupDownloadService) {
  const status: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await backups.status());
  };

  /**
   * Envía el respaldo cifrado como descarga. Si algo falla antes del primer byte, responde con el error normal; si
   * la descarga se corta a la mitad, solo se cierra la conexión (el servicio ya lo registró). La respuesta se cierra
   * después de soltar el candado y borrar los temporales: un segundo clic inmediato no choca con el primero. Por eso
   * va sin `Content-Length` (por trozos): con el largo anunciado, el navegador daría la descarga por terminada al
   * recibir el último byte, antes de que el servidor termine de limpiar.
   */
  const download: RequestHandler = async (_req, res) => {
    const { body } = getInput<CreateBackupRequest>(res);
    const prepared = await backups.prepare(getAuth(res).userId, body);
    try {
      res.status(200).set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${prepared.fileName}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      await prepared.writeTo(res);
      await prepared.dispose();
      res.end();
    } catch (error) {
      if (!res.headersSent) throw error;
      res.destroy();
    } finally {
      await prepared.dispose();
    }
  };

  return { status, download };
}
