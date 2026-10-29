import { isIP } from 'node:net';
import type { RequestHandler } from 'express';

/**
 * La dirección de `CF-Connecting-IP` solo si es **una** IP válida: sin texto extra, sin zona IPv6 (`%eth0`) y sin
 * cabeceras repetidas (Node las une con coma, y eso no es una IP). Cualquier otra cosa devuelve `null`.
 */
export function parseCloudflareIp(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const value = header.trim();
  return !value.includes('%') && isIP(value) !== 0 ? value : null;
}

/**
 * Con `TRUST_CLOUDFLARE_HEADER` encendido, la IP de quien llama (`req.ip`, que usan los límites de intentos y los
 * registros de auditoría) sale de `CF-Connecting-IP`. Si la cabecera falta o no es válida no se toca nada y sigue
 * rigiendo la resolución por `TRUST_PROXY_HOPS`. Apagado, la cabecera se ignora por completo.
 *
 * Supuesto (ver la guía de medición): el origen solo recibe tráfico que pasó por Cloudflare. Si alguien llegara al
 * origen directo, podría escribir esta cabecera a su gusto.
 */
export function createClientIpMiddleware(enabled: boolean): RequestHandler {
  return (req, _res, next) => {
    if (enabled) {
      const ip = parseCloudflareIp(req.headers['cf-connecting-ip']);
      if (ip !== null) {
        Object.defineProperty(req, 'ip', { value: ip, enumerable: true, configurable: true });
      }
    }
    next();
  };
}
