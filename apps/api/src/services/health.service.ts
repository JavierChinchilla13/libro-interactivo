import type { HealthResponse } from '@libro/shared';

export function getHealth(isDbUp: () => boolean): HealthResponse {
  return {
    status: 'ok',
    db: isDbUp() ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
  };
}
