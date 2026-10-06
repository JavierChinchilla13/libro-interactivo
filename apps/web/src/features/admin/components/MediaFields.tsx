import type { ImageRefInput, MediaInput, UPLOAD_PURPOSES, VideoRef } from '@libro/shared';
import { useRef, useState } from 'react';
import { Button, TextField } from '../../../shared/ui/controls';
import { Alert } from '../../../shared/ui/layout';
import { errorMessage } from '../errors';
import { uploadImage, uploadVideo } from '../uploads';

type Purpose = (typeof UPLOAD_PURPOSES)[number];

/** Vista reducida de una imagen de Cloudinary (transformaciones en la URL: formato y calidad automáticos). */
export function thumbUrl(url: string, width = 320): string {
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
}

/**
 * Subir/cambiar/quitar una imagen. Sube directo a Cloudinary con firma del servidor y guarda el `ImageRef`.
 * El texto alternativo es obligatorio (accesibilidad).
 */
export function ImageField({
  label,
  value,
  onChange,
  purpose,
  hint,
}: {
  label: string;
  value: ImageRefInput | undefined;
  onChange: (value: ImageRefInput | undefined) => void;
  purpose: Purpose;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(value?.alt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadImage(file, purpose, alt || label));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      {value ? (
        <img
          src={thumbUrl(value.url)}
          alt={value.alt}
          className="max-h-40 w-auto max-w-full self-start rounded-token border border-border"
        />
      ) : (
        <p className="text-sm text-muted">Sin imagen.</p>
      )}
      <TextField
        label="Texto alternativo (describe la imagen)"
        value={value ? value.alt : alt}
        onChange={(event) => {
          setAlt(event.target.value);
          if (value) onChange({ ...value, alt: event.target.value });
        }}
      />
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label={`Elegir archivo: ${label}`}
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          {value ? 'Cambiar imagen' : 'Subir imagen'}
        </Button>
        {value ? (
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            Quitar
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? <Alert>{error}</Alert> : null}
    </fieldset>
  );
}

/** Imagen **o** video corto (solo para el resultado de un quiz). */
export function MediaField({
  value,
  onChange,
}: {
  value: MediaInput | undefined;
  onChange: (value: MediaInput | undefined) => void;
}) {
  const video = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickVideo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: VideoRef = await uploadVideo(file, 'Video del resultado');
      onChange({ kind: 'video', video: uploaded });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      if (video.current) video.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ImageField
        label="Imagen del resultado"
        purpose="quiz"
        value={value?.kind === 'image' ? value.image : undefined}
        onChange={(image) => onChange(image ? { kind: 'image', image } : undefined)}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">O un video corto</legend>
        <p className="text-xs text-muted">
          Clip mudo de unos 5 segundos (MP4 o WebM, hasta 5 MB). Si subes un video, reemplaza a la
          imagen.
        </p>
        {value?.kind === 'video' ? (
          <>
            <p className="text-sm">
              Video subido ({Math.round(value.video.durationSeconds)} s).{' '}
              <button type="button" className="underline" onClick={() => onChange(undefined)}>
                Quitar
              </button>
            </p>
            <TextField
              label="Descripción del video"
              value={value.video.alt}
              onChange={(event) =>
                onChange({ kind: 'video', video: { ...value.video, alt: event.target.value } })
              }
            />
          </>
        ) : null}
        <input
          ref={video}
          type="file"
          accept="video/mp4,video/webm"
          className="sr-only"
          aria-label="Elegir video"
          onChange={(event) => void pickVideo(event.target.files?.[0])}
        />
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => video.current?.click()}
          className="self-start"
        >
          {value?.kind === 'video' ? 'Cambiar video' : 'Subir video'}
        </Button>
        {error ? <Alert>{error}</Alert> : null}
      </fieldset>
    </div>
  );
}
