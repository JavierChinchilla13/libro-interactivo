import type { ResultPayload } from '@libro/shared';
import { useEffect, useRef } from 'react';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { SafeHtml } from '../../shared/ui/SafeHtml';

/** Cada bloque entra un poco después del anterior (se apaga con «reducir movimiento»). */
const step = (index: number) => ({ animationDelay: `${index * 140}ms` });

/**
 * Resultado de un quiz: título, imagen o video corto, descripción, datos y, si el quiz lo pide,
 * el porcentaje de cada resultado. El servidor solo lo entrega después de completar el quiz.
 *
 * Con `asPage` es el titular de la pantalla (`h1`) y recibe el foco al aparecer, para que un lector de pantalla
 * anuncie el resultado; en el historial (`h2`) no roba el foco.
 */
export function ResultView({
  result,
  asPage = false,
}: {
  result: ResultPayload;
  asPage?: boolean;
}) {
  const media = result.media;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (asPage) heading.current?.focus();
  }, [asPage]);
  const Heading = asPage ? 'h1' : 'h2';
  return (
    <article className="flex flex-col gap-5" aria-label="Tu resultado">
      <div className="fade-up" style={step(0)}>
        <p className="eyebrow">Tu resultado</p>
        <Heading
          ref={heading}
          tabIndex={-1}
          className="text-gradient mt-1 font-display text-4xl font-bold leading-tight focus:outline-none sm:text-5xl"
        >
          {result.title}
        </Heading>
      </div>

      {media?.kind === 'image' ? (
        <img
          src={thumbUrl(media.image.url, 900)}
          alt={media.image.alt}
          style={step(1)}
          className="glow-frame fade-up max-h-96 w-auto max-w-full self-start rounded-token-lg"
        />
      ) : null}
      {media?.kind === 'video' ? (
        // Clip corto y mudo: se repite solo, pero con controles para quien prefiera pausarlo (reducir movimiento).
        <video
          src={media.video.url}
          poster={media.video.posterUrl}
          muted
          loop
          playsInline
          controls
          aria-label={media.video.alt}
          style={step(1)}
          className="fade-up max-h-96 max-w-full self-start rounded-token-lg border border-border"
        />
      ) : null}

      {result.description ? (
        <div className="fade-up" style={step(2)}>
          <SafeHtml html={result.description} />
        </div>
      ) : null}

      {result.facts && result.facts.length > 0 ? (
        <dl className="fade-up grid gap-3 sm:grid-cols-2" style={step(3)}>
          {result.facts.map((fact, factIndex) => (
            <div key={factIndex} className="glass rounded-token-lg p-4">
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {result.distribution ? (
        <section aria-label="Tu perfil" className="fade-up flex flex-col gap-2" style={step(4)}>
          <h3 className="font-semibold">Este es tu perfil</h3>
          <ul className="flex flex-col gap-2">
            {[...result.distribution]
              .sort((a, b) => b.percent - a.percent)
              .map((row) => (
                <li key={row.key}>
                  <div className="flex justify-between text-sm">
                    <span>{row.title}</span>
                    <strong>{row.percent}%</strong>
                  </div>
                  <div className="meter" aria-hidden="true">
                    <div className="meter-fill" style={{ width: `${row.percent}%` }} />
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
