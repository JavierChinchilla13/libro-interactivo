// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Concordancia de género de las etiquetas de estado. Las del panel de administración y del lector van en masculino
 * (usuario, lector, código, quiz, libro, capítulo, mensaje, aviso, correo) salvo cuando el sujeto es femenino (cuenta,
 * carta, actualización, reseña, entrada de la wiki, versión, pestaña, pregunta, etapa). Esta prueba busca etiquetas de
 * estado terminadas en -a/-as escritas como texto y exige que cada archivo que las usa esté en la lista de abajo, donde
 * se anota quién es el sujeto: así una etiqueta femenina nueva obliga a revisar a qué sustantivo acompaña.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORDS = [
  'Activa',
  'Activas',
  'Desactivada',
  'Desactivadas',
  'Bloqueada',
  'Bloqueadas',
  'Verificada',
  'Verificadas',
  'Confirmada',
  'Confirmadas',
  'Apuntada',
  'Apuntadas',
  'Invitada',
  'Invitadas',
  'Revocada',
  'Revocadas',
  'Atendida',
  'Atendidas',
  'Aprobada',
  'Aprobadas',
  'Cancelada',
  'Canceladas',
  'Terminada',
  'Terminadas',
  'Completada',
  'Completadas',
  'Abierta',
  'Abiertas',
  'Cerrada',
  'Cerradas',
  'Habilitada',
  'Habilitadas',
  'Publicada',
  'Publicadas',
  'Archivada',
  'Archivadas',
  'Programada',
  'Programadas',
  'Oculta',
  'Ocultas',
];

/** Archivos donde el estado femenino es correcto, y el sustantivo femenino al que acompaña. */
const FEMININE_SUBJECT: Record<string, string> = {
  'features/admin/cards/CardFormPage.tsx': 'carta',
  'features/admin/cards/CardListPage.tsx': 'carta',
  'features/admin/community/ReviewPages.tsx': 'reseña',
  'features/admin/posts/postForm.ts': 'actualización',
  'features/admin/posts/PostListPage.tsx': 'actualización',
  'features/admin/wiki/WikiFormPage.tsx': 'entrada de la wiki',
  'features/admin/wiki/WikiListPage.tsx': 'entrada de la wiki',
  'features/admin/quizzes/VersionsTab.tsx': 'versión',
  'features/cards/CardsPage.tsx': 'carta',
};

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) yield path;
  }
}

// Una etiqueta: la palabra sola o al inicio de una cadena/texto («Activas», «Publicada o programada»).
const label = new RegExp(`(?:["'\`>]|\\{\\s*)\\s*(${WORDS.join('|')})(?=[\\s"'\`<.,:;{]|$)`);

describe('género de las etiquetas de estado', () => {
  it('ninguna etiqueta de estado femenina queda fuera de un sujeto femenino', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (FEMININE_SUBJECT[rel]) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          const match = label.exec(line);
          if (match)
            offenders.push(`${rel}:${index + 1}: «${match[1]}» → ${line.trim().slice(0, 90)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('las etiquetas por defecto de StatusBadge van en masculino', () => {
    const source = readFileSync(join(SRC, 'features/admin/components/StatusBadge.tsx'), 'utf8');
    const labels = [...source.matchAll(/label: '([^']+)'/g)].map((m) => m[1] ?? '');
    expect(labels.length).toBeGreaterThan(8);
    expect(labels).toContain('Activo');
    expect(labels).toContain('Desactivado');
    for (const text of labels) {
      expect(text, text).not.toMatch(/^(Activa|Desactivada|Publicada|Archivada|Programada)$/);
    }
  });

  it('la lista de sujetos femeninos solo nombra archivos que existen', () => {
    for (const rel of Object.keys(FEMININE_SUBJECT)) {
      expect(statSync(join(SRC, rel)).isFile(), rel).toBe(true);
    }
  });
});
