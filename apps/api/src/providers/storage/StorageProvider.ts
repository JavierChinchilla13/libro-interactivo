export interface StoredObjectInfo {
  key: string;
  mime: string;
  size: number;
}

export interface UploadTarget {
  /** URL a la que el navegador hace el `PUT` del archivo. */
  url: string;
  /** Cabeceras que debe enviar tal cual (están firmadas). */
  headers: Record<string, string>;
  expiresIn: number;
}

/**
 * Almacenamiento PRIVADO S3-compatible (Cloudflare R2, S3…) para los capítulos extra. El bucket nunca es público: se
 * entra solo con URLs firmadas de vida corta, que el servidor entrega después de validar el acceso.
 */
export interface StorageProvider {
  /** Permiso temporal para que el panel suba el archivo directo al almacenamiento. */
  createUploadUrl(key: string, mime: string): Promise<UploadTarget>;
  /** URL firmada de vida corta para descargar/ver el archivo. */
  createDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  head(key: string): Promise<StoredObjectInfo | null>;
  remove(key: string): Promise<void>;
}

/** Adaptador en memoria (pruebas y desarrollo sin credenciales): no guarda bytes, solo lo que las pruebas le pidan. */
export class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, StoredObjectInfo>();

  async createUploadUrl(key: string, mime: string): Promise<UploadTarget> {
    return {
      url: `memory://upload/${encodeURIComponent(key)}`,
      headers: { 'Content-Type': mime },
      expiresIn: 600,
    };
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

  /** Atajo de pruebas: simula que el navegador ya subió el archivo. */
  putObject(info: StoredObjectInfo): void {
    this.objects.set(info.key, info);
  }
}
