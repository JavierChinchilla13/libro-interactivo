import type { ErrorCode } from '@libro/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  AUTH_INVALID: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_UNLOCKED: 403,
  TOKEN_INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Error esperado del dominio: se responde con `{ error: { code, message } }` y el estado HTTP del código. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }
}
