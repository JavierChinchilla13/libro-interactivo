import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Button } from '../../shared/ui/controls';
import { readerApi, readerKeys } from './api';

/**
 * Mensaje de bienvenida (el «pacto» con el lector). El servidor decide si toca mostrarlo
 * (en cada ingreso o solo la primera vez) y la autora lo escribe en el panel. Se cierra con el botón o con Escape.
 */
export function WelcomeModal() {
  const client = useQueryClient();
  const welcome = useQuery({
    queryKey: readerKeys.welcome,
    queryFn: readerApi.welcome,
    staleTime: Infinity,
    retry: false,
  });
  const seen = useMutation({
    mutationFn: readerApi.welcomeSeen,
    onSettled: () => client.setQueryData(readerKeys.welcome, { show: false }),
  });
  const visible = welcome.data?.show === true;

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') seen.mutate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, seen]);

  if (welcome.data?.show !== true) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-token-lg border border-border bg-surface p-6 shadow-xl"
      >
        <h2 id="welcome-title" className="mb-3 font-display text-2xl font-bold">
          {welcome.data.title ?? 'Bienvenida'}
        </h2>
        <SafeHtml html={welcome.data.bodyHtml} />
        <Button autoFocus className="mt-5 w-full" onClick={() => seen.mutate()}>
          ¡A la aventura!
        </Button>
      </div>
    </div>
  );
}
