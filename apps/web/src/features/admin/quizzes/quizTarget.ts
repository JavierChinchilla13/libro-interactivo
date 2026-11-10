import type { QuizIssueWhere } from '@libro/shared';

/** Un «ir a» pedido desde la revisión: `nonce` distingue dos clics seguidos al mismo lugar. */
export interface QuizTarget {
  where: QuizIssueWhere;
  nonce: number;
}

/** Ids de los elementos del editor a los que lleva un problema de la revisión. */
export const anchorId = {
  stage: (stageId: string) => `quiz-s-${stageId}`,
  question: (questionId: string) => `quiz-q-${questionId}`,
  answer: (questionId: string, answerId: string) => `quiz-a-${questionId}-${answerId}`,
  stageResults: (stageId: string) => `quiz-results-${stageId}`,
  result: (resultKey: string) => `quiz-r-${resultKey}`,
};

export function targetId(where: QuizIssueWhere): string {
  if (where.tab === 'general') return 'panel-general';
  if (where.tab === 'resultados') {
    if (where.resultKey) return anchorId.result(where.resultKey);
    return where.stageId ? anchorId.stageResults(where.stageId) : 'panel-resultados';
  }
  if (where.questionId && where.answerId) return anchorId.answer(where.questionId, where.answerId);
  if (where.questionId) return anchorId.question(where.questionId);
  return where.stageId ? anchorId.stage(where.stageId) : 'panel-etapas';
}

/** Qué control enfocar dentro del elemento según el campo con el problema. */
const FIELD_SELECTOR: Record<string, string> = {
  resultKey: 'select',
  fieldSlug: 'select',
  text: 'textarea, input',
  title: 'input',
};
const FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

/**
 * Lleva la vista al elemento y pone el foco en el campo. Espera unos cuadros a que la pestaña, la etapa y la pregunta
 * se abran (el elemento aparece después de esos cambios). Sin desplazamiento suave con «reducir movimiento».
 */
export function revealTarget(where: QuizIssueWhere, onDone?: () => void, frames = 30) {
  const step = (left: number) => {
    const element = document.getElementById(targetId(where));
    if (!element) {
      if (left > 0) requestAnimationFrame(() => step(left - 1));
      else onDone?.();
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (typeof element.scrollIntoView === 'function')
      element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    const selector = where.field ? FIELD_SELECTOR[where.field] : undefined;
    // Primero el campo con el problema; si no, el primer campo del formulario (nunca «Eliminar» por ser el primer botón).
    const control =
      (selector ? element.querySelector<HTMLElement>(selector) : null) ??
      element.querySelector<HTMLElement>('input, select, textarea') ??
      element.querySelector<HTMLElement>(FOCUSABLE) ??
      element;
    control.focus({ preventScroll: true });
    onDone?.();
  };
  requestAnimationFrame(() => step(frames));
}
