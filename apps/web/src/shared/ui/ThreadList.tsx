import type { ReactNode } from 'react';

/**
 * Lista de pasos unidos por el hilo: cada elemento lleva su punto (encendido, apagado o neutro) y el trazo que lo
 * une con el siguiente. El estado nunca va solo en el punto: quien lo use lo acompaña de texto («Disponible»,
 * «Bloqueado», «Antes, completa…»).
 */
export type ThreadState = 'lit' | 'unlit' | 'neutral';

const NODE: Record<ThreadState, string> = {
  lit: 'border-lit bg-lit shadow-lit',
  unlit: 'border-unlit bg-surface',
  neutral: 'border-muted/60 bg-muted/60',
};

export function ThreadList({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ol aria-label={label} className="reveal-children m-0 list-none p-0">
      {children}
    </ol>
  );
}

export function ThreadItem({ state, children }: { state: ThreadState; children: ReactNode }) {
  return (
    <li data-state={state} className="group/item grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4">
      <div aria-hidden="true" className="relative flex justify-center">
        <span
          className={`absolute bottom-0 top-0 w-px group-first/item:top-[0.7rem] group-last/item:bottom-auto group-last/item:h-[0.7rem] ${
            state === 'lit' ? 'bg-linear-to-b from-lit to-unlit/40' : 'bg-unlit/40'
          }`}
        />
        <span
          className={`relative mt-[0.2rem] size-3.5 shrink-0 rounded-full border-2 transition-[transform,border-color] duration-(--token-dur-fast) ease-token-out group-hover/item:scale-125 ${
            state === 'unlit' ? 'group-hover/item:border-primary' : ''
          } ${NODE[state]}`}
        />
      </div>
      <div className="pb-9 group-last/item:pb-0">{children}</div>
    </li>
  );
}
