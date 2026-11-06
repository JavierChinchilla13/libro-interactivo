import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Registro de los respaldos descargados desde el panel: quién y cuándo, sin datos personales (ni IP, ni correo, ni
 * nombre; el nombre se busca al mostrarlo). Se conservan las últimas `BACKUP_HISTORY_KEEP` entradas.
 * `ok` empieza en `false` y pasa a `true` cuando el archivo se terminó de enviar.
 */
const backupDownloadSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ok: { type: Boolean, required: true, default: false },
    /** Tamaño del archivo cifrado. */
    bytes: { type: Number, required: true, min: 0 },
    collections: { type: Number, required: true, min: 0 },
    documents: { type: Number, required: true, min: 0 },
    encrypted: { type: Boolean, required: true, default: true },
  },
  { versionKey: false },
);

backupDownloadSchema.index({ at: -1 });
backupDownloadSchema.index({ ok: 1, at: -1 });

export type BackupDownloadAttrs = InferSchemaType<typeof backupDownloadSchema>;
export type BackupDownloadDoc = HydratedDocument<BackupDownloadAttrs>;
export const BackupDownload = model('BackupDownload', backupDownloadSchema, 'backupDownloads');
