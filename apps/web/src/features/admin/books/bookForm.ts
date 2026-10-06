import type {
  BookInputPayload,
  BookResponse,
  BookStatus,
  ImageRefInput,
  PurchaseLink,
  WikiSectionInput,
} from '@libro/shared';

/** Estado del formulario de libro (todo texto, como lo escribe la persona) y su conversión al contrato del API. */
export interface BookForm {
  title: string;
  slug: string;
  /** Mientras no se edite a mano, el slug se genera del título. */
  slugTouched: boolean;
  tagline: string;
  synopsis: string;
  /** Géneros separados por coma. */
  genres: string;
  contentWarning: string;
  minAge: string;
  isbn: string;
  status: BookStatus;
  releaseDate: string;
  cover: ImageRefInput | undefined;
  order: string;
  purchaseLinks: PurchaseLink[];
  wikiSections: WikiSectionInput[];
  primaryColor: string;
  background: 'none' | 'color' | 'image';
  backgroundColor: string;
  backgroundImage: ImageRefInput | undefined;
}

/** Pestañas que trae un libro nuevo (la autora las ajusta después; sin reglas de bloqueo). */
export const DEFAULT_WIKI_SECTIONS: WikiSectionInput[] = [
  { kind: 'character', title: 'Personajes', order: 1, enabled: true },
  { kind: 'power_field', title: 'Poderes', order: 2, enabled: true },
  { kind: 'place', title: 'Lugares del mundo', order: 3, enabled: true },
  { kind: 'term', title: 'Glosario', order: 4, enabled: true },
];

export const SECTION_LABELS: Record<WikiSectionInput['kind'], string> = {
  character: 'Personajes',
  power_field: 'Poderes',
  place: 'Lugares',
  term: 'Glosario',
};

export function emptyBookForm(nextOrder = 1): BookForm {
  return {
    title: '',
    slug: '',
    slugTouched: false,
    tagline: '',
    synopsis: '',
    genres: '',
    contentWarning: '',
    minAge: '',
    isbn: '',
    status: 'draft',
    releaseDate: '',
    cover: undefined,
    order: String(nextOrder),
    purchaseLinks: [],
    wikiSections: DEFAULT_WIKI_SECTIONS.map((section) => ({ ...section })),
    primaryColor: '',
    background: 'none',
    backgroundColor: '#f4f4f4',
    backgroundImage: undefined,
  };
}

export function formFromBook(book: BookResponse): BookForm {
  const background = book.theme?.background;
  // Un libro viejo sin alguna pestaña la recupera con sus valores por defecto (apagada de reglas).
  const present = new Set(book.wikiSections.map((section) => section.kind));
  const missing = DEFAULT_WIKI_SECTIONS.filter((section) => !present.has(section.kind));
  return {
    title: book.title,
    slug: book.slug,
    slugTouched: true,
    tagline: book.tagline ?? '',
    synopsis: book.synopsis,
    genres: book.genres.join(', '),
    contentWarning: book.contentWarning ?? '',
    minAge: book.minAge === undefined ? '' : String(book.minAge),
    isbn: book.isbn ?? '',
    status: book.status,
    releaseDate: book.releaseDate ?? '',
    cover: book.cover,
    order: String(book.order),
    purchaseLinks: book.purchaseLinks,
    wikiSections: [
      ...book.wikiSections,
      ...missing.map((section) => ({ ...section, enabled: false })),
    ].sort((a, b) => a.order - b.order),
    primaryColor: book.theme?.primaryColor ?? '',
    background: background ? background.type : 'none',
    backgroundColor: background?.type === 'color' ? background.color : '#f4f4f4',
    backgroundImage: background?.type === 'image' ? background.image : undefined,
  };
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Convierte el formulario al contrato del API (lo vacío se omite; el API lo valida de nuevo). */
export function payloadFromForm(form: BookForm): BookInputPayload {
  const tagline = blankToUndefined(form.tagline);
  const contentWarning = blankToUndefined(form.contentWarning);
  const isbn = blankToUndefined(form.isbn);
  const releaseDate = blankToUndefined(form.releaseDate);
  const primaryColor = blankToUndefined(form.primaryColor);
  const minAge = blankToUndefined(form.minAge);
  const background =
    form.background === 'color'
      ? ({ type: 'color', color: form.backgroundColor } as const)
      : form.background === 'image' && form.backgroundImage
        ? ({ type: 'image', image: form.backgroundImage } as const)
        : undefined;
  const hasTheme = primaryColor !== undefined || background !== undefined;

  return {
    slug: form.slug.trim(),
    title: form.title.trim(),
    ...(tagline ? { tagline } : {}),
    synopsis: form.synopsis,
    genres: form.genres
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean),
    ...(contentWarning ? { contentWarning } : {}),
    ...(minAge !== undefined ? { minAge: Number(minAge) } : {}),
    ...(isbn ? { isbn } : {}),
    ...(form.cover ? { cover: form.cover } : {}),
    order: Number(form.order),
    status: form.status,
    ...(releaseDate ? { releaseDate } : {}),
    purchaseLinks: form.purchaseLinks,
    wikiSections: form.wikiSections,
    // El tema exige fondo: si solo hay color principal, el fondo por defecto es el color neutro.
    ...(hasTheme
      ? {
          theme: {
            ...(primaryColor ? { primaryColor } : {}),
            background: background ?? { type: 'color' as const, color: '#f4f4f4' },
          },
        }
      : {}),
  };
}
