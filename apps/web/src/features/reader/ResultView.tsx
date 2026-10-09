import type { ResultPayload } from '@libro/shared';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { SafeHtml } from '../../shared/ui/SafeHtml';

/**
 * Resultado de un quiz: título, imagen o video corto, descripción, datos y, si el quiz lo pide,
 * el porcentaje de cada resultado. El servidor solo lo entrega después de completar el quiz.
 */
export function ResultView({ result }: { result: ResultPayload }) {
  const media = result.media;
  return (
    <article className="flex flex-col gap-5" aria-label="Tu resultado">
      <div>
        <p className="eyebrow">Tu resultado</p>
        <h2 className="text-gradient mt-1 font-display text-4xl font-bold leading-tight sm:text-5xl">
          {result.title}
        </h2>
      </div>

      {media?.kind === 'image' ? (
        <img
          src={thumbUrl(media.image.url, 900)}
          alt={media.image.alt}
          className="glow-frame max-h-96 w-auto max-w-full self-start rounded-token-lg"
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
          className="max-h-96 max-w-full self-start rounded-token-lg border border-border"
        />
      ) : null}

      {result.description ? <SafeHtml html={result.description} /> : null}

      {result.facts && result.facts.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {result.facts.map((fact, index) => (
            <div key={index} className="glass rounded-token-lg p-4">
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {result.distribution ? (
        <section aria-label="Tu perfil" className="flex flex-col gap-2">
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
