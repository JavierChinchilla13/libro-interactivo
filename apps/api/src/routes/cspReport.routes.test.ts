import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { LOG_REDACTION } from '../lib/logger.js';
import { sanitizeBlocked, sanitizeDirective } from '../services/cspReport.service.js';
import { createTestApp } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const legacy = (report: Record<string, unknown>) => ({ 'csp-report': report });

/** Una app cuyo registro se puede leer, para comprobar qué se anota. */
function appWithLog() {
  const lines: string[] = [];
  const logger = pino(
    { level: 'info', redact: LOG_REDACTION },
    { write: (line: string) => void lines.push(line) },
  );
  const app = createApp({ env: parseEnv({ NODE_ENV: 'test' }), logger, isDbUp: () => true });
  return { app, log: () => lines.join('\n') };
}

const send = (app: ReturnType<typeof createTestApp>, type: string, body: unknown) =>
  request(app).post('/api/csp-report').set('Content-Type', type).send(JSON.stringify(body));

describe('POST /api/csp-report', () => {
  it('acepta el formato antiguo (application/csp-report) con 204 y no devuelve nada', async () => {
    const res = await send(
      createTestApp(),
      'application/csp-report',
      legacy({
        'blocked-uri': 'https://ajeno.example/script.js',
        'violated-directive': 'script-src-elem',
      }),
    );
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('acepta la API de Reportes (application/reports+json) con varias violaciones', async () => {
    const { app, log } = appWithLog();
    const res = await send(app, 'application/reports+json', [
      {
        type: 'csp-violation',
        body: {
          blockedURL: 'https://res.cloudinary.com/x/a.png?token=SECRETO',
          effectiveDirective: 'img-src',
        },
      },
      { type: 'deprecation', body: { blockedURL: 'https://no-es-csp.example/x' } },
      {
        type: 'csp-violation',
        body: { blockedURL: 'inline', effectiveDirective: 'script-src-elem' },
      },
    ]);
    expect(res.status).toBe(204);
    const text = log();
    expect(text).toContain('https://res.cloudinary.com/x/a.png');
    expect(text).toContain('"directive":"img-src"');
    expect(text).toContain('"blocked":"inline"');
    // El que no es una violación de CSP no se anota.
    expect(text).not.toContain('no-es-csp');
  });

  it('solo registra la directiva y el recurso, sin parámetros, sin la página, sin IP y sin cabeceras', async () => {
    const { app, log } = appWithLog();
    await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .set('CF-Connecting-IP', '203.0.113.7')
      .set('User-Agent', 'NavegadorDePrueba/9')
      .set('Referer', 'https://universomemorias.com/restablecer/TOKEN-SECRETO')
      .send(
        JSON.stringify(
          legacy({
            'document-uri':
              'https://universomemorias.com/restablecer/TOKEN-SECRETO?correo=ana@ejemplo.com',
            'blocked-uri': 'https://ajeno.example/pixel.gif?correo=ana@ejemplo.com#ancla',
            'violated-directive': "img-src 'self' https://res.cloudinary.com",
            'original-policy': "default-src 'self'; report-uri /api/csp-report",
            'source-file': 'https://universomemorias.com/assets/index-abc.js',
          }),
        ),
      )
      .expect(204);
    const text = log();
    expect(text).toContain('Violación de la política de contenido');
    expect(text).toContain('"blocked":"https://ajeno.example/pixel.gif"');
    expect(text).toContain('"directive":"img-src"');
    for (const secret of [
      'TOKEN-SECRETO',
      'ana@ejemplo.com',
      '203.0.113.7',
      'NavegadorDePrueba',
      'original-policy',
      'ancla',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it('no escribe en la base de datos ni pide sesión', async () => {
    const before = await Promise.all(
      (await mongoose.connection.db!.collections()).map((c) => c.countDocuments({})),
    );
    await send(
      createTestApp(),
      'application/csp-report',
      legacy({ 'blocked-uri': 'inline', 'violated-directive': 'script-src' }),
    ).expect(204);
    const after = await Promise.all(
      (await mongoose.connection.db!.collections()).map((c) => c.countDocuments({})),
    );
    expect(after).toEqual(before);
  });

  it('rechaza lo que no es un informe: JSON roto, forma desconocida y cuerpo enorme', async () => {
    const app = createTestApp();
    expect(
      (
        await request(app)
          .post('/api/csp-report')
          .set('Content-Type', 'application/csp-report')
          .send('{roto')
      ).status,
    ).toBe(400);
    expect((await send(app, 'application/json', { hola: 'mundo' })).status).toBe(400);
    expect((await send(app, 'application/json', 'solo texto')).status).toBe(400);
    const huge = await send(
      app,
      'application/csp-report',
      legacy({ 'blocked-uri': 'x'.repeat(20_000) }),
    );
    expect(huge.status).toBe(400);
  });

  it('tiene su propio límite de frecuencia', async () => {
    const app = createTestApp({ limits: { cspReport: { windowMs: 60_000, limit: 3 } } });
    const body = legacy({ 'blocked-uri': 'inline', 'violated-directive': 'script-src' });
    for (let i = 0; i < 3; i += 1) await send(app, 'application/csp-report', body).expect(204);
    expect((await send(app, 'application/csp-report', body)).status).toBe(429);
  });

  it('el API sigue pidiendo no indexar esta ruta', async () => {
    const res = await send(
      createTestApp(),
      'application/csp-report',
      legacy({ 'blocked-uri': 'inline' }),
    );
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });
});

describe('limpieza de lo que se registra', () => {
  it('sanitizeBlocked: deja origen y ruta, nunca consulta ni ancla; reconoce palabras clave y rarezas', () => {
    expect(sanitizeBlocked('https://a.example/ruta/x.js?t=1#h')).toBe(
      'https://a.example/ruta/x.js',
    );
    expect(sanitizeBlocked('inline')).toBe('inline');
    expect(sanitizeBlocked('eval')).toBe('eval');
    expect(sanitizeBlocked('data:image/png;base64,AAAA')).toBe('data');
    expect(sanitizeBlocked('blob:https://universomemorias.com/uuid')).toBe('blob');
    expect(sanitizeBlocked('texto raro con ana@ejemplo.com')).toBe('otro');
    expect(sanitizeBlocked(undefined)).toBe('sin dato');
    expect(sanitizeBlocked(`https://a.example/${'x'.repeat(500)}`).length).toBeLessThanOrEqual(200);
  });

  it('sanitizeDirective: solo la directiva, nada de la política', () => {
    expect(sanitizeDirective("script-src-elem 'self' https://x.example")).toBe('script-src-elem');
    expect(sanitizeDirective('IMG-SRC')).toBe('img-src');
    expect(sanitizeDirective('1; DROP')).toBe('otra');
    expect(sanitizeDirective(undefined)).toBe('otra');
  });
});
