import { createHash, createHmac } from 'node:crypto';
import { systemClock, type Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import type { StorageProvider, StoredObjectInfo, UploadTarget } from './StorageProvider.js';

export interface S3Config {
  /** Por ejemplo `https://<cuenta>.r2.cloudflarestorage.com` o `https://s3.amazonaws.com`. */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 usa `auto`. */
  region: string;
  /** `true`: `endpoint/bucket/clave`; `false`: `bucket.endpoint/clave`. */
  forcePathStyle: boolean;
  clock?: Clock;
  /** Inyectable para pruebas. */
  fetchFn?: typeof fetch;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();

/** Codificación RFC 3986 estricta (también escapa `! ' ( ) *`). */
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const encodePath = (key: string) => key.split('/').map(encode).join('/');

const SIGNING_EXPIRY_UPLOAD = 600; // 10 min para subir
const MAX_DOWNLOAD_TTL = 3600;

/**
 * Adaptador S3-compatible con URLs prefirmadas (AWS Signature V4, sin SDK). Probado contra el ejemplo oficial de
 * AWS. El servidor firma; el navegador sube/descarga directo con la URL, sin pasar los bytes por la API.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly clock: Clock;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: S3Config) {
    this.clock = config.clock ?? systemClock;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  /** URL prefirmada. `signedHeaders` (p. ej. `content-type`) quedan firmados y el cliente debe enviarlos idénticos. */
  presign(
    method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
    key: string,
    expiresIn: number,
    signedHeaders: Record<string, string> = {},
  ): string {
    const { endpoint, bucket, accessKeyId, secretAccessKey, region, forcePathStyle } = this.config;
    const now = this.clock();
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20130524T000000Z
    const dateStamp = amzDate.slice(0, 8);
    const base = new URL(endpoint);
    const host = forcePathStyle ? base.host : `${bucket}.${base.host}`;
    const path = forcePathStyle ? `/${encode(bucket)}/${encodePath(key)}` : `/${encodePath(key)}`;

    const headers: Record<string, string> = { host };
    for (const [name, value] of Object.entries(signedHeaders))
      headers[name.toLowerCase()] = value.trim();
    const names = Object.keys(headers).sort();
    const scope = `${dateStamp}/${region}/s3/aws4_request`;

    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresIn),
      'X-Amz-SignedHeaders': names.join(';'),
    };
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((name) => `${encode(name)}=${encode(query[name] ?? '')}`)
      .join('&');
    const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
    const canonicalRequest = [
      method,
      path,
      canonicalQuery,
      canonicalHeaders,
      names.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return `${base.protocol}//${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  async createUploadUrl(key: string, mime: string): Promise<UploadTarget> {
    return {
      url: this.presign('PUT', key, SIGNING_EXPIRY_UPLOAD, { 'content-type': mime }),
      headers: { 'Content-Type': mime },
      expiresIn: SIGNING_EXPIRY_UPLOAD,
    };
  }

  async createDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return this.presign(
      'GET',
      key,
      Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_DOWNLOAD_TTL),
    );
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const response = await this.fetchFn(this.presign('HEAD', key, 60), { method: 'HEAD' });
    if (response.status === 404) return null;
    if (!response.ok) throw new AppError('INTERNAL', 'No se pudo consultar el almacenamiento');
    return {
      key,
      mime: response.headers.get('content-type') ?? 'application/octet-stream',
      size: Number(response.headers.get('content-length') ?? 0),
    };
  }

  async remove(key: string): Promise<void> {
    const response = await this.fetchFn(this.presign('DELETE', key, 60), { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new AppError('INTERNAL', 'No se pudo borrar el archivo del almacenamiento');
    }
  }
}

/** Sin credenciales de S3 se usa el adaptador en memoria (desarrollo): los extras de texto funcionan, los archivos no. */
export function s3ConfigFromEnv(env: {
  S3_ENDPOINT?: string | undefined;
  S3_BUCKET?: string | undefined;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
  S3_REGION: string;
  S3_FORCE_PATH_STYLE: boolean;
}): S3Config | null {
  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
    return null;
  return {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}
