import { useEffect, useState } from 'react';
import { measureBackdrop } from './measureBackdrop';

/**
 * Color de la zona más clara de una imagen (miniatura), medido en el navegador. `measuring` es verdadero mientras se
 * mide; sin medida (no se pudo, o `enabled` es falso) `hex` queda `undefined` y quien lo usa cae al piso seguro.
 */
export function useMeasuredBackdrop(
  sampleUrl: string | undefined,
  enabled = true,
): { hex: string | undefined; measuring: boolean } {
  const [measurement, setMeasurement] = useState<{ url: string; hex: string | undefined } | null>(
    null,
  );
  useEffect(() => {
    if (!sampleUrl || !enabled) return;
    let cancelled = false;
    void measureBackdrop(sampleUrl).then((hex) => {
      if (!cancelled) setMeasurement({ url: sampleUrl, hex });
    });
    return () => {
      cancelled = true;
    };
  }, [sampleUrl, enabled]);
  const active = sampleUrl !== undefined && enabled;
  const done = active && measurement?.url === sampleUrl;
  return { hex: done ? measurement?.hex : undefined, measuring: active && !done };
}
