import type {
  ImageRef,
  PublicWikiEntryResponse,
  PublicWikiEntriesResponse,
  PublicWikiItem,
  PublicWikiLeaf,
  PublicWikiSection,
  PublicWikiSectionsResponse,
  Role,
  UnlockRule,
  WikiKind,
} from '@libro/shared';
import { AppError } from '../lib/errors.js';
import { normalizeName } from '../lib/text.js';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { isStaff } from './progress.service.js';

/** Quién pregunta: un visitante (sin `userId`) o una persona con sesión. */
export interface Viewer {
  userId?: string;
  role?: Role;
}

type SectionKind = 'character' | 'power_field' | 'place' | 'term';
type BookLean = Awaited<ReturnType<typeof loadPublishedBooks>>[number];
type EntryLean = Awaited<ReturnType<typeof loadEntries>>[number];
type State = 'open' | 'locked' | 'hidden';

interface Ctx {
  staff: boolean;
  /** `quiz:<id>` / `game:<id>` completados por esta persona (en cualquier libro). */
  completed: Set<string>;
  /** Solo libros publicados: la wiki de un libro sin publicar no existe para el público. */
  books: Map<string, BookLean>;
}

const NOT_UNLOCKED = 'Aún no puedes acceder a este contenido';

async function loadPublishedBooks() {
  return Book.find({ status: 'published' }).select('wikiSections status').lean();
}
async function loadEntries(filter: Record<string, unknown>) {
  return WikiEntry.find(filter).sort({ order: 1, nameNormalized: 1 }).lean();
}

/** Los poderes viven dentro de su campo: comparten la pestaña «Poderes». */
const sectionKindOf = (kind: WikiKind): SectionKind => (kind === 'power' ? 'power_field' : kind);

const ruleKey = (rule: UnlockRule) => `${rule.kind}:${rule.refId}`;

function toLeaf(entry: EntryLean): PublicWikiLeaf & { locked: false } {
  return {
    locked: false,
    id: entry._id.toString(),
    kind: entry.kind,
    slug: entry.slug,
    name: entry.name,
    letter: entry.letter,
    ...(entry.summary ? { summary: entry.summary } : {}),
    ...(entry.image ? { image: entry.image as ImageRef } : {}),
    ...(entry.group ? { group: entry.group } : {}),
    order: entry.order,
  };
}

/** Una entrada bloqueada se describe solo así: nada de nombre, imagen ni slug. */
const lockedLeaf = (entry: EntryLean): PublicWikiLeaf => ({
  locked: true,
  id: entry._id.toString(),
  kind: entry.kind,
  order: entry.order,
});

/**
 * Wiki pública (fase 9). **Toda decisión de acceso se toma aquí, en cada petición**: la pestaña (regla del libro) y
 * la entrada (su propia regla; un poder además hereda la de su campo). Lo bloqueado nunca entrega contenido y lo
 * oculto (`lockedDisplay: 'hide'`) es indistinguible de lo que no existe. EDITOR y ADMIN lo ven todo (vista previa).
 */
export function createPublicWikiService() {
  async function context(viewer: Viewer): Promise<Ctx> {
    const staff = viewer.role !== undefined && isStaff(viewer.role);
    const completed = new Set<string>();
    if (viewer.userId && !staff) {
      const progress = await UserProgress.find({ userId: viewer.userId })
        .select('completed')
        .lean();
      for (const doc of progress) {
        for (const item of doc.completed ?? [])
          completed.add(`${item.kind}:${item.refId.toString()}`);
      }
    }
    const books = new Map((await loadPublishedBooks()).map((book) => [book._id.toString(), book]));
    return { staff, completed, books };
  }

  const ruleMet = (rule: UnlockRule | undefined, ctx: Ctx) =>
    rule === undefined || ctx.staff || ctx.completed.has(ruleKey(rule));

  /** Estado de la pestaña `kind` de un libro: oculta (no existe o está apagada), bloqueada o abierta. */
  function sectionState(book: BookLean, kind: SectionKind, ctx: Ctx): State {
    const section = (book.wikiSections ?? []).find((s) => s.kind === kind && s.enabled);
    if (!section) return 'hidden';
    return ruleMet(section.unlockAfter as UnlockRule | undefined, ctx) ? 'open' : 'locked';
  }

  /**
   * Pestaña que gobierna a una entrada. Una de toda la saga (sin libro) es tan estricta como el libro más
   * estricto: nunca se abre por consultarla «sin libro».
   */
  function entrySectionState(entry: EntryLean, ctx: Ctx): State {
    const kind = sectionKindOf(entry.kind);
    if (entry.bookId) {
      const book = ctx.books.get(entry.bookId.toString());
      return book ? sectionState(book, kind, ctx) : 'hidden';
    }
    const states = [...ctx.books.values()]
      .map((book) => sectionState(book, kind, ctx))
      .filter((state) => state !== 'hidden');
    if (states.length === 0) return 'hidden';
    return states.includes('locked') ? 'locked' : 'open';
  }

  /** `parent` es el campo de un poder (el poder no se abre si su campo no está abierto). */
  function visibility(entry: EntryLean, ctx: Ctx, parent?: EntryLean | null): State {
    const unmet = !ruleMet(entry.unlockAfter as UnlockRule | undefined, ctx);
    if (unmet && entry.lockedDisplay === 'hide') return 'hidden';
    const section = entrySectionState(entry, ctx);
    if (section !== 'open') return section;
    if (unmet) return 'locked';
    if (entry.kind === 'power') {
      if (!parent || parent.status !== 'published') return 'hidden';
      return visibility(parent, ctx);
    }
    return 'open';
  }

  async function parentsOf(entries: EntryLean[]): Promise<Map<string, EntryLean>> {
    const ids = [...new Set(entries.filter((e) => e.parentId).map((e) => String(e.parentId)))];
    if (ids.length === 0) return new Map();
    const parents = await loadEntries({ _id: { $in: ids } });
    return new Map(parents.map((parent) => [parent._id.toString(), parent]));
  }

  async function publishedBook(bookId: string, ctx: Ctx): Promise<BookLean> {
    const book = ctx.books.get(bookId);
    if (!book) throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    return book;
  }

  /** Las pestañas del libro para esta persona. Una bloqueada no trae introducción ni mapa. */
  async function sections(bookId: string, viewer: Viewer): Promise<PublicWikiSectionsResponse> {
    const ctx = await context(viewer);
    const book = await publishedBook(bookId, ctx);
    const out: PublicWikiSection[] = [];
    for (const section of [...(book.wikiSections ?? [])]
      .filter((s) => s.enabled)
      .sort((a, b) => a.order - b.order)) {
      const open = sectionState(book, section.kind, ctx) === 'open';
      out.push(
        open
          ? {
              kind: section.kind,
              title: section.title,
              locked: false,
              ...(section.introHtml ? { introHtml: section.introHtml } : {}),
              ...(section.mapImage ? { mapImage: section.mapImage as ImageRef } : {}),
            }
          : {
              kind: section.kind,
              title: section.title,
              locked: true,
              ...(section.lockedMessage ? { lockedMessage: section.lockedMessage } : {}),
            },
      );
    }
    return { bookId, sections: out };
  }

  async function entries(
    query: {
      bookId: string;
      kind: SectionKind;
      q?: string | undefined;
      letter?: string | undefined;
    },
    viewer: Viewer,
  ): Promise<PublicWikiEntriesResponse> {
    const ctx = await context(viewer);
    const book = await publishedBook(query.bookId, ctx);
    const state = sectionState(book, query.kind, ctx);
    if (state === 'hidden') throw new AppError('NOT_FOUND', 'No encontramos esa sección');
    if (state === 'locked') throw new AppError('NOT_UNLOCKED', NOT_UNLOCKED);

    const found = await loadEntries({
      kind: query.kind,
      status: 'published',
      bookId: { $in: [query.bookId, null] },
    });
    // Buscar o filtrar por letra solo puede devolver lo que la persona ya ve: una coincidencia con el nombre de
    // una entrada bloqueada no debe poder detectarse.
    const filtering = query.q !== undefined || query.letter !== undefined;
    const needle = query.q ? normalizeName(query.q) : undefined;
    const matches = (entry: EntryLean) =>
      (needle === undefined || entry.nameNormalized.includes(needle)) &&
      (query.letter === undefined || entry.letter === query.letter);

    const powersByField = new Map<string, EntryLean[]>();
    if (query.kind === 'power_field' && found.length > 0) {
      const powers = await loadEntries({
        kind: 'power',
        status: 'published',
        parentId: { $in: found.map((field) => field._id) },
      });
      for (const power of powers) {
        const list = powersByField.get(String(power.parentId)) ?? [];
        list.push(power);
        powersByField.set(String(power.parentId), list);
      }
    }

    const out: PublicWikiItem[] = [];
    for (const entry of found) {
      const seen = visibility(entry, ctx);
      if (seen === 'hidden') continue;
      if (seen === 'locked') {
        if (!filtering) out.push(lockedLeaf(entry) as PublicWikiItem);
        continue;
      }
      if (!matches(entry)) continue;
      const leaf = toLeaf(entry);
      if (query.kind !== 'power_field') {
        out.push(leaf);
        continue;
      }
      const powers: PublicWikiLeaf[] = [];
      for (const power of powersByField.get(entry._id.toString()) ?? []) {
        const powerSeen = visibility(power, ctx, entry);
        if (powerSeen === 'open') powers.push(toLeaf(power));
        else if (powerSeen === 'locked') powers.push(lockedLeaf(power));
      }
      out.push({ ...leaf, powers });
    }
    return { entries: out };
  }

  async function entry(entryId: string, viewer: Viewer): Promise<PublicWikiEntryResponse> {
    const ctx = await context(viewer);
    const found = (await loadEntries({ _id: entryId, status: 'published' }))[0];
    if (!found) throw new AppError('NOT_FOUND', 'No encontramos esa entrada');
    const parent = found.parentId
      ? (await parentsOf([found])).get(String(found.parentId))
      : undefined;
    const seen = visibility(found, ctx, parent);
    // Oculta = igual que inexistente; bloqueada = «no desbloqueado», sin ningún dato de la entrada.
    if (seen === 'hidden') throw new AppError('NOT_FOUND', 'No encontramos esa entrada');
    if (seen === 'locked') throw new AppError('NOT_UNLOCKED', NOT_UNLOCKED);

    const linked = found.links.length
      ? await loadEntries({ _id: { $in: found.links }, status: 'published' })
      : [];
    const byId = new Map(linked.map((item) => [item._id.toString(), item]));
    const parents = await parentsOf(linked);
    const related: PublicWikiLeaf[] = [];
    for (const id of found.links.map(String)) {
      const item = byId.get(id);
      if (!item) continue;
      const itemSeen = visibility(item, ctx, parents.get(String(item.parentId)));
      if (itemSeen === 'open') related.push(toLeaf(item));
      else if (itemSeen === 'locked') related.push(lockedLeaf(item));
    }

    return {
      entry: {
        id: found._id.toString(),
        kind: found.kind,
        slug: found.slug,
        name: found.name,
        ...(found.summary ? { summary: found.summary } : {}),
        ...(found.bodyHtml ? { bodyHtml: found.bodyHtml } : {}),
        ...(found.image ? { image: found.image as ImageRef } : {}),
        ...(found.group ? { group: found.group } : {}),
        fields: (found.fields ?? []).map((field) => ({
          label: field.label ?? '',
          value: field.value ?? '',
        })),
      },
      related,
    };
  }

  return { sections, entries, entry };
}

export type PublicWikiService = ReturnType<typeof createPublicWikiService>;
