// Genera los iconos del sitio y la imagen social por omisión desde `public/favicon.svg`.
// Uso: `npm run icons` (desde la raíz). Usa el navegador que ya trae Playwright (Edge en local, Chromium en CI) y no
// agrega ninguna dependencia. Los PNG resultantes se versionan en `apps/web/public/`.
/* global process, document, console */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const svg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');
const require = createRequire(import.meta.url);
const cinzel = readFileSync(
  require.resolve('@fontsource-variable/cinzel/files/cinzel-latin-wght-normal.woff2'),
).toString('base64');

const SQUARES = [
  ['favicon-32.png', 32],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

const browser = await chromium.launch(process.env['CI'] ? {} : { channel: 'msedge' });
try {
  for (const [file, size] of SQUARES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace(
        '<svg ',
        `<svg width="${size}" height="${size}" `,
      )}</div></body>`,
    );
    writeFileSync(join(publicDir, file), await page.screenshot({ omitBackground: true }));
    await page.close();
  }

  // Imagen social por omisión (1200 × 630): la marca y la frase del sitio. Es una imagen genérica de marca; la de la
  // autora o la portada de un libro la reemplazan donde existan.
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<style>
    @font-face { font-family: 'Cinzel'; font-weight: 400 900;
      src: url(data:font/woff2;base64,${cinzel}) format('woff2'); }
    body { margin: 0; width: 1200px; height: 630px; background: #06142b;
      background-image: radial-gradient(ellipse at 18% 20%, #0d4a7f 0%, transparent 55%);
      display: flex; flex-direction: column; justify-content: center; padding: 0 96px; box-sizing: border-box;
      font-family: 'Cinzel', Georgia, serif; color: #e8f5ff; }
    .mark { width: 96px; height: 96px; border-radius: 22px; background: #030b1a; border: 2px solid #3fd8ff;
      color: #3fd8ff; font-size: 64px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    h1 { font-size: 92px; font-weight: 700; margin: 40px 0 0; letter-spacing: 0.01em; line-height: 1.05; }
    p { font-size: 34px; margin: 28px 0 0; color: #9cc2e2; font-weight: 400; }
  </style>
  <div class="mark">M</div><h1>Universo Memorias</h1>
  <p>Una saga que se lee, se descubre y se juega.</p>`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(join(publicDir, 'og-default.png'), await page.screenshot());
  await page.close();
} finally {
  await browser.close();
}
// eslint-disable-next-line no-console -- es un guion de línea de comandos
console.log('Iconos e imagen social generados en apps/web/public/.');
