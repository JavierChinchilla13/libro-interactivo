import type { RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/errors.js';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export interface ValidatedInput<B = unknown, Q = unknown, P = unknown> {
  body: B;
  query: Q;
  params: P;
}

/**
 * Valida body/query/params con Zod. Los valores ya parseados quedan en `res.locals.input`
 * (usar `getInput`); el controller nunca lee `req.body` crudo.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const input: ValidatedInput = { body: undefined, query: undefined, params: undefined };
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const detail = result.error.issues
          .map((issue) => `${[key, ...issue.path].join('.')}: ${issue.message}`)
          .join('; ');
        next(new AppError('VALIDATION', `Datos no válidos (${detail})`));
        return;
      }
      input[key] = result.data;
    }
    res.locals['input'] = input;
    next();
  };
}

export function getInput<B = unknown, Q = unknown, P = unknown>(
  res: Response,
): ValidatedInput<B, Q, P> {
  return res.locals['input'] as ValidatedInput<B, Q, P>;
}
