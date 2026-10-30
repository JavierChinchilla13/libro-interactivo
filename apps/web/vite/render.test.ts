// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../src/app/routeList';
import { buildCsp, inlineScriptHashes } from './csp';

const web = fileURLToPath(new URL('..', import.meta.url));
const yaml = readFileSync(resolve(web, '../../render.yaml'), 'utf8');
const envSource = readFileSync(resolve(web, '../api/src/config/env.ts'), 'utf8');

/** `render.yaml` se lee como texto: partido en servicios (cada uno empieza con `  - type: web`). */
const [apiBlock = '', webBlock = ''] = yaml.split(/^ {2}- type: web$/m).slice(1);

const rewrites = [
  ...webBlock.matchAll(/- type: rewrite\n\s+source: (\S+)\n\s+destination: (\S+)/g),
].map((m) => ({ source: m[1] ?? '', destination: m[2] ?? '' }));
const headers = [...webBlock.matchAll(/- path: (\S+)\n\s+name: (\S+)\n\s+value: (.+)/g)].map(
  (m) => ({
    path: m[1] ?? '',
    name: m[2] ?? '',
    value: (m[3] ?? '').replace(/^"|"$/g, ''),
  }),
);
const envVars = (block: string) =>
  [...block.matchAll(/- key: (\w+)(?: [^\n]*)?\n\s+(sync: false|value: (.+))/g)].map((m) => ({
    key: m[1] ?? '',
    sync: m[2] === 'sync: false',
    value: m[3]?.replace(/^'|'$/g, ''),
  }));

describe('render.yaml: dos servicios', () => {
  it('tiene el API (Node) y el sitio estático', () => {
    expect(apiBlock).toMatch(/runtime: node\n\s+name: universomemorias-api/);
    expect(webBlock).toMatch(/runtime: static\n\s+name: universomemorias-web/);
  });

  it('el API usa los comandos que ya funcionan (los de compilar y arrancar del repositorio)', () => {
    expect(apiBlock).toContain(
      'buildCommand: npm ci --include=dev && npm run build -w packages/shared && npm run build -w packages/game-core && npm run build -w apps/api',
    );
    expect(apiBlock).toContain('startCommand: node apps/api/dist/server.js');
    expect(apiBlock).toContain('healthCheckPath: /api/health');
    expect(apiBlock).toContain('plan: free');
  });

  it('el sitio compila shared y web y publica apps/web/dist', () => {
    expect(webBlock).toContain(
      'buildCommand: npm ci --include=dev && npm run build -w packages/shared && npm run build -w apps/web',
    );
    expect(webBlock).toContain('staticPublishPath: apps/web/dist');
  });
});

describe('render.yaml: variables', () => {
  const api = envVars(apiBlock);
  const site = envVars(webBlock);

  it('los secretos y direcciones piden su valor al crear (sync: false) y nunca lo traen escrito', () => {
    for (const key of [
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'ACCESS_TOKEN_SECRET',
      'RESEND_API_KEY',
      'CLOUDINARY_API_SECRET',
      'S3_SECRET_ACCESS_KEY',
      'APP_URL',
      'CORS_ORIGIN',
    ]) {
      expect(api.find((v) => v.key === key)?.sync, key).toBe(true);
    }
  });

  it('solo cuatro variables traen valor, y ninguna es un secreto', () => {
    const withValue = [...api, ...site].filter((v) => !v.sync).map((v) => `${v.key}=${v.value}`);
    expect(withValue.sort()).toEqual(
      [
        'NODE_ENV=production',
        'TRUST_CLOUDFLARE_HEADER=true',
        'TRUST_PROXY_HOPS=1',
        'VITE_SITE_URL=https://universomemorias.com',
      ].sort(),
    );
  });

  it('no declara lo que debe quedar sin definir hoy ni lo que el API prohíbe en producción', () => {
    const all = [...api, ...site].map((v) => v.key);
    for (const forbidden of ['ALLOW_INDEXING', 'VITE_ALLOW_INDEXING', 'RATE_LIMIT_MULTIPLIER']) {
      expect(all).not.toContain(forbidden);
    }
    expect(all.some((key) => key.startsWith('SEED_'))).toBe(false);
  });

  it('cada variable del API existe de verdad en la validación de entorno (sin errores de dedo)', () => {
    for (const { key } of api) expect(envSource, key).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it('el sitio solo usa variables VITE_ que la aplicación lee', () => {
    expect(site.map((v) => v.key).sort()).toEqual(['VITE_GOOGLE_CLIENT_ID', 'VITE_SITE_URL']);
  });
});

describe('render.yaml: rutas del sitio estático', () => {
  it('el API y el sitemap se reenvían al API, antes que cualquier regla de la aplicación', () => {
    expect(rewrites[0]).toEqual({
      source: '/api/*',
      destination: 'https://universomemorias-api.onrender.com/api/*',
    });
    expect(rewrites[1]).toEqual({
      source: '/sitemap.xml',
      destination: 'https://universomemorias-api.onrender.com/api/sitemap.xml',
    });
  });

  it('cada ruta de la aplicación (APP_ROUTES, salvo «/») recibe index.html, y nada más', () => {
    const appRules = rewrites.slice(2);
    expect(appRules.every((rule) => rule.destination === '/index.html')).toBe(true);
    expect(appRules.map((rule) => rule.source).sort()).toEqual(
      APP_ROUTES.filter((route) => route !== '/').sort(),
    );
  });

  it('no hay comodín que dé 200 a cualquier dirección: lo que no existe recibe 404.html', () => {
    for (const rule of rewrites) {
      expect(['/*', '/**', '*']).not.toContain(rule.source);
    }
    expect(webBlock).not.toMatch(/source: \/\*\n/);
  });
});

describe('render.yaml: cabeceras', () => {
  const header = (name: string) => headers.filter((h) => h.name === name);

  it('trae las de seguridad en todas las rutas', () => {
    for (const name of [
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'X-Frame-Options',
      'Permissions-Policy',
    ]) {
      expect(
        header(name).map((h) => h.path),
        name,
      ).toEqual(['/*']);
    }
    expect(header('X-Content-Type-Options')[0]?.value).toBe('nosniff');
    expect(header('X-Frame-Options')[0]?.value).toBe('DENY');
    expect(header('Strict-Transport-Security')[0]?.value).toMatch(/max-age=31536000/);
  });

  it('los archivos con hash se guardan un año; nada de caché larga para el HTML', () => {
    expect(header('Cache-Control')).toEqual([
      { path: '/assets/*', name: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]);
  });

  it('la política de contenido va en SOLO REPORTE y nunca en bloqueo', () => {
    expect(header('Content-Security-Policy-Report-Only')).toHaveLength(1);
    expect(header('Content-Security-Policy')).toHaveLength(0);
  });

  describe('la copia de la política coincide con la que se calcula del sitio compilado', () => {
    let html = '';
    beforeAll(async () => {
      const result = (await build({
        root: web,
        logLevel: 'silent',
        configFile: resolve(web, 'vite.config.ts'),
        build: { write: false, outDir: 'dist-test-no-escribir' },
      })) as Rollup.RollupOutput | Rollup.RollupOutput[];
      const output = Array.isArray(result) ? result.flatMap((r) => r.output) : result.output;
      const page = output.find((file) => file.fileName === 'index.html');
      html = page && page.type === 'asset' ? String(page.source) : '';
    }, 120_000);

    it('mismas huellas de scripts en línea, mismas direcciones: si cambia index.html hay que correr `npm run csp:print`', () => {
      const hashes = inlineScriptHashes(html);
      expect(hashes.length).toBeGreaterThan(0);
      expect(header('Content-Security-Policy-Report-Only')[0]?.value).toBe(buildCsp(hashes));
    });

    it('lo que reporta va al API y la política no abre scripts de más', () => {
      const policy = buildCsp(inlineScriptHashes(html));
      expect(policy).toContain('report-uri /api/csp-report');
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
      expect(policy).not.toContain('*');
    });

    it('el HTML ya no lleva el script de precarga en línea (su contenido cambia en cada compilación)', () => {
      const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
        (m) => !/\bsrc\s*=/i.test(m[1] ?? ''),
      );
      expect(inline).toHaveLength(1); // solo el de los pedidos tempranos, que no cambia
      expect(inline[0]?.[2]).not.toContain('modulepreload');
      expect(html).toMatch(/<script src="\/preload-direct\.js" async>/);
    });
  });
});
