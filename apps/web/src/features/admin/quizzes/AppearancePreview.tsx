import type { AppearanceAccent, ImageRefInput } from '@libro/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { posterUrl, thumbUrl } from '../../../shared/lib/cloudinary';
import { accentVar } from '../../../shared/lib/quizAppearance';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import type { AppearanceForm } from './appearanceForm';

/** Tamaños de pantalla que se comparan: un celular y un escritorio. */
export const PREVIEW_SIZES = {
  movil: { label: 'Celular · 375 px', width: 375, height: 720 },
  escritorio: { label: 'Escritorio · 1280 px', width: 1280, height: 760 },
} as const;
type SizeKey = keyof typeof PREVIEW_SIZES;

/** Reduce una pantalla de tamaño real para que quepa en la columna, sin cambiar cómo se ve por dentro. */
function ScaledFrame({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(width);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, available / width);
  return (
    <div ref={box} className="w-full">
      <div
        className="mx-auto overflow-hidden rounded-token-lg border border-border"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          // El contenido de muestra no es interactivo: es una imagen de cómo se verá.
          inert
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Cómo verá la lectora la introducción del quiz con lo que se está editando, a 375 px y a 1280 px, con contenido de
 * muestra. Usa las mismas clases que la pantalla real; el video se ve como su póster (en el quiz se mueve).
 */
export function AppearancePreview({
  form,
  strength,
  title,
}: {
  form: AppearanceForm;
  /** Intensidad real del velo (ya resuelta). */
  strength: number;
  title: string;
}) {
  const [size, setSize] = useState<SizeKey>('movil');
  const { width, height } = PREVIEW_SIZES[size];
  const mediaSrc =
    form.kind === 'image' && form.image
      ? thumbUrl(form.image.url, 1080)
      : form.kind === 'video' && form.video
        ? posterUrl(form.video.posterUrl, 960)
        : undefined;
  const style = {
    '--quiz-veil': strength,
    ...(form.accent ? { '--quiz-accent': accentVar(form.accent as AppearanceAccent) } : {}),
  } as CSSProperties;

  return (
    <section aria-label="Vista previa" className="flex flex-col gap-3">
      <div role="group" aria-label="Tamaño de la vista previa" className="flex flex-wrap gap-2">
        {(Object.keys(PREVIEW_SIZES) as SizeKey[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={size === key}
            onClick={() => setSize(key)}
            className={`min-h-11 rounded-full border px-4 text-sm transition-colors duration-(--token-dur-fast) ease-token-out ${
              size === key
                ? 'border-primary bg-surface-alt text-text'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            {PREVIEW_SIZES[key].label}
          </button>
        ))}
      </div>
      <ScaledFrame width={width} height={height}>
        <div className="quiz-preview" style={style} data-size={size} data-testid="quiz-preview">
          <div className="quiz-bg" data-contained data-loaded>
            {mediaSrc ? <img src={mediaSrc} alt="" className="quiz-bg-media" /> : null}
            <div className="quiz-bg-veil" />
          </div>
          <div className="quiz-preview-page mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex min-h-11 items-center px-3 text-sm font-semibold">
                ‹ Volver al panel
              </span>
              {form.kind === 'video' ? (
                <span className="playback-toggle" aria-hidden="true">
                  Pausar
                </span>
              ) : null}
            </div>
            <div className="quiz-hero">
              <CoverImage cover={form.cover} />
              <div className="quiz-hero-content">
                <p className="label">Quiz 1 de 3</p>
                <p className="page-title quiz-accent-title text-h2">{title || 'Título del quiz'}</p>
              </div>
            </div>
            {form.introHtml ? <SafeHtml html={form.introHtml} /> : null}
            <p className="text-sm text-muted">
              No hay respuestas correctas: elige la que más va contigo.
            </p>
            <div className="flex flex-col gap-3">
              <p className="text-xl font-semibold leading-snug">Pregunta de muestra</p>
              <div className="option">Una respuesta de muestra</div>
              <div className="option">Otra respuesta, un poco más larga que la anterior</div>
            </div>
            <span className="btn btn-primary btn-lg self-start">Comenzar</span>
          </div>
        </div>
      </ScaledFrame>
    </section>
  );
}

function CoverImage({ cover }: { cover: ImageRefInput | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!cover || failed) return null;
  return (
    <img
      src={thumbUrl(cover.url, 1200)}
      alt=""
      className="quiz-hero-img"
      onError={() => setFailed(true)}
    />
  );
}
