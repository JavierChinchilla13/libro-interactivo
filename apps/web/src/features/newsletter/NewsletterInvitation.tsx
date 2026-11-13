import { NEWSLETTER_INVITATION_QUESTION, type NewsletterState } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert } from '../../shared/ui/layout';
import { NEWSLETTER_KEY, newsletterApi } from './api';
import { NewsletterBirthForm } from './NewsletterBirthForm';

/** Lo que se le dice al lector después de contestar; se queda en pantalla hasta que se vaya del panel. */
type Outcome = 'pending' | 'subscribed' | 'declined';

const link = 'underline underline-offset-2 hover:text-primary';

/**
 * Invitación única a los correos de novedades en el panel del lector. El servidor decide si se muestra
 * (`invitation`: puede apuntarse —mayor de 18 con fecha guardada, o una cuenta sin fecha—, sin alta ni baja y sin
 * respuesta previa); aquí solo se pinta.
 *
 * - Dos botones con el mismo peso (los dos secundarios) y ninguna casilla marcada de antemano.
 * - «Sí» usa el mismo camino de alta que la cuenta (con doble confirmación si el correo no está comprobado). Si la cuenta
 *   no tiene fecha de nacimiento, «Sí» abre un paso que pide el mes y el año (`NewsletterBirthForm`) antes de apuntarla.
 * - «No, gracias» guarda la respuesta y no vuelve a salir.
 * - Al contestar, la tarjeta cambia a un mensaje y el foco pasa a él (el botón pulsado desaparece); no hay animación
 *   propia más allá de la entrada de página, que `prefers-reduced-motion` ya apaga.
 */
export function NewsletterInvitation() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: NEWSLETTER_KEY, queryFn: newsletterApi.state, staleTime: 0 });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Cuenta sin fecha de nacimiento: «Sí» abre un paso que pide el mes y el año antes de apuntarla.
  const [asking, setAsking] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const answer = useMutation({
    mutationFn: (input: { accepted: boolean; birth?: { year: number; month: number } }) =>
      input.accepted ? newsletterApi.update(true, input.birth) : newsletterApi.declineInvitation(),
    onSuccess: (next: NewsletterState) => {
      client.setQueryData(NEWSLETTER_KEY, next);
      setAsking(false);
      setOutcome(
        next.status === 'subscribed'
          ? 'subscribed'
          : next.status === 'pending'
            ? 'pending'
            : 'declined',
      );
    },
  });

  // El botón pulsado se va con el cambio de mensaje: el foco pasa al mensaje para no perderse (y se anuncia).
  useEffect(() => {
    if (outcome) resultRef.current?.focus();
  }, [outcome]);

  if (!outcome && !state.data?.invitation) return null;

  // Mientras se guarda no se quita `disabled` ni se pierde el foco: se ignoran los clics repetidos.
  const busy = answer.isPending;
  const onAnswer = (accepted: boolean) => {
    if (busy) return;
    if (accepted && state.data?.needsBirth) setAsking(true);
    else answer.mutate({ accepted });
  };
  const buttonClass = `btn btn-secondary flex-1 sm:flex-none ${busy ? 'opacity-60' : ''}`;

  return (
    <section
      aria-labelledby="invitacion-novedades"
      className="fade-up surface flex flex-col gap-4 rounded-token-lg p-4 sm:p-5"
    >
      {outcome ? (
        <div
          ref={resultRef}
          role="status"
          tabIndex={-1}
          className="flex flex-col gap-1 outline-none"
        >
          <h2 id="invitacion-novedades" className="font-semibold">
            {outcome === 'declined' ? 'Entendido' : 'Listo'}
          </h2>
          <p className="text-sm text-muted">
            {outcome === 'subscribed'
              ? 'Te apuntaste a los correos de novedades. Puedes darte de baja cuando quieras desde '
              : outcome === 'pending'
                ? 'Te enviamos un enlace a tu correo: ábrelo para empezar a recibir las novedades (caduca en 7 días). Si no llega, revisa la carpeta de correo no deseado. Puedes cambiarlo en '
                : 'No te escribiremos. Si cambias de idea, puedes apuntarte en '}
            <Link to="/panel/cuenta" className={link}>
              Panel › Cuenta
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 id="invitacion-novedades" className="section-title text-xl">
              {NEWSLETTER_INVITATION_QUESTION}
            </h2>
            <p className="text-sm text-muted">
              Te escribimos solo cuando la autora publica una actualización o un capítulo extra, sin
              seguimiento de aperturas ni de clics. Puedes cambiarlo cuando quieras en{' '}
              <Link to="/panel/cuenta" className={link}>
                Panel › Cuenta
              </Link>
              .
            </p>
          </div>
          {asking ? (
            <NewsletterBirthForm
              pending={busy}
              serverError={answer.isError ? errorMessage(answer.error) : undefined}
              onCancel={() => {
                setAsking(false);
                answer.reset();
              }}
              onSubmit={(birth) => answer.mutate({ accepted: true, birth })}
            />
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  aria-disabled={busy}
                  onClick={() => onAnswer(true)}
                >
                  Sí, apuntarme
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  aria-disabled={busy}
                  onClick={() => onAnswer(false)}
                >
                  No, gracias
                </button>
              </div>
              {answer.isError ? <Alert>{errorMessage(answer.error)}</Alert> : null}
            </>
          )}
        </>
      )}
    </section>
  );
}
