import { plural, pluralWord } from '@libro/shared';

/** «3 de 4 experiencias abiertas», «0 de 1 experiencia abierta» o «Aún sin experiencias» si el libro no tiene quizzes (nunca «0 de 0»). */
export function experiencesText(done: number, total: number): string {
  return total > 0 ? experiencesCount(done, total) : 'Aún sin experiencias';
}

/** «3 de 4 experiencias abiertas» / «0 de 1 experiencia abierta» (concuerda con el total). */
export function experiencesCount(done: number, total: number): string {
  return `${done} de ${plural(total, 'experiencia', 'experiencias')} ${pluralWord(total, 'abierta', 'abiertas')}`;
}
