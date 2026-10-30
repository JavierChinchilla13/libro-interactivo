// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Compila la aplicación de verdad (sin escribir a disco) y revisa lo que saldría publicado. */
describe('la aplicación compilada', () => {
  let output: Rollup.OutputAsset[] | Rollup.OutputChunk[] = [];
  let all: Array<Rollup.OutputAsset | Rollup.OutputChunk> = [];

  beforeAll(async () => {
    const result = (await build({
      root,
      logLevel: 'silent',
      configFile: resolve(root, 'vite.config.ts'),
      build: { write: false, outDir: 'dist-test-no-escribir' },
    })) as Rollup.RollupOutput | Rollup.RollupOutput[];
    all = Array.isArray(result) ? result.flatMap((item) => item.output) : result.output;
    output = all as never;
  }, 120_000);

  it('no publica mapas de código ni referencias a ellos', () => {
    expect(output.length).toBeGreaterThan(0);
    const maps = all.filter((file) => file.fileName.endsWith('.map'));
    expect(maps.map((file) => file.fileName)).toEqual([]);
    for (const file of all) {
      const code = file.type === 'chunk' ? file.code : String(file.source);
      if (!/\.(js|css|html)$/.test(file.fileName)) continue;
      expect(code, file.fileName).not.toMatch(/sourceMappingURL=/);
    }
  });

  it('el HTML trae las etiquetas sociales del sitio, los iconos y el manifest', () => {
    const html = all.find((file) => file.fileName === 'index.html');
    const text = html && html.type === 'asset' ? String(html.source) : '';
    expect(text).toMatch(
      /<meta property="og:image" content="https:\/\/universomemorias\.com\/og-default\.png"/,
    );
    expect(text).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
    expect(text).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    expect(text).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
    // El canónico no va fijo en el HTML (todas las páginas lo comparten): lo pone cada página.
    expect(text).not.toMatch(/rel="canonical"/);
  });

  it('los archivos que se copian tal cual existen: iconos, imagen social, manifest y la página 404', () => {
    for (const name of [
      'favicon.svg',
      'favicon-32.png',
      'icon-192.png',
      'icon-512.png',
      'apple-touch-icon.png',
      'og-default.png',
      'manifest.webmanifest',
      '404.html',
    ]) {
      expect(existsSync(resolve(root, 'public', name)), name).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      '/icon-192.png',
      '/icon-512.png',
    ]);
    const notFound = readFileSync(resolve(root, 'public/404.html'), 'utf8');
    expect(notFound).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(notFound.match(/<h1>/g)).toHaveLength(1);
  });
});
