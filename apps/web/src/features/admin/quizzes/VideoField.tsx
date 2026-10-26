import { useRef, useState } from 'react';
import type { BackgroundVideo } from '@libro/shared';
import { posterUrl } from '../../../shared/lib/cloudinary';
import { Button, TextField } from '../../../shared/ui/controls';
import { Alert } from '../../../shared/ui/layout';
import { errorMessage } from '../errors';
import { uploadBackgroundVideo } from '../uploads';

/** Video corto de fondo: se revisa peso, formato y duración antes de subir, con mensajes claros. */
export function VideoField({
  value,
  onChange,
  disabled,
}: {
  value: BackgroundVideo | undefined;
  onChange: (video: BackgroundVideo | undefined) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadBackgroundVideo(file, value?.alt ?? ''));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">Video de fondo</legend>
      <p className="text-xs text-muted">
        Clip mudo y en bucle: MP4 o WebM, hasta 5 MB y 10 segundos. Cloudinary le saca el póster
        (primer fotograma), que es lo que se ve con movimiento reducido.
      </p>
      {value ? (
        <>
          <img
            src={posterUrl(value.posterUrl, 480)}
            alt={value.alt}
            className="max-h-40 w-auto max-w-full self-start rounded-token border border-border"
          />
          <p className="text-sm text-muted">
            {Math.round(value.durationSeconds * 10) / 10} s · {value.width}×{value.height}
          </p>
          <TextField
            label="Texto alternativo (describe el video)"
            value={value.alt}
            maxLength={200}
            error={value.alt.trim() ? undefined : 'Describe el video para quien no lo puede ver.'}
            onChange={(event) => onChange({ ...value, alt: event.target.value })}
          />
        </>
      ) : (
        <p className="text-sm text-muted">Sin video.</p>
      )}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm"
        className="sr-only"
        aria-label="Elegir video de fondo"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          {value ? 'Cambiar video' : 'Subir video'}
        </Button>
        {value ? (
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            Quitar
          </Button>
        ) : null}
      </div>
      {error ? <Alert>{error}</Alert> : null}
    </fieldset>
  );
}
