export interface StoredObjectInfo {
  key: string;
  mime: string;
  size: number;
}

/** Almacenamiento privado S3-compatible para documentos extra. Adaptador real (R2/S3): fase 8. */
export interface StorageProvider {
  /** URL temporal para que el panel suba el archivo directo al almacenamiento. */
  createUploadUrl(key: string, mime: string, maxSizeBytes: number): Promise<string>;
  /** URL firmada de vida corta para descargar/ver el archivo. */
  createDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  head(key: string): Promise<StoredObjectInfo | null>;
  remove(key: string): Promise<void>;
}

/** Adaptador en memoria para pruebas. */
export class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, StoredObjectInfo>();

  async createUploadUrl(key: string, mime: string, maxSizeBytes: number): Promise<string> {
    this.objects.set(key, { key, mime, size: 0 });
    return `memory://upload/${encodeURIComponent(key)}?max=${maxSizeBytes}`;
  }

  async createDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return `memory://download/${encodeURIComponent(key)}?ttl=${ttlSeconds}`;
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    return this.objects.get(key) ?? null;
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
