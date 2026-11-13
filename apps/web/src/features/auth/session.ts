import {
  authResponseSchema,
  googleLoginResponseSchema,
  loginResponseSchema,
  type AuthUser,
  type Consent,
  type LoginRequest,
  type RegisterRequest,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiClientError, apiRequest } from '../../shared/api/client';
import { hasSessionHint } from '../../shared/api/sessionHint';

export const SESSION_KEY = ['session'] as const;

/** `null` = sin sesión. Cualquier otro error (red, servidor) se propaga para que la pantalla lo muestre. */
async function fetchSession(): Promise<AuthUser | null> {
  // Visita anónima (sin la cookie-pista): no hay a quién preguntar y no se deja un 401 en la consola.
  if (!hasSessionHint()) return null;
  try {
    return (await apiRequest('/me', authResponseSchema)).user;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

/** Estado de sesión (`GET /me`). El navegador nunca ve los tokens: viajan en cookies httpOnly. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginRequest) =>
      apiRequest('/auth/login', loginResponseSchema, { method: 'POST', body: input }),
    // `needs_profile`: la contraseña es correcta pero hay que volver a declarar la edad; todavía no hay sesión.
    onSuccess: (data) => {
      if (data.status === 'ok') client.setQueryData(SESSION_KEY, data.user);
    },
  });
}

/**
 * Ingreso con Google. Con una cuenta que ya existe, abre sesión. Con una persona nueva, el servidor responde
 * `needs_profile` y **no crea nada**: hay que reenviar la misma credencial con la edad y los consentimientos.
 */
export function useGoogleLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { credential: string; profile?: Consent }) =>
      apiRequest('/auth/google', googleLoginResponseSchema, { method: 'POST', body: input }),
    onSuccess: (data) => {
      if (data.status === 'ok') client.setQueryData(SESSION_KEY, data.user);
    },
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterRequest) =>
      apiRequest('/auth/register', authResponseSchema, { method: 'POST', body: input }),
    onSuccess: (data) => client.setQueryData(SESSION_KEY, data.user),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest('/auth/logout', z.null(), { method: 'POST' }),
    onSettled: async () => {
      // Lo que esté en vuelo no debe escribir en la caché ya vaciada (datos de la persona que sale).
      await client.cancelQueries();
      client.setQueryData(SESSION_KEY, null);
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    },
  });
}

/** A dónde va una persona al entrar: editores y administradores a su panel de administración; lectores al suyo. */
export function homeFor(user: AuthUser | null | undefined): string {
  return isStaff(user) ? '/admin' : '/panel';
}

/**
 * A dónde va una persona al terminar de ingresar o de registrarse: a la dirección que traía (`from`, la que la mandó a
 * `/ingresar`) o, si no hay, a su inicio por rol. Una dirección de `/admin` solo se respeta para el equipo: quien llegó a
 * `/admin` sin sesión y resulta ser lector (por ejemplo, entró con una cuenta nueva de Google) va a su panel en lugar de
 * toparse con «sin permiso». Solo se aceptan rutas internas (empiezan con una sola `/`). Es comodidad, no seguridad: la
 * seguridad real de `/admin` es del API.
 */
export function landingAfterLogin(user: AuthUser, from: string | undefined): string {
  const internal = from !== undefined && from.startsWith('/') && !from.startsWith('//');
  if (!internal) return homeFor(user);
  const toAdmin = from === '/admin' || from.startsWith('/admin/') || from.startsWith('/admin?');
  return toAdmin && !isStaff(user) ? homeFor(user) : from;
}

/** Editores y administradores entran al panel. */
export function isStaff(user: AuthUser | null | undefined): boolean {
  return user?.role === 'EDITOR' || user?.role === 'ADMIN';
}
