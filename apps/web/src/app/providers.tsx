import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiClientError } from '../shared/api/client';

/** Reintenta solo lo que puede mejorar solo (red o 5xx), poco y nunca un 4xx: un 403 o 404 no cambia al repetirlo. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiClientError && error.status !== undefined && error.status < 500)
    return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetry },
    },
  });
}

export function AppProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
