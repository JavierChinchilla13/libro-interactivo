import { redeemAccessResponseSchema, resolveAccessResponseSchema } from '@libro/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError, apiRequest } from '../../shared/api/client';
import { Alert, Loading } from '../../shared/ui/layout';
import { AuthShell, QR_TAGLINE } from '../auth/AuthShell';
import { useSession } from '../auth/session';

/** Clave donde se recuerda el código mientras la persona inicia sesión o se registra (se borra al canjear). */
export const PENDING_TOKEN_KEY = 'libro_pending_token';

function remember(token: string) {
  try {
    sessionStorage.setItem(PENDING_TOKEN_KEY, token);
  } catch {
    /* sin almacenamiento (modo privado): el enlace del QR sigue sirviendo */
  }
}

function forget() {
  try {
    sessionStorage.removeItem(PENDING_TOKEN_KEY);
  } catch {
    /* nada que borrar */
  }
}

const INVALID = 'Este código no es válido.';

/**
 * Entrada por QR (`/u/:token`). Consulta lo mínimo (libro y nombre) sin sesión; si ya hay
 * sesión, canjea el código (idempotente); si no, manda a ingresar y vuelve aquí. El servidor decide todo: cualquier
 * código que no sirva se muestra con el mismo mensaje genérico.
 */
export function RedeemPage() {
  const { token = '' } = useParams();
  const session = useSession();
  const requested = useRef(false);

  const resolved = useQuery({
    queryKey: ['access', 'resolve', token],
    queryFn: () =>
      apiRequest(`/access/resolve/${encodeURIComponent(token)}`, resolveAccessResponseSchema),
    retry: false,
  });
  const redeem = useMutation({
    mutationFn: () =>
      apiRequest('/access/redeem', redeemAccessResponseSchema, { method: 'POST', body: { token } }),
    onSuccess: forget,
  });

  const loggedIn = Boolean(session.data);
  const canRedeem = resolved.isSuccess && loggedIn;
  useEffect(() => {
    if (resolved.isSuccess && session.isSuccess && !session.data) remember(token);
  }, [resolved.isSuccess, session.isSuccess, session.data, token]);
  useEffect(() => {
    if (canRedeem && !requested.current) {
      requested.current = true;
      redeem.mutate();
    }
  }, [canRedeem, redeem]);

  if (resolved.isPending || session.isPending) return <Loading label="Comprobando tu código…" />;

  if (resolved.isError) {
    const network = resolved.error instanceof ApiClientError && resolved.error.code === 'NETWORK';
    return (
      <AuthShell title="Código no válido" lit={0}>
        <Alert>
          {network
            ? 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
            : `${INVALID} Revisa que sea el código impreso en tu libro.`}
        </Alert>
      </AuthShell>
    );
  }

  const info = resolved.data;
  return (
    <AuthShell title="Desbloquear contenido" lit={redeem.isSuccess ? 1 : 0} tagline={QR_TAGLINE}>
      <div className="flex flex-col gap-4">
        <p>
          <span className="text-muted">{info.bookTitle}</span>
          <br />
          <strong>{info.title}</strong>
        </p>

        {!loggedIn ? (
          <>
            <p className="text-sm text-muted">
              Para guardar este desbloqueo en tu cuenta, ingresa primero. Cuando termines volverás
              aquí y se desbloqueará solo.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/ingresar" state={{ from: `/u/${token}` }} className="btn btn-primary">
                Ingresar
              </Link>
              <Link to="/registro" state={{ from: `/u/${token}` }} className="btn btn-secondary">
                Crear cuenta
              </Link>
            </div>
          </>
        ) : null}

        {loggedIn && redeem.isPending ? <Loading label="Desbloqueando…" /> : null}
        {redeem.isError ? (
          <Alert>
            {redeem.error instanceof ApiClientError && redeem.error.code === 'TOKEN_INVALID'
              ? INVALID
              : 'No pudimos desbloquearlo ahora. Inténtalo de nuevo en un momento.'}
          </Alert>
        ) : null}
        {redeem.isSuccess ? (
          // Lo desbloqueado se señala con la luz cian (no con el verde de un formulario) y lleva directo a empezar.
          <div
            role="status"
            className="flex flex-col gap-3 rounded-token-lg border border-primary/50 bg-primary/10 p-4 text-sm"
          >
            <p className="text-base font-semibold">
              {redeem.data.alreadyUnlocked ? 'Ya lo tenías desbloqueado' : '¡Desbloqueado!'}
            </p>
            <p>«{redeem.data.title}» está disponible en tu cuenta.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {redeem.data.kind === 'quiz' ? (
                <Link to={`/panel/quiz/${redeem.data.refId}`} className="btn btn-primary btn-lg">
                  Empezar «{redeem.data.title}»
                </Link>
              ) : null}
              <Link
                to="/panel"
                className={`btn btn-lg ${redeem.data.kind === 'quiz' ? 'btn-secondary' : 'btn-primary'}`}
              >
                Ir a mi panel
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </AuthShell>
  );
}
