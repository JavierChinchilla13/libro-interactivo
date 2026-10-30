import type { RequestHandler } from 'express';

/** Pide a los buscadores que no indexen la respuesta (`X-Robots-Tag`). Va en todo `/api`: son datos, no páginas. */
export const noIndex: RequestHandler = (req, res, next) => {
  // El sitemap es lo único de `/api` que se quiere que los buscadores lean (solo existe con la indexación abierta).
  if (req.path !== '/sitemap.xml') res.setHeader('X-Robots-Tag', 'noindex');
  next();
};
