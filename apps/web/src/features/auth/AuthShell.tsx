import type { ReactNode } from 'react';
import { Card } from '../../shared/ui/layout';

/** Marco de las pantallas de cuenta: tarjeta centrada con título. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-4 font-display text-2xl font-bold">{title}</h1>
        {children}
      </Card>
    </div>
  );
}
