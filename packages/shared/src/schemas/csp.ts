import { z } from 'zod';

/**
 * Informe de una violación de la política de contenido (CSP) que el navegador envía a `POST /api/csp-report`. Llega de dos
 * formas: el formato antiguo (`report-uri`, `application/csp-report`: un objeto con `csp-report`) y el de la API de
 * Reportes (`application/reports+json`: una lista). Solo se leen unos pocos campos de texto; el resto se ignora.
 */
const text = z.string().max(2000).optional();

const legacyReportSchema = z.object({
  'csp-report': z.looseObject({
    'blocked-uri': text,
    'violated-directive': text,
    'effective-directive': text,
  }),
});

const reportingEntrySchema = z.looseObject({
  type: z.string().max(60).optional(),
  body: z
    .looseObject({
      blockedURL: text,
      effectiveDirective: text,
      violatedDirective: text,
    })
    .optional(),
});

export const cspReportBodySchema = z.union([
  legacyReportSchema,
  z.array(reportingEntrySchema).max(50),
]);
export type CspReportBody = z.infer<typeof cspReportBodySchema>;
