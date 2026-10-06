import {
  EXTRA_FILE_RULES,
  type ExtraFile,
  type ExtraInputPayload,
  type ExtraKind,
  type ExtraResponse,
} from '@libro/shared';

export const KIND_LABEL: Record<ExtraKind, string> = {
  pdf: 'PDF',
  text: 'Texto en pantalla',
  image: 'Imagen',
};

/** Estado del formulario de un extra y su conversión al contrato del API. */
export interface ExtraForm {
  bookId: string;
  kind: ExtraKind;
  title: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  bodyHtml: string;
  file: ExtraFile | undefined;
  order: string;
  status: 'draft' | 'published' | 'archived';
}

export function emptyExtraForm(bookId = '', order = 1): ExtraForm {
  return {
    bookId,
    kind: 'text',
    title: '',
    slug: '',
    slugTouched: false,
    description: '',
    bodyHtml: '',
    file: undefined,
    order: String(order),
    status: 'draft',
  };
}

export function formFromExtra(extra: ExtraResponse): ExtraForm {
  return {
    bookId: extra.bookId,
    kind: extra.kind,
    title: extra.title,
    slug: extra.slug,
    slugTouched: true,
    description: extra.description ?? '',
    bodyHtml: extra.bodyHtml ?? '',
    file: extra.file,
    order: String(extra.order),
    status: extra.status,
  };
}

/** Solo manda lo que corresponde al tipo: el texto para «texto» y el archivo para «pdf»/«imagen». */
export function payloadFromForm(form: ExtraForm): ExtraInputPayload {
  const description = form.description.trim();
  return {
    bookId: form.bookId,
    slug: form.slug.trim(),
    title: form.title.trim(),
    kind: form.kind,
    order: Number(form.order),
    status: form.status,
    ...(description ? { description } : {}),
    ...(form.kind === 'text' ? { bodyHtml: form.bodyHtml } : {}),
    ...(form.kind !== 'text' && form.file ? { file: form.file } : {}),
  };
}

/** Validación previa en el navegador (el servidor vuelve a validar al pedir el permiso y al guardar). */
export function checkFile(
  kind: 'pdf' | 'image',
  file: { type: string; size: number },
): string | null {
  const rules = EXTRA_FILE_RULES[kind];
  if (!(rules.mimes as readonly string[]).includes(file.type)) {
    return kind === 'pdf' ? 'Elige un archivo PDF.' : 'Elige una imagen PNG, JPG o WebP.';
  }
  if (file.size > rules.maxBytes) {
    return `El archivo pesa demasiado (máximo ${Math.round(rules.maxBytes / 1024 / 1024)} MB).`;
  }
  return null;
}
