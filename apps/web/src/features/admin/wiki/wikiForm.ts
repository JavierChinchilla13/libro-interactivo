import type {
  ImageRefInput,
  UnlockRule,
  WikiEntryInputPayload,
  WikiEntryResponse,
  WikiKind,
} from '@libro/shared';

export const KIND_LABEL: Record<WikiKind, string> = {
  character: 'Personaje',
  power_field: 'Campo de poder',
  power: 'Poder',
  place: 'Lugar del mundo',
  term: 'Término del glosario',
};

/** Pestañas de la lista: los poderes se agrupan bajo sus campos, en una sola pestaña. */
export const LIST_TABS = [
  { id: 'character', label: 'Personajes', kinds: ['character'] },
  { id: 'powers', label: 'Campos y poderes', kinds: ['power_field', 'power'] },
  { id: 'place', label: 'Lugares', kinds: ['place'] },
  { id: 'term', label: 'Glosario', kinds: ['term'] },
] as const satisfies readonly { id: string; label: string; kinds: readonly WikiKind[] }[];

export interface WikiForm {
  kind: WikiKind;
  name: string;
  slug: string;
  slugTouched: boolean;
  bookId: string;
  status: 'draft' | 'published' | 'archived';
  order: string;
  summary: string;
  bodyHtml: string;
  image: ImageRefInput | undefined;
  group: string;
  fields: { label: string; value: string }[];
  parentId: string;
  links: string[];
  unlockQuizId: string;
  lockedDisplay: 'show' | 'hide';
}

export function emptyWikiForm(kind: WikiKind, bookId = ''): WikiForm {
  return {
    kind,
    name: '',
    slug: '',
    slugTouched: false,
    bookId,
    status: 'draft',
    order: '1',
    summary: '',
    bodyHtml: '',
    image: undefined,
    group: '',
    fields: [],
    parentId: '',
    links: [],
    unlockQuizId: '',
    lockedDisplay: 'show',
  };
}

export function formFromEntry(entry: WikiEntryResponse): WikiForm {
  return {
    kind: entry.kind,
    name: entry.name,
    slug: entry.slug,
    slugTouched: true,
    bookId: entry.bookId ?? '',
    status: entry.status,
    order: String(entry.order),
    summary: entry.summary ?? '',
    bodyHtml: entry.bodyHtml ?? '',
    image: entry.image,
    group: entry.group ?? '',
    fields: entry.fields,
    parentId: entry.parentId ?? '',
    links: entry.links,
    unlockQuizId: entry.unlockAfter?.refId ?? '',
    lockedDisplay: entry.lockedDisplay,
  };
}

/** Convierte el formulario al contrato del API; solo manda lo que corresponde al tipo de entrada. */
export function payloadFromForm(form: WikiForm): WikiEntryInputPayload {
  const unlockAfter: UnlockRule | undefined = form.unlockQuizId
    ? { kind: 'quiz', refId: form.unlockQuizId }
    : undefined;
  const summary = form.summary.trim();
  const group = form.group.trim();
  return {
    kind: form.kind,
    slug: form.slug.trim(),
    name: form.name.trim(),
    status: form.status,
    order: Number(form.order),
    ...(form.bookId ? { bookId: form.bookId } : {}),
    ...(summary ? { summary } : {}),
    ...(form.bodyHtml ? { bodyHtml: form.bodyHtml } : {}),
    ...(form.image ? { image: form.image } : {}),
    ...(form.kind === 'place' && group ? { group } : {}),
    ...(form.kind === 'character'
      ? { fields: form.fields.filter((field) => field.label.trim() && field.value.trim()) }
      : {}),
    ...(form.kind === 'power' && form.parentId ? { parentId: form.parentId } : {}),
    ...(form.kind === 'place' ? { links: form.links } : {}),
    ...(unlockAfter ? { unlockAfter } : {}),
    lockedDisplay: form.lockedDisplay,
  };
}
