import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const WEB = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(path, 'utf8');
/** El código sin comentarios: un comentario que explica el cambio de letra no es una dependencia. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function files(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, found);
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

const tokens = read(join(SRC, 'shared/styles/tokens.css'));
const index = read(join(SRC, 'shared/styles/index.css'));

describe('tipografía de titulares (Michroma)', () => {
  it('los titulares usan Michroma por defecto y la letra se cambia con un solo valor de <html>', () => {
    expect(read(join(WEB, 'index.html'))).toMatch(/<html [^>]*data-titulares="michroma"/);
    expect(tokens).toMatch(/--token-font-display:\s*'Michroma'/);
    // El camino de vuelta: un bloque propio que cambia la letra y lo que depende de ella.
    const cinzel = /:root\[data-titulares='cinzel'\]\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? '';
    expect(cinzel).toContain("--token-font-display: 'Cinzel Variable'");
    for (const variable of [
      '--token-display-scale: 1',
      '--token-display-tracking',
      '--token-weight-emphasis: 800',
      '--token-emph-color',
    ]) {
      expect(cinzel).toContain(variable);
    }
  });

  it('Michroma no se usa para la interfaz ni para la lectura: Jost y Newsreader no la nombran', () => {
    expect(/--token-font-sans:([^;]*);/.exec(tokens)?.[1]).not.toMatch(/Michroma/i);
    expect(/--token-font-read:([^;]*);/.exec(tokens)?.[1]).not.toMatch(/Michroma/i);
    // Ningún componente ni hoja de estilo la nombra: todo pasa por el token.
    const offenders = files(SRC)
      .filter((path) => !/shared[\\/]styles[\\/](tokens|index)\.css$/.test(path))
      // El crédito de licencia de /terminos sí nombra la letra.
      .filter((path) => !/legal[\\/]TermsPage\.tsx$/.test(path))
      .filter((path) => /Michroma/.test(code(path)));
    expect(offenders).toEqual([]);
  });

  it('ningún componente depende del nombre Cinzel: solo los tokens y la hoja global la conocen', () => {
    const offenders = files(SRC)
      .filter((path) => !/shared[\\/]styles[\\/](tokens|index)\.css$/.test(path))
      .filter((path) => /Cinzel/i.test(code(path)));
    expect(offenders.map((path) => path.replace(SRC, ''))).toEqual([]);
  });

  it('se autohospeda: solo el subconjunto latino, un peso, sin CDN y con letra de reserva de métricas ajustadas', () => {
    const face = /@font-face\s*\{[^}]*font-family:\s*'Michroma';[^}]*\}/.exec(index)?.[0] ?? '';
    expect(face).toContain('@fontsource/michroma/files/michroma-latin-400-normal.woff2');
    expect(face).toContain('font-weight: 400');
    expect(face).not.toMatch(/https?:\/\//);
    const fallback =
      /@font-face\s*\{[^}]*font-family:\s*'Michroma Fallback';[^}]*\}/.exec(index)?.[0] ?? '';
    for (const descriptor of ['size-adjust', 'ascent-override', 'descent-override']) {
      expect(fallback).toContain(descriptor);
    }
    expect(tokens).toMatch(/--token-font-display:[^;]*'Michroma Fallback'/);
  });

  it('cubre el español: acentos, ñ, ¿ ¡ « » y comillas curvas están en el rango de la letra', () => {
    const range = /font-family:\s*'Michroma';[^}]*unicode-range:([^;]*);/.exec(index)?.[1] ?? '';
    const covered = (char: string) => {
      const code = char.codePointAt(0)!;
      return [...range.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)].some((match) => {
        const from = parseInt(match[1]!, 16);
        const to = match[2] ? parseInt(match[2], 16) : from;
        return code >= from && code <= to;
      });
    };
    for (const char of 'áéíóúüñÁÉÍÓÚÜÑ¿¡«»“”‘’—…') expect(covered(char), char).toBe(true);
  });

  it('todo estilo que use la letra de titulares impide la negrita simulada (un solo peso)', () => {
    const missing: string[] = [];
    for (const path of files(SRC).filter((file) => file.endsWith('.css'))) {
      for (const match of read(path).matchAll(
        /([^{}]+)\{([^{}]*font-family:\s*var\(--token-font-display\)[^{}]*)\}/g,
      )) {
        if (!/font-synthesis:\s*none/.test(match[2]!))
          missing.push(`${path.replace(SRC, '')}: ${match[1]!.trim()}`);
      }
    }
    expect(missing).toEqual([]);
    expect(index).toMatch(/\.font-display\s*\{\s*font-synthesis:\s*none/);
  });

  it('el énfasis de un titular no sube de peso: se distingue por color', () => {
    expect(tokens).toMatch(/--token-weight-emphasis:\s*400/);
    expect(tokens).toMatch(/--token-emph-color:\s*var\(--token-primary\)/);
    expect(index).toMatch(/\.emph\s*\{[^}]*color:\s*var\(--token-emph-color\)/);
  });

  it('los titulares no llevan tracking añadido ni quedan en el tamaño de Cinzel (≈70 %)', () => {
    expect(tokens).toMatch(/--token-display-tracking:\s*0;/);
    expect(tokens).toMatch(/--token-display-scale:\s*0\.7;/);
    expect(tokens).toMatch(
      /--token-text-h1:\s*calc\(clamp\([^)]*\)\s*\*\s*var\(--token-display-scale\)\)/,
    );
  });

  it('la administración no usa Michroma: sus títulos son Jost semibold', () => {
    const admin = read(join(SRC, 'features/admin/adminTheme.css'));
    expect(admin).toMatch(
      /\.admin-shell\s*\{[^}]*--token-font-display:\s*var\(--token-font-sans\)/,
    );
    expect(admin).toMatch(/--token-weight-display:\s*600/);
    expect(admin).toMatch(/--token-display-scale:\s*1;/);
  });

  it('la dependencia de Michroma está instalada y la precarga sigue al atributo de <html>', () => {
    const pkg = JSON.parse(read(join(WEB, 'package.json'))) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@fontsource/michroma']).toBeDefined();
    const vite = read(join(WEB, 'vite.config.ts'));
    expect(vite).toContain('michroma-latin-400-normal');
    expect(vite).toContain('data-titulares');
  });
});
