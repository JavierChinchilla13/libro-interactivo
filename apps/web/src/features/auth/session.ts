import {
  authResponseSchema,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiClientError, apiRequest } from '../../shared/api/client';

export const SESSION_KEY = ['session'] as const;

/** `null` = sin sesión. Cualquier otro error (red, servidor) se propaga para que la pantalla lo muestre. */
async function fetchSession(): Promise<AuthUser | null> {
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
      apiRequest('/auth/login', authResponseSchema, { method: 'POST', body: input }),
    onSuccess: (data) => client.setQueryData(SESSION_KEY, data.user),
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
    onSettled: () => {
      client.setQueryData(SESSION_KEY, null);
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    },
  });
}

/** A dónde va una persona al entrar: editoras y administradoras a su panel de administración; lectoras al suyo. */
export function homeFor(user: AuthUser | null | undefined): string {
  return isStaff(user) ? '/admin' : '/panel';
}

/** Editoras y administradoras entran al panel. */
export function isStaff(user: AuthUser | null | undefined): boolean {
  return user?.role === 'EDITOR' || user?.role === 'ADMIN';
}
