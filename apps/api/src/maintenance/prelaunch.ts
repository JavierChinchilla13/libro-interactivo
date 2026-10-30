import type mongoose from 'mongoose';

type Db = mongoose.mongo.Db;

/**
 * Qué contenido hay en la base y cuál todavía es de muestra. SOLO LEE. Busca textos `[PLACEHOLDER]`, nombres de ejemplo
 * («Libro 1», «ejemplo» en un título), correos `@ejemplo.com` y restos de relleno (lorem ipsum, picsum, placehold).
 * Imprime títulos y conteos; nunca correos completos ni la dirección de conexión.
 */
export interface Pattern {
  id: string;
  label: string;
  test: RegExp;
  /** `true`: solo se busca en títulos y nombres (en un texto largo «por ejemplo» sería un falso aviso). */
  shortFieldsOnly?: boolean;
}

export const PATTERNS: Pattern[] = [
  { id: 'placeholder', label: 'texto [PLACEHOLDER]', test: /\[PLACEHOLDER/i },
  { id: 'libro-n', label: 'nombre «Libro 1/2/3»', test: /\bLibro [1-9]\b/i, shortFieldsOnly: true },
  { id: 'ejemplo', label: 'nombre de ejemplo', test: /\bejemplo\b/i, shortFieldsOnly: true },
  { id: 'correo-ejemplo', label: 'dirección @ejemplo.com', test: /@ejemplo\.com|example\.com/i },
  {
    id: 'relleno',
    label: 'texto o imagen de relleno',
    test: /lorem ipsum|picsum\.photos|placehold\.co|via\.placeholder/i,
  },
];

/** Campos cortos donde un «ejemplo» o un «Libro 1» delata un dato de muestra. */
const SHORT_FIELDS = new Set(['title', 'name', 'label', 'slug', 'tagline', 'headline', 'caption']);

/** Colecciones de contenido y cómo saber si lo ve el público. */
const SOURCES: Array<{
  collection: string;
  label: string;
  visible: (doc: Record<string, unknown>) => boolean;
}> = [
  {
    collection: 'books',
    label: 'Libros',
    visible: (d) => ['published', 'upcoming'].includes(String(d['status'])),
  },
  { collection: 'quizzes', label: 'Quizzes', visible: (d) => d['status'] === 'published' },
  { collection: 'posts', label: 'Actualizaciones', visible: (d) => d['status'] === 'published' },
  { collection: 'reviews', label: 'Reseñas', visible: (d) => d['status'] === 'published' },
  { collection: 'fanArts', label: 'Fan arts', visible: (d) => d['status'] === 'published' },
  {
    collection: 'wikiEntries',
    label: 'Entradas de la wiki',
    visible: (d) => d['status'] === 'published',
  },
  { collection: 'extras', label: 'Capítulos extra', visible: (d) => d['status'] === 'published' },
  {
    collection: 'gameStories',
    label: 'Historias del juego',
    visible: (d) => d['status'] === 'published',
  },
  {
    collection: 'siteSettings',
    label: 'Ajustes del sitio (portada, autora, bienvenida)',
    visible: () => true,
  },
];

export interface Finding {
  collection: string;
  label: string;
  /** Título o nombre (nunca un correo). */
  item: string;
  visible: boolean;
  matches: string[];
}

export interface CollectionSummary {
  collection: string;
  label: string;
  total: number;
  visible: number;
}

export interface PrelaunchReport {
  summaries: CollectionSummary[];
  findings: Finding[];
  /** Cuentas y mensajes con correos de ejemplo, enmascarados. */
  exampleEmails: Array<{ collection: string; masked: string }>;
  activeAdmins: number;
  users: number;
}

/** `ana@ejemplo.com` → `a***@ejemplo.com`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function matchesIn(doc: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      for (const pattern of PATTERNS) {
        if (pattern.shortFieldsOnly && !SHORT_FIELDS.has(key)) continue;
        if (pattern.test.test(value)) found.add(pattern.label);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      for (const [childKey, child] of Object.entries(value)) {
        if (childKey === '_id' || childKey.endsWith('Id')) continue;
        walk(child, childKey);
      }
    }
  };
  for (const [key, value] of Object.entries(doc)) {
    if (key !== '_id') walk(value, key);
  }
  return [...found];
}

function labelOf(doc: Record<string, unknown>): string {
  const label = doc['title'] ?? doc['name'] ?? doc['author'] ?? doc['slug'];
  return typeof label === 'string' && label !== ''
    ? label.slice(0, 80)
    : `(sin título) ${String(doc['_id'])}`;
}

export async function checkPrelaunch(db: Db): Promise<PrelaunchReport> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  const summaries: CollectionSummary[] = [];
  const findings: Finding[] = [];

  for (const source of SOURCES) {
    if (!existing.has(source.collection)) {
      summaries.push({ collection: source.collection, label: source.label, total: 0, visible: 0 });
      continue;
    }
    const docs = (await db.collection(source.collection).find({}).toArray()) as Array<
      Record<string, unknown>
    >;
    summaries.push({
      collection: source.collection,
      label: source.label,
      total: docs.length,
      visible: docs.filter(source.visible).length,
    });
    for (const doc of docs) {
      const matches = matchesIn(doc);
      if (matches.length > 0) {
        findings.push({
          collection: source.collection,
          label: source.label,
          item: labelOf(doc),
          visible: source.visible(doc),
          matches,
        });
      }
    }
  }

  const exampleEmails: PrelaunchReport['exampleEmails'] = [];
  for (const [collection, field] of [
    ['users', 'email'],
    ['contactMessages', 'email'],
  ] as const) {
    if (!existing.has(collection)) continue;
    const docs = await db
      .collection(collection)
      .find({ [field]: /@ejemplo\.com$|@example\.com$/i }, { projection: { [field]: 1 } })
      .toArray();
    for (const doc of docs)
      exampleEmails.push({ collection, masked: maskEmail(String(doc[field])) });
  }

  const users = existing.has('users') ? await db.collection('users').countDocuments({}) : 0;
  const activeAdmins = existing.has('users')
    ? await db.collection('users').countDocuments({ role: 'ADMIN', status: 'active' })
    : 0;
  return { summaries, findings, exampleEmails, activeAdmins, users };
}

export interface PrelaunchLine {
  status: 'ok' | 'fail' | 'warn';
  text: string;
}

/** Convierte el informe en líneas: ✗ si lo que ve el público es de muestra, ! si es un borrador, ✓ si está limpio. */
export function describePrelaunch(report: PrelaunchReport): PrelaunchLine[] {
  const lines: PrelaunchLine[] = [];
  for (const s of report.summaries) {
    lines.push({
      status: 'ok',
      text: `${s.label}: ${s.total} (visibles al público: ${s.visible})`,
    });
  }
  lines.push({ status: 'ok', text: `Cuentas: ${report.users}` });
  lines.push(
    report.activeAdmins > 0
      ? { status: 'ok', text: `Administradoras activas: ${report.activeAdmins}` }
      : { status: 'fail', text: 'No hay ninguna administradora activa (npm run seed:admin).' },
  );
  const books = report.summaries.find((s) => s.collection === 'books');
  if (books && books.visible === 0) {
    lines.push({ status: 'warn', text: 'Ningún libro es visible al público todavía.' });
  }
  for (const f of report.findings) {
    lines.push({
      status: f.visible ? 'fail' : 'warn',
      text: `${f.visible ? 'VISIBLE' : 'borrador'} · ${f.label}: «${f.item}» tiene ${f.matches.join(', ')}`,
    });
  }
  for (const [collection, count] of countBy(report.exampleEmails)) {
    lines.push({
      status: 'fail',
      text: `${count} correo(s) de ejemplo en ${collection === 'users' ? 'cuentas' : 'mensajes de contacto'}: ${report.exampleEmails
        .filter((e) => e.collection === collection)
        .slice(0, 5)
        .map((e) => e.masked)
        .join(', ')}${count > 5 ? '…' : ''}`,
    });
  }
  if (report.findings.length === 0 && report.exampleEmails.length === 0) {
    lines.push({ status: 'ok', text: 'No se encontró contenido de muestra.' });
  }
  return lines;
}

function countBy(items: Array<{ collection: string }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.collection, (map.get(item.collection) ?? 0) + 1);
  return map;
}
