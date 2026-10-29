import { isIP } from 'node:net';
import type { NetworkCheckResponse } from '@libro/shared';
import { parseCloudflareIp } from './clientIp.js';

/** Hasta cuántos saltos se prueban en el diagnóstico (el máximo de `TRUST_PROXY_HOPS` es 5). */
const MAX_CANDIDATE_HOPS = 5;

/** Quita el prefijo de IPv4 mapeada en IPv6 (`::ffff:1.2.3.4`) que Node pone en algunos sockets. */
function plain(ip: string): string {
  return ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/** Los ocho grupos de una IPv6 válida (expande `::`). */
function ipv6Groups(ip: string): string[] {
  const [head = '', tail = ''] = ip.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === '' ? [] : tail.split(':');
  const missing = ip.includes('::') ? 8 - left.length - right.length : 0;
  return [...left, ...Array<string>(Math.max(missing, 0)).fill('0'), ...right];
}

/**
 * Enmascara una dirección para mostrarla sin guardarla entera: IPv4 `190.12.34.x`; IPv6 solo los primeros tres grupos
 * (`2800:4f0:1a2::x`). Lo que no es una dirección no se muestra tal cual (podría ser texto inventado en la cabecera).
 */
export function maskIp(raw: string): string {
  const ip = plain(raw.trim());
  const version = isIP(ip);
  if (version === 4) return `${ip.split('.').slice(0, 3).join('.')}.x`;
  if (version === 6) return `${ipv6Groups(ip).slice(0, 3).join(':')}::x`;
  return '(no es una dirección válida)';
}

/** Privada, local, de enlace local o compartida (CGNAT): lo que un proxy de plataforma usa entre sus piezas. */
export function looksInternal(raw: string): boolean {
  const ip = plain(raw.trim());
  const version = isIP(ip);
  if (version === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (version === 6) {
    const first = (ipv6Groups(ip)[0] ?? '0').padStart(4, '0');
    return (
      ip === '::1' ||
      ip === '::' ||
      first.startsWith('fc') ||
      first.startsWith('fd') ||
      first.startsWith('fe8')
    );
  }
  return false;
}

/** Las entradas de `X-Forwarded-For`, de izquierda (más cercana a la persona) a derecha (más cercana al API). */
export function parseForwardedFor(header: string | undefined): string[] {
  return (header ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Qué dirección resolvería Express con `trust proxy = hops`: se parte de la conexión directa y se retrocede por la
 * cadena `X-Forwarded-For` un lugar por cada salto de confianza; si la cadena se acaba, la más a la izquierda.
 */
export function addressForHops(remote: string, forwardedFor: string[], hops: number): string {
  const chain = [remote, ...[...forwardedFor].reverse()];
  return chain[Math.min(hops, chain.length - 1)] ?? remote;
}

export interface NetworkSnapshot {
  /** Dirección de la conexión directa con el API (el último proxy). */
  remote: string;
  forwardedFor: string | undefined;
  cfConnectingIp: string | undefined;
  configuredHops: number;
  /** `TRUST_CLOUDFLARE_HEADER`: si está encendida, una `CF-Connecting-IP` válida manda sobre los saltos. */
  trustCloudflareHeader: boolean;
}

/** Arma la respuesta del diagnóstico. Función pura: no lee ni guarda nada fuera de sus argumentos. */
export function describeNetwork(snapshot: NetworkSnapshot): NetworkCheckResponse {
  const entries = parseForwardedFor(snapshot.forwardedFor);
  const cf = snapshot.cfConnectingIp?.trim();
  const cfValid = parseCloudflareIp(snapshot.cfConnectingIp);
  const byHops = addressForHops(snapshot.remote, entries, snapshot.configuredHops);
  const useCf = snapshot.trustCloudflareHeader && cfValid !== null;
  const candidates = Array.from({ length: MAX_CANDIDATE_HOPS + 1 }, (_, hops) => {
    const address = addressForHops(snapshot.remote, entries, hops);
    return {
      hops,
      masked: maskIp(address),
      looksInternal: looksInternal(address),
      current: hops === snapshot.configuredHops,
    };
  });
  return {
    configuredHops: snapshot.configuredHops,
    forwardedForEntries: entries.length,
    hasCfConnectingIp: cf !== undefined && cf !== '',
    cfConnectingIpMasked: cf ? maskIp(cf) : null,
    trustCloudflareHeader: snapshot.trustCloudflareHeader,
    cfConnectingIpValid: cfValid !== null,
    resolvedSource: useCf ? 'cf-connecting-ip' : 'trust-proxy-hops',
    resolvedMasked: maskIp(useCf ? cfValid : byHops),
    resolvedByHopsMasked: maskIp(byHops),
    resolvedWithCloudflareMasked: cfValid !== null ? maskIp(cfValid) : null,
    candidates,
  };
}
