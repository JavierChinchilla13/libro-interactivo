import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert, Loading } from '../../shared/ui/layout';
import { AuthShell } from '../auth/AuthShell';
import { newsletterApi } from './api';

/** Llama una sola vez al abrir la página (también con el doble montaje de React en desarrollo). */
function useOnce(run: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    run();
  }, [run]);
}

/**
 * `/baja?t=…`: el enlace visible de cada correo de novedades. Da de baja **sola al abrirse** (un clic para la persona),
 * sin sesión. El servidor responde igual con cualquier token, así que la página siempre dice lo mismo: no revela si el
 * enlace era de una cuenta. Un `GET` al API nunca da de baja (los revisores de enlaces del correo no la disparan).
 */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const unsubscribe = useMutation({ mutationFn: newsletterApi.unsubscribe });
  const { mutate } = unsubscribe;
  useOnce(() => {
    if (token) mutate(token);
  });

  if (!token) {
    return (
      <AuthShell title="Enlace incompleto">
        <Alert tone="warning">
          <p>
            Al enlace le falta una parte. Ábrelo de nuevo desde el correo, o date de baja desde{' '}
            <Link to="/panel/cuenta" className="underline">
              tu cuenta
            </Link>
            .
          </p>
        </Alert>
      </AuthShell>
    );
  }
  if (unsubscribe.isError) {
    return (
      <AuthShell title="No pudimos darte de baja">
        <Alert>
          <p>{errorMessage(unsubscribe.error)}</p>
          <p className="mt-2">
            Vuelve a abrir el enlace en un momento, o date de baja desde{' '}
            <Link to="/panel/cuenta" className="underline">
              tu cuenta
            </Link>
            .
          </p>
        </Alert>
      </AuthShell>
    );
  }
  if (!unsubscribe.isSuccess) {
    return (
      <AuthShell title="Dándote de baja…">
        <Loading label="Un momento…" />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Te diste de baja">
      <Alert tone="success">
        <p>No recibirás más correos de novedades de la autora.</p>
      </Alert>
      <p className="mt-4 text-sm text-muted">
        ¿Fue un error? Vuelve a apuntarte desde{' '}
        <Link to="/panel/cuenta" className="underline">
          tu cuenta
        </Link>
        .
      </p>
    </AuthShell>
  );
}

/** `/confirmar-novedades?t=…`: el enlace del correo de confirmación (doble confirmación). Sin sesión. */
export function ConfirmNewsletterPage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const confirm = useMutation({ mutationFn: newsletterApi.confirm });
  const { mutate } = confirm;
  useOnce(() => {
    if (token.length >= 20) mutate(token);
  });

  if (token.length < 20 || confirm.isError) {
    return (
      <AuthShell title="Enlace no válido">
        <Alert tone="warning">
          <p>
            El enlace no es válido o ya caducó. Vuelve a apuntarte desde{' '}
            <Link to="/panel/cuenta" className="underline">
              tu cuenta
            </Link>{' '}
            y te mandaremos uno nuevo.
          </p>
        </Alert>
      </AuthShell>
    );
  }
  if (!confirm.isSuccess) {
    return (
      <AuthShell title="Confirmando…">
        <Loading label="Un momento…" />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="¡Listo! Ya te apuntaste">
      <Alert tone="success">
        <p>
          Te avisaremos por correo cuando la autora publique una actualización o un capítulo extra.
        </p>
      </Alert>
      <p className="mt-4 text-sm text-muted">
        Puedes darte de baja cuando quieras desde{' '}
        <Link to="/panel/cuenta" className="underline">
          tu cuenta
        </Link>{' '}
        o con el enlace que va en cada correo.
      </p>
    </AuthShell>
  );
}
