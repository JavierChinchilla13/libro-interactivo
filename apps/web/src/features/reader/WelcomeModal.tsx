import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { readerApi, readerKeys } from './api';
import { WelcomeContent } from './WelcomeContent';

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
        className="welcome-dialog rounded-token-xl border border-line bg-surface shadow-elev-2"
      >
        <WelcomeContent
          title={welcome.data.title}
          bodyHtml={welcome.data.bodyHtml}
          titleId="welcome-title"
          onDone={() => seen.mutate()}
        />
      </div>
    </div>
  );
}
