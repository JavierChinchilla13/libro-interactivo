import { LEGAL_VERSION } from '@libro/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert, PageHeader } from '../../shared/ui/layout';

/**
 * Dato que todavía no tiene el equipo: se ve marcado en el texto. Los textos legales son un borrador y nada aquí inventa
 * datos del titular ni de la autora; lo que falta se completa en la revisión legal.
 */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded-sm bg-warning/20 px-1 text-text">[PLACEHOLDER: {children}]</mark>;
}

const LEGAL_LINKS = [
  { to: '/privacidad', label: 'Privacidad' },
  { to: '/terminos', label: 'Términos' },
  { to: '/cookies', label: 'Cookies' },
] as const;

/** Un apartado del texto, con su titular de segundo nivel. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title !text-xl">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Marco común de las páginas legales: el titular, el cartel de borrador (visible en todas), la versión de los textos
 * y el índice entre las tres. El cuerpo de cada página es texto en componentes, para que la revisión legal lo cambie
 * sin tocar lógica.
 */
export function LegalPage({
  title,
  subtitle,
  current,
  children,
}: {
  title: string;
  subtitle: string;
  current: (typeof LEGAL_LINKS)[number]['to'];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={title} subtitle={subtitle} />
      <Alert tone="warning" title="Borrador pendiente de revisión legal">
        <p className="mt-1">
          Este texto es un borrador: lo revisará la clienta con su asesoría legal antes de
          publicarse. No es asesoría legal ni afirma el cumplimiento de ninguna norma. Lo marcado
          como <mark className="rounded-sm bg-warning/20 px-1 text-text">[PLACEHOLDER]</mark> aún no
          tiene dato.
        </p>
      </Alert>
      <nav aria-label="Textos legales" className="flex flex-wrap gap-x-6 text-sm">
        {LEGAL_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            aria-current={item.to === current ? 'page' : undefined}
            className={`link-slide inline-flex min-h-11 items-center ${
              item.to === current ? 'text-text' : 'text-muted hover:text-text'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="surface flex flex-col gap-8 rounded-token-lg p-5 leading-relaxed sm:p-7">
        {children}
      </div>
      <p className="text-sm text-muted">
        Versión de los textos: <span className="tabular-nums">{LEGAL_VERSION}</span>. Fecha de
        vigencia: <Placeholder>fecha en que se publiquen</Placeholder>.
      </p>
    </div>
  );
}
