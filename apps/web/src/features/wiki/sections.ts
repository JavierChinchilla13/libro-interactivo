import type { WikiKind } from '@libro/shared';

/** Pestañas de la wiki: la dirección en español ↔ el tipo de sección del libro. */
export type SectionKind = 'character' | 'power_field' | 'place' | 'term';

export const SECTION_SLUGS: Record<SectionKind, string> = {
  character: 'personajes',
  power_field: 'poderes',
  place: 'lugares',
  term: 'glosario',
};

export function sectionFromSlug(slug: string | undefined): SectionKind | undefined {
  return (Object.keys(SECTION_SLUGS) as SectionKind[]).find((kind) => SECTION_SLUGS[kind] === slug);
}

/** Un poder vive dentro de la pestaña de los campos de poder. */
export function sectionOfEntry(kind: WikiKind): SectionKind {
  return kind === 'power' ? 'power_field' : kind;
}

/** Texto cuando una pestaña no trae mensaje propio de la autora. */
export const DEFAULT_LOCK_TEXT = 'Se habilita al avanzar en tu lectura.';
