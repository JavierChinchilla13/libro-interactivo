import { NEWSLETTER_LABEL, NEWSLETTER_MIN_AGE } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../shared/api/messages';
import { CheckField } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { NEWSLETTER_KEY, newsletterApi } from './api';

const when = (iso: string) => new Date(iso).toLocaleDateString('es-CR', { dateStyle: 'long' });

/**
 * «Correos de novedades» en la cuenta: la casilla para apuntarse o darse de baja. Quien no tiene el correo comprobado
 * queda «pendiente» hasta abrir el enlace que le llega. A quien no puede apuntarse (menor de 18 o sin fecha de
 * nacimiento guardada) no se le ofrece la casilla; el servidor, además, lo rechaza.
 */
export function NewsletterSection() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: NEWSLETTER_KEY, queryFn: newsletterApi.state, staleTime: 0 });
  const update = useMutation({
    mutationFn: newsletterApi.update,
    onSuccess: (next) => client.setQueryData(NEWSLETTER_KEY, next),
  });

  let body;
  if (state.isError) {
    body = <Alert>{errorMessage(state.error)}</Alert>;
  } else if (!state.data) {
    body = <p className="text-sm text-muted">Cargando…</p>;
  } else if (!state.data.eligible && state.data.status === 'none') {
    body = (
      <p className="text-sm text-muted">
        Los correos de novedades son solo para personas de {NEWSLETTER_MIN_AGE} años o más.
      </p>
    );
  } else {
    const { status } = state.data;
    body = (
      <div className="flex flex-col gap-3">
        <CheckField
          label={NEWSLETTER_LABEL}
          hint="Te escribimos cuando la autora publica una actualización o un capítulo extra. Sin seguimiento de aperturas ni de clics."
          // Mientras se guarda, refleja el clic al instante; si el servidor lo rechaza, vuelve a lo guardado.
          checked={update.isPending ? update.variables : status !== 'none'}
          disabled={update.isPending}
          onChange={(subscribed) => update.mutate(subscribed)}
        />
        {status === 'pending' ? (
          <Alert tone="warning" title="Falta confirmar tu correo">
            <p className="mt-1">
              Te enviamos un enlace a tu correo. Ábrelo para empezar a recibir las novedades (caduca
              en 7 días). Si no llega, revisa la carpeta de correo no deseado.
            </p>
          </Alert>
        ) : null}
        {status === 'subscribed' && state.data.subscribedAt ? (
          <p className="text-sm text-muted">
            Te apuntaste el {when(state.data.subscribedAt)}. Puedes darte de baja aquí o con el
            enlace que va en cada correo.
          </p>
        ) : null}
        {update.isError ? <Alert>{errorMessage(update.error)}</Alert> : null}
      </div>
    );
  }

  return (
    <section className="border-t border-line pt-6" aria-labelledby="account-newsletter">
      <h2 id="account-newsletter" className="font-semibold">
        Correos de novedades
      </h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}
