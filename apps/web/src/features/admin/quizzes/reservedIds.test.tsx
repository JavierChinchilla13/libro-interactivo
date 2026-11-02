import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider } from '../components/ConfirmDialog';
import {
  addQuestion,
  addResult,
  addStage,
  allQuestionIds,
  duplicateQuestion,
  emptyDraft,
  removeQuestion,
  type Draft,
} from './draft';
import { StagesTab } from './StagesTab';

function startDraft(): Draft {
  let draft = addStage(emptyDraft('Quiz'));
  draft = addResult(draft, 'etapa-1');
  draft = addResult(draft, 'etapa-1');
  draft = addQuestion(draft, 'etapa-1');
  return addQuestion(draft, 'etapa-1');
}

describe('numeración de preguntas con ids reservados', () => {
  it('addQuestion y duplicateQuestion saltan los ids reservados', () => {
    const draft = startDraft();
    expect(allQuestionIds(draft)).toEqual(['p1', 'p2']);
    const added = addQuestion(draft, 'etapa-1', ['p3', 'p4']);
    expect(allQuestionIds(added)).toEqual(['p1', 'p2', 'p5']);
    const copied = duplicateQuestion(draft, 'etapa-1', 'p1', ['p3']);
    expect(allQuestionIds(copied)).toEqual(['p1', 'p4', 'p2']);
    // Sin reservados, el comportamiento de siempre.
    expect(allQuestionIds(addQuestion(draft, 'etapa-1'))).toEqual(['p1', 'p2', 'p3']);
  });

  it('borrar una pregunta con ajuste huérfano y agregar otra no reutiliza su id', () => {
    // «p3» tenía un ajuste de apariencia y se borró: el servidor la sigue reservando.
    let draft = addQuestion(startDraft(), 'etapa-1'); // p3
    draft = removeQuestion(draft, 'etapa-1', 'p3');
    expect(allQuestionIds(addQuestion(draft, 'etapa-1', ['p3']))).toEqual(['p1', 'p2', 'p4']);
  });
});

describe('«+ Agregar pregunta» en la pestaña Etapas', () => {
  let current: Draft = startDraft();
  let push: (next: Draft) => void = () => undefined;

  function Harness({ reserved }: { reserved: string[] }) {
    const [draft, setDraft] = useState(current);
    current = draft;
    push = (next) => setDraft(next);
    return (
      <ConfirmProvider>
        <StagesTab draft={draft} onChange={setDraft} reservedQuestionIds={reserved} />
      </ConfirmProvider>
    );
  }

  it('la pregunta nueva no estrena un id reservado ni uno que esta pantalla ya usó', async () => {
    current = startDraft();
    render(<Harness reserved={['p3']} />);
    const add = screen.getByRole('button', { name: '+ Agregar pregunta' });

    await userEvent.click(add);
    expect(allQuestionIds(current)).toEqual(['p1', 'p2', 'p4']);

    // Se quita la recién creada (sin guardar) y se agrega otra: tampoco reutiliza «p4».
    act(() => push(removeQuestion(current, 'etapa-1', 'p4')));
    expect(allQuestionIds(current)).toEqual(['p1', 'p2']);
    await userEvent.click(screen.getByRole('button', { name: '+ Agregar pregunta' }));
    expect(allQuestionIds(current)).toEqual(['p1', 'p2', 'p5']);
  });
});
