import type { RequestHandler } from 'express';

/** Pide a los buscadores que no indexen la respuesta (`X-Robots-Tag`). Va en todo `/api`: son datos, no páginas. */
export const noIndex: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  next();
};
