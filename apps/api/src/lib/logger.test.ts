import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { LOG_REDACTION } from './logger.js';

/** Una petición real, con todas las cabeceras por las que puede viajar una IP, y lo que queda en el registro. */
async function logOf(headers: Record<string, string>) {
  const lines: string[] = [];
  const logger = pino(
    { level: 'info', redact: LOG_REDACTION },
    { write: (line: string) => void lines.push(line) },
  );
  const app = createApp({ env: parseEnv({ NODE_ENV: 'test' }), logger, isDbUp: () => true });
  const req = request(app).get('/api/no-existe');
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  await req;
  return lines.join('\n');
}

describe('los registros no guardan la IP de la lectora', () => {
  it('redacta las cabeceras de IP y la dirección de la conexión', async () => {
    const log = await logOf({
      'CF-Connecting-IP': '203.0.113.7',
      'X-Forwarded-For': '198.51.100.23, 10.29.1.7',
      'X-Real-IP': '192.0.2.44',
      'True-Client-IP': '192.0.2.45',
      Forwarded: 'for=192.0.2.46',
    });
    for (const ip of [
      '203.0.113.7',
      '198.51.100.23',
      '10.29.1.7',
      '192.0.2.44',
      '192.0.2.45',
      '192.0.2.46',
    ]) {
      expect(log, ip).not.toContain(ip);
    }
    // Sigue registrando la petición (qué se pidió y cómo terminó), solo sin la IP.
    expect(log).toContain('/api/no-existe');
    expect(log).toContain('"statusCode":404');
    // La dirección de la conexión tampoco aparece.
    const entry = JSON.parse(log.split('\n')[0] ?? '{}') as { req: Record<string, unknown> };
    expect(entry.req['remoteAddress']).toBeUndefined();
    expect(entry.req['remotePort']).toBeUndefined();
  });

  it('de cada petición solo queda qué se pidió y cómo terminó: ninguna cabecera, aunque no la conozcamos', async () => {
    const log = await logOf({
      'CF-Connecting-IPv6': '2001:db8::1',
      'CF-Pseudo-IPv4': '198.51.100.77',
      'X-Client-IP': '192.0.2.88',
      'Fastly-Client-IP': '192.0.2.89',
      'CF-IPCountry': 'CR',
      'User-Agent': 'NavegadorDePrueba/9.9',
      Origin: 'https://origen-de-prueba.example',
      Referer: 'https://universomemorias.com/registro?correo=secreto@ejemplo.com',
    });
    for (const secret of [
      '2001:db8',
      '198.51.100.77',
      '192.0.2.88',
      '192.0.2.89',
      'NavegadorDePrueba',
      'origen-de-prueba',
      'secreto@ejemplo.com',
    ]) {
      expect(log, secret).not.toContain(secret);
    }
    const entry = JSON.parse(log.split('\n')[0] ?? '{}') as {
      req: Record<string, unknown>;
      res: Record<string, unknown>;
    };
    expect(Object.keys(entry.req).sort()).toEqual(['id', 'method', 'url']);
    expect(entry.res).toEqual({ statusCode: 404 });
  });

  it('sigue ocultando cookies y autorización', async () => {
    const log = await logOf({
      Cookie: 'libro_rt=secreto-de-sesion',
      Authorization: 'Bearer abc123xyz',
    });
    expect(log).not.toContain('secreto-de-sesion');
    expect(log).not.toContain('abc123xyz');
  });
});
