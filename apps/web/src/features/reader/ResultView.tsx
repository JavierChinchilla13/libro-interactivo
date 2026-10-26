import type { ResultPayload } from '@libro/shared';
import { useEffect, useRef, type CSSProperties } from 'react';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { useBackgroundPlayback } from '../../shared/lib/useBackgroundPlayback';
import { FieldStage } from '../../shared/ui/FieldStage';
import { LoopVideo, PlaybackToggle, type LoopVideoSource } from '../../shared/ui/LoopVideo';
import { SafeHtml } from '../../shared/ui/SafeHtml';

/** Cada bloque entra un poco después del anterior (se apaga con «reducir movimiento»). */
const step = (index: number) => ({ animationDelay: `${index * 140}ms` });

/**
 * Clip corto y mudo del resultado. Corre solo en la pantalla del resultado; en una lista (historial) nunca se descarga
 * hasta que la persona lo pulsa. Con «reducir movimiento» o ahorro de datos solo se ve el póster. Pausa fuera de
 * pantalla y con la pestaña oculta, y no corre a la vez que otro elemento animado.
 */
function ResultVideo({
  video,
  autoplay,
  style,
}: {
  video: LoopVideoSource;
  autoplay: boolean;
  style: CSSProperties;
}) {
  const { attachRoot, attachVideo, state } = useBackgroundPlayback({ autoplay });
  return (
    <figure
      ref={attachRoot}
      style={style}
      className="result-video fade-up img-frame self-start rounded-token-xs"
    >
      <LoopVideo
        source={video}
        attachVideo={attachVideo}
        canAnimate={state.canAnimate}
        width={900}
        className="result-video-media"
        posterAlt={video.alt}
      />
      <PlaybackToggle state={state} label="video del resultado" className="result-video-toggle" />
    </figure>
  );
}

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
      {result.visual ? (
        <div className="fade-up" style={step(0)}>
          <FieldStage visualKey={result.visual.key}>
            <p className="eyebrow text-accent">Tu resultado</p>
            <Heading ref={heading} tabIndex={-1} className="page-title mt-1 focus:outline-none">
              {result.title}
            </Heading>
            <p className="text-sm text-muted">Campo: {result.visual.fieldName}</p>
          </FieldStage>
        </div>
      ) : (
        <div className="fade-up" style={step(0)}>
          <p className="eyebrow text-accent">Tu resultado</p>
          <Heading ref={heading} tabIndex={-1} className="page-title mt-1 focus:outline-none">
            {result.title}
          </Heading>
        </div>
      )}

      {media?.kind === 'image' ? (
        <img
          src={thumbUrl(media.image.url, 900)}
          alt={media.image.alt}
          style={step(1)}
          className="img-frame fade-up max-h-96 w-auto max-w-full self-start rounded-token-xs"
        />
      ) : null}
      {media?.kind === 'video' ? (
        <ResultVideo video={media.video} autoplay={asPage} style={step(1)} />
      ) : null}

      {result.description ? (
        <div className="fade-up" style={step(2)}>
          <SafeHtml html={result.description} />
        </div>
      ) : null}

      {result.facts && result.facts.length > 0 ? (
        <dl className="fade-up divide-y divide-line border-y border-line" style={step(3)}>
          {result.facts.map((fact, factIndex) => (
            <div
              key={factIndex}
              className="grid gap-1 py-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-4"
            >
              <dt className="text-sm text-muted">{fact.label}</dt>
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
