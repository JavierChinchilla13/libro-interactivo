/** «3 de 4 experiencias abiertas», o «Aún sin experiencias» si el libro no tiene quizzes (nunca «0 de 0»). */
export function experiencesText(done: number, total: number): string {
  return total > 0 ? `${done} de ${total} experiencias abiertas` : 'Aún sin experiencias';
}
