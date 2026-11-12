// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_URL,
  indexingControl,
  resolveIndexing,
  robotsTxt,
  type IndexingOptions,
} from './indexing';

describe('resolveIndexing', () => {
  it('por defecto el sitio no se indexa y usa la dirección pública', () => {
    expect(resolveIndexing({})).toEqual({ allow: false, siteUrl: DEFAULT_SITE_URL });
  });

  it('solo el texto exacto «true» abre la indexación', () => {
    expect(resolveIndexing({ VITE_ALLOW_INDEXING: 'true' }).allow).toBe(true);
    for (const value of ['', 'TRUE', '1', 'yes', 'false', ' true']) {
      expect(resolveIndexing({ VITE_ALLOW_INDEXING: value }).allow, value).toBe(false);
    }
  });

  it('normaliza la dirección del sitio y rechaza las inválidas', () => {
    expect(resolveIndexing({ VITE_SITE_URL: 'https://ejemplo.com/' }).siteUrl).toBe(
      'https://ejemplo.com',
    );
    expect(resolveIndexing({ VITE_SITE_URL: 'http://localhost:5173' }).siteUrl).toBe(
      'http://localhost:5173',
    );
    expect(() => resolveIndexing({ VITE_SITE_URL: 'no es una dirección' })).toThrow(
      /VITE_SITE_URL/,
    );
    expect(() => resolveIndexing({ VITE_SITE_URL: 'http://ejemplo.com' })).toThrow(/https/);
  });
});

describe('robots.txt', () => {
  it('apagado: bloquea todo y no anuncia sitemap', () => {
    const text = robotsTxt({ allow: false, siteUrl: DEFAULT_SITE_URL });
    expect(text).toMatch(/^User-agent: \*$/m);
    expect(text).toMatch(/^Disallow: \/$/m);
    expect(text).not.toMatch(/Sitemap:|Allow:/);
  });

  it('encendido: abre el sitio, protege las zonas privadas y anuncia el sitemap', () => {
    const text = robotsTxt({ allow: true, siteUrl: 'https://ejemplo.com' });
    expect(text).toMatch(/^Allow: \/$/m);
    for (const zone of ['/admin', '/panel', '/u/', '/api/']) {
      expect(text).toContain(`Disallow: ${zone}`);
    }
    expect(text).toContain('Sitemap: https://ejemplo.com/sitemap.xml');
    expect(text).not.toContain('{{SITE_URL}}');
  });

  it('encendido: pide a los rastreadores de entrenamiento de IA que no usen el sitio, deja a los buscadores y a PerplexityBot', () => {
    const text = robotsTxt({ allow: true, siteUrl: 'https://ejemplo.com' });
    // Un solo grupo con los cinco agentes y su `Disallow: /`.
    const block = /((?:^User-agent: [^\n*]+\n)+)Disallow: \/\n/m.exec(text);
    expect(block).not.toBeNull();
    const agents = [...(block?.[1] ?? '').matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1]);
    expect(agents).toEqual(['GPTBot', 'CCBot', 'Google-Extended', 'ClaudeBot', 'anthropic-ai']);
    // El grupo de todos los demás (buscadores incluidos) sigue abierto: su único bloqueo es de las zonas privadas.
    const everyone = text.slice(text.indexOf('User-agent: *'), text.indexOf('User-agent: GPTBot'));
    expect(everyone).toMatch(/^Allow: \/$/m);
    expect(everyone).not.toMatch(/^Disallow: \/$/m);
    expect(text).not.toMatch(/^User-agent: (Googlebot|Bingbot|PerplexityBot)/im);
    // La petición se explica como cortesía y ya no queda «decisión pendiente».
    expect(text).toMatch(/cortesía/);
    expect(text).not.toMatch(/pendiente/i);
    expect(text).not.toMatch(/^# User-agent/m);
  });
});

describe('indexingControl en un build real de Vite', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'indexing-'));
    writeFileSync(
      join(root, 'index.html'),
      '<!doctype html><html lang="es"><head><meta charset="UTF-8" /><title>Prueba</title></head><body></body></html>',
    );
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  async function assets(options: IndexingOptions): Promise<Record<string, string>> {
    const result = (await build({
      root,
      logLevel: 'silent',
      configFile: false,
      plugins: [indexingControl(options)],
      build: { write: false },
    })) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const output = Array.isArray(result) ? result.flatMap((item) => item.output) : result.output;
    return Object.fromEntries(
      output.flatMap((chunk) =>
        chunk.type === 'asset' ? [[chunk.fileName, String(chunk.source)] as const] : [],
      ),
    );
  }

  it('apagado: el HTML trae noindex y el robots.txt bloquea', async () => {
    const files = await assets({ allow: false, siteUrl: DEFAULT_SITE_URL });
    expect(files['index.html']).toMatch(/<meta name="robots" content="noindex, nofollow">/);
    expect(files['robots.txt']).toMatch(/^Disallow: \/$/m);
  });

  it('encendido: el HTML no trae noindex y el robots.txt abre y anuncia el sitemap', async () => {
    const files = await assets({ allow: true, siteUrl: 'https://ejemplo.com' });
    expect(files['index.html']).not.toMatch(/noindex/);
    expect(files['robots.txt']).toContain('Sitemap: https://ejemplo.com/sitemap.xml');
    // El sitio sigue abierto: el único `Disallow: /` es el de los rastreadores de IA, no el de todos.
    const everyone = files['robots.txt']?.split('User-agent: GPTBot')[0] ?? '';
    expect(everyone).not.toMatch(/^Disallow: \/$/m);
    expect(files['robots.txt']).toMatch(/^User-agent: GPTBot$/m);
  });
});
