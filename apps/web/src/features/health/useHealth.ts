import { healthResponseSchema } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../shared/api/client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiRequest('/health', healthResponseSchema, { signal }),
    retry: false,
    refetchInterval: 30_000,
  });
}
