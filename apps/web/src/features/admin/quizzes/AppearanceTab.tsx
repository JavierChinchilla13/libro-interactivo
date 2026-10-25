import {
  APPEARANCE_ACCENTS,
  OVERLAY_MAX,
  overlayMinimum,
  type AppearanceAccent,
  type AppearanceHistoryEntry,
  type QuizAppearanceResponse,
  type QuizDetailResponse,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '../../../shared/api/client';
import { posterUrl, thumbUrl } from '../../../shared/lib/cloudinary';
import { measureBackdrop } from '../../../shared/lib/measureBackdrop';
import { Button, TextField } from '../../../shared/ui/controls';
import { Alert, Card, Loading } from '../../../shared/ui/layout';
import { appearanceApi, keys } from '../api';
import { ImageField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { errorMessage } from '../errors';
import { uploadBackgroundVideo } from '../uploads';
import {
  autoStrength,
  clampStrength,
  contrastReport,
  FIELD_LABELS,
  formFromAppearance,
  formKey,
  sampleSource,
  toAppearance,
  type AppearanceForm,
} from './appearanceForm';
import { AppearancePreview } from './AppearancePreview';

const ACCENT_LABELS: Record<AppearanceAccent, string> = {
  primary: 'Cian',
  accent: 'Lavanda',
  success: 'Verde',
  warning: 'Ámbar',
};

const ACTION_LABELS: Record<AppearanceHistoryEntry['action'], string> = {
  seed: 'Primera edición',
  update: 'Edición',
  revert: 'Reversión',
};

/** Color real de un token del sitio (para calcular contrastes); `undefined` si no se puede leer. */
function tokenHex(name: string): string | undefined {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--token-${name}`)
    .trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

const percent = (value: number) => `${Math.round(value * 100)} %`;
const ratio = (value: number) => value.toFixed(1).replace('.', ',');

/** Pestaña «Apariencia»: fondo, velo, acento, portada e introducción. Se aplica en vivo, sin publicar una versión. */
export function AppearanceTab({
  quiz,
  archived,
  title,
}: {
  quiz: QuizDetailResponse;
  archived: boolean;
  /** Título que se muestra en la vista previa (el del borrador). */
  title: string;
}) {
  const query = useQuery({
    queryKey: keys.appearance(quiz.id),
    queryFn: () => appearanceApi.get(quiz.id),
    // Siempre lo más reciente: otra persona pudo editar mientras esta pestaña estaba cerrada.
    staleTime: 0,
  });
  const [generation, setGeneration] = useState(0);
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  if (!query.data) return <Loading />;
  return (
    <AppearanceEditor
      key={`${query.data.rev}-${generation}`}
      quiz={quiz}
      archived={archived}
      title={title}
      server={query.data}
      onReload={async () => {
        await query.refetch();
        setGeneration((value) => value + 1);
      }}
    />
  );
}

function AppearanceEditor({
  quiz,
  archived,
  title,
  server,
  onReload,
}: {
  quiz: QuizDetailResponse;
  archived: boolean;
  title: string;
  server: QuizAppearanceResponse;
  onReload: () => Promise<void>;
}) {
  const client = useQueryClient();
  const defaults = useMemo(
    () => ({ introHtml: quiz.draft.instructionsHtml ?? '', cover: quiz.draft.image }),
    [quiz.draft.instructionsHtml, quiz.draft.image],
  );
  const [form, setForm] = useState<AppearanceForm>(() =>
    formFromAppearance(server.appearance, defaults),
  );
  const [rev, setRev] = useState(server.rev);
  const [history, setHistory] = useState(server.history);
  const [warnings, setWarnings] = useState(server.warnings);
  const [savedKey, setSavedKey] = useState(() =>
    formKey(formFromAppearance(server.appearance, defaults)),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<{ url: string; hex: string | undefined } | null>(
    null,
  );
  const patch = (changes: Partial<AppearanceForm>) =>
    setForm((current) => ({ ...current, ...changes }));

  // Mide la zona más clara del fondo (imagen o póster) para el velo automático y el aviso de contraste.
  const source = sampleSource(form);
  const sampleUrl = source
    ? form.kind === 'video'
      ? posterUrl(source, 64)
      : thumbUrl(source, 64)
    : undefined;
  useEffect(() => {
    if (!sampleUrl) return;
    let cancelled = false;
    void measureBackdrop(sampleUrl).then((hex) => {
      if (!cancelled) setMeasurement({ url: sampleUrl, hex });
    });
    return () => {
      cancelled = true;
    };
  }, [sampleUrl]);
  const measuring = sampleUrl !== undefined && measurement?.url !== sampleUrl;
  const measured = measurement?.url === sampleUrl ? measurement?.hex : undefined;

  // Colores reales de los acentos (tokens del sitio) para avisar si alguno no se lee.
  const accentHex = form.accent ? tokenHex(form.accent) : undefined;

  // Modo automático: la intensidad sigue a la medida (sin medida, el piso 0,78, que es seguro).
  const strength =
    form.kind === 'none'
      ? 0
      : form.mode === 'auto'
        ? measuring
          ? clampStrength('auto', form.strength)
          : autoStrength(measured)
        : clampStrength('manual', form.strength);
  const effective: AppearanceForm = { ...form, strength: strength || form.strength };
  const dirty = formKey(effective) !== savedKey;

  // Aviso antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const report = form.kind === 'none' ? null : contrastReport(measured, strength, accentHex);

  const backgroundAlt =
    form.kind === 'image' ? form.image?.alt : form.kind === 'video' ? form.video?.alt : 'ok';
  const missing =
    form.kind === 'image' && !form.image
      ? 'Sube la imagen de fondo o elige «Sin fondo».'
      : form.kind === 'video' && !form.video
        ? 'Sube el video de fondo o elige «Sin fondo».'
        : !backgroundAlt?.trim()
          ? 'Escribe el texto alternativo del fondo (describe la imagen o el video).'
          : null;

  const save = useMutation({
    mutationFn: () => appearanceApi.update(quiz.id, toAppearance(effective), rev),
    onSuccess: async (result) => {
      setRev(result.rev);
      setHistory(result.history);
      setWarnings(result.warnings);
      setSavedKey(formKey(effective));
      setNotice('Guardado. Ya lo ven las lectoras, sin publicar una versión nueva.');
      client.setQueryData(keys.appearance(quiz.id), result);
      // El editor viejo oculta la introducción y la portada cuando existe apariencia.
      await client.invalidateQueries({ queryKey: keys.quiz(quiz.id) });
    },
  });

  const revert = useMutation({
    mutationFn: (entryRev: number) => appearanceApi.revert(quiz.id, entryRev, rev),
    onSuccess: async (result) => {
      const next = formFromAppearance(result.appearance, defaults);
      setForm(next);
      setRev(result.rev);
      setHistory(result.history);
      setWarnings(result.warnings);
      setSavedKey(formKey(next));
      setNotice('Se volvió al estado anterior a ese cambio. Ya lo ven las lectoras.');
      client.setQueryData(keys.appearance(quiz.id), result);
      await client.invalidateQueries({ queryKey: keys.quiz(quiz.id) });
    },
  });

  const failure = save.error ?? revert.error;
  const stale =
    failure instanceof ApiClientError && failure.code === 'CONFLICT' && !archived ? failure : null;
  const busy = save.isPending || revert.isPending;
  const disabled = archived || busy;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {archived ? (
          <Alert tone="warning" title="La apariencia no se puede cambiar">
            No se puede cambiar su apariencia. Puedes ver cómo quedó en la vista previa.
          </Alert>
        ) : null}
        <p className="text-sm text-muted">
          La apariencia se aplica en cuanto guardas, sin publicar una versión nueva. Cambia solo lo
          que se ve; las preguntas y los resultados siguen su propia publicación.
        </p>

        <Card className="flex min-w-0 flex-col gap-4">
          <h2 className="font-semibold">Fondo</h2>
          <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
            <legend className="sr-only">Tipo de fondo</legend>
            {(
              [
                ['none', 'Sin fondo'],
                ['image', 'Imagen'],
                ['video', 'Video corto'],
              ] as const
            ).map(([kind, label]) => (
              <Chip
                key={kind}
                name="background-kind"
                checked={form.kind === kind}
                onSelect={() => patch({ kind })}
              >
                {label}
              </Chip>
            ))}
          </fieldset>

          {form.kind === 'image' ? (
            <ImageField
              label="Imagen de fondo"
              purpose="quiz-bg"
              value={form.image}
              onChange={(image) => patch({ image })}
              altMaxLength={200}
              hint="JPG, PNG, WebP o GIF, hasta 10 MB. Mejor una imagen horizontal de al menos 1280 px de ancho."
            />
          ) : null}
          {form.kind === 'video' ? (
            <VideoField
              value={form.video}
              onChange={(video) => patch({ video })}
              disabled={disabled}
            />
          ) : null}
          {missing && form.kind !== 'none' ? (
            <p className="text-sm text-warning" role="status">
              {missing}
            </p>
          ) : null}
        </Card>

        <Card className="flex min-w-0 flex-col gap-4">
          <h2 className="font-semibold">Velo de contraste</h2>
          <p className="text-sm text-muted">
            Una capa oscura sobre el fondo para que el texto se lea. En automático se calcula
            midiendo la zona más clara del fondo; en manual la eliges tú, nunca por debajo de{' '}
            {percent(overlayMinimum('manual'))}.
          </p>
          <fieldset className="flex flex-wrap gap-2" disabled={disabled || form.kind === 'none'}>
            <legend className="sr-only">Modo del velo</legend>
            {(
              [
                ['auto', 'Automático'],
                ['manual', 'Manual'],
              ] as const
            ).map(([mode, label]) => (
              <Chip
                key={mode}
                name="overlay-mode"
                checked={form.mode === mode}
                onSelect={() => patch({ mode, strength: clampStrength(mode, form.strength) })}
              >
                {label}
              </Chip>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor="overlay-strength" className="flex justify-between text-sm font-medium">
              <span>Intensidad</span>
              <span className="tabular-nums">{form.kind === 'none' ? '—' : percent(strength)}</span>
            </label>
            <input
              id="overlay-strength"
              type="range"
              min={overlayMinimum(form.mode)}
              max={OVERLAY_MAX}
              step={0.01}
              value={form.kind === 'none' ? overlayMinimum(form.mode) : strength}
              disabled={disabled || form.kind === 'none' || form.mode === 'auto'}
              onChange={(event) =>
                patch({ strength: clampStrength('manual', Number(event.target.value)) })
              }
              className="min-h-11 w-full"
            />
            {form.mode === 'auto' && form.kind !== 'none' ? (
              <p className="text-xs text-muted">
                {measuring
                  ? 'Midiendo el fondo…'
                  : measured
                    ? 'Calculada con la zona más clara del fondo.'
                    : 'No pudimos medir el fondo desde el navegador: se usa el mínimo seguro.'}
              </p>
            ) : null}
          </div>
          {report ? <ContrastNotice report={report} /> : null}
        </Card>

        <Card className="flex min-w-0 flex-col gap-3">
          <h2 className="font-semibold">Color de acento</h2>
          <p className="text-sm text-muted">
            Tiñe el título del quiz, el borde de la portada y la barra de avance. Nunca el texto
            corrido.
          </p>
          <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
            <legend className="sr-only">Color de acento</legend>
            {([undefined, ...APPEARANCE_ACCENTS] as const).map((accent) => (
              <Chip
                key={accent ?? 'default'}
                name="accent"
                checked={form.accent === accent}
                onSelect={() => patch({ accent })}
              >
                <span
                  aria-hidden="true"
                  className="size-3.5 rounded-full border border-border"
                  style={{ background: `var(--token-${accent ?? 'primary'})` }}
                />
                {accent ? ACCENT_LABELS[accent] : 'Por defecto'}
              </Chip>
            ))}
          </fieldset>
        </Card>

        <Card className="flex min-w-0 flex-col gap-4">
          <h2 className="font-semibold">Portada e introducción</h2>
          <ImageField
            label="Portada del quiz"
            purpose="quiz"
            value={form.cover}
            onChange={(cover) => patch({ cover })}
            altMaxLength={200}
            removable={!quiz.draft.image}
            hint={
              quiz.draft.image
                ? 'Para cambiarla, sube otra. Quitarla del todo no está disponible todavía.'
                : 'Opcional.'
            }
          />
          <RichTextEditor
            label="Introducción"
            value={form.introHtml}
            onChange={(introHtml) => patch({ introHtml })}
          />
          <p className="text-xs text-muted">
            Es ambientación del quiz, no reglas de puntaje: no nombres resultados ni des pistas. Un
            cuadro vacío quita la introducción a propósito.
          </p>
          <p className="text-xs text-muted tabular-nums">
            {form.introHtml.length} / 5000 caracteres de HTML
          </p>
        </Card>

        {warnings.includes('APPEARANCE_MENTIONS_RESULT') ? (
          <Alert tone="warning" title="Cuidado: puede revelar un resultado">
            La introducción o un texto alternativo nombra un resultado de este quiz. Se guardó, pero
            revísalo para no dar pistas antes de tiempo.
          </Alert>
        ) : null}
        {notice && !failure ? <Alert tone="success">{notice}</Alert> : null}
        {failure && !stale ? <Alert>{errorMessage(failure)}</Alert> : null}
        {stale ? (
          <Alert tone="warning" title="Otra persona cambió la apariencia mientras editabas">
            <p>
              Tus cambios no se guardaron para no pisar los suyos. Carga la versión actual para
              seguir desde ahí (se pierden los cambios que no guardaste).
            </p>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => {
                save.reset();
                revert.reset();
                void onReload();
              }}
            >
              Cargar la versión actual
            </Button>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={disabled || !dirty || Boolean(missing) || measuring}
            loading={save.isPending}
            onClick={() => {
              setNotice(null);
              save.mutate();
            }}
          >
            Guardar apariencia
          </Button>
          {dirty ? <span className="text-sm text-warning">Cambios sin guardar</span> : null}
        </div>

        <HistoryList
          history={history}
          disabled={disabled || dirty}
          busy={revert.isPending}
          onRevert={(entryRev) => {
            setNotice(null);
            revert.mutate(entryRev);
          }}
        />
      </div>

      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <AppearancePreview form={form} strength={strength} title={title} />
      </div>
    </div>
  );
}

/** Opción en forma de pastilla: el radio nativo queda oculto para la vista (pero sigue siendo el control del teclado). */
function Chip({
  name,
  checked,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-(--token-dur-fast) ease-token-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
        checked ? 'border-primary bg-surface-alt text-text' : 'border-border text-muted'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      {children}
    </label>
  );
}

function ContrastNotice({ report }: { report: ReturnType<typeof contrastReport> }) {
  const basis =
    report.basis === 'measured'
      ? 'sobre la zona más clara de este fondo'
      : 'en el peor caso (un punto blanco del fondo)';
  return (
    <div
      role="status"
      className={`rounded-token border p-3 text-sm ${report.ok ? 'border-success/50' : 'border-warning'}`}
    >
      <p className="font-medium">
        {report.ok ? 'El texto se lee bien' : 'Ojo: el texto podría leerse mal'}
      </p>
      <ul className="mt-1 text-muted tabular-nums">
        <li>
          Texto atenuado: {ratio(report.muted)}:1 {report.muted >= 4.5 ? '✓' : '(mínimo 4,5)'}
        </li>
        <li>
          Texto principal: {ratio(report.text)}:1 {report.text >= 4.5 ? '✓' : '(mínimo 4,5)'}
        </li>
        {report.accent !== undefined ? (
          <li>
            Acento (títulos y bordes): {ratio(report.accent)}:1{' '}
            {report.accent >= 3 ? '✓' : '(mínimo 3)'}
          </li>
        ) : null}
      </ul>
      <p className="mt-1 text-xs text-muted">Calculado {basis}.</p>
    </div>
  );
}

function HistoryList({
  history,
  disabled,
  busy,
  onRevert,
}: {
  history: AppearanceHistoryEntry[];
  disabled: boolean;
  busy: boolean;
  onRevert: (rev: number) => void;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <h2 className="font-semibold">Historial</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay cambios guardados.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            «Volver a antes» deshace ese cambio (y deja el estado que había antes). Guarda primero
            lo que estés editando.
          </p>
          <ol className="flex flex-col divide-y divide-border">
            {[...history].reverse().map((entry) => (
              <li
                key={entry.rev}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    #{entry.rev} · {ACTION_LABELS[entry.action]}
                  </p>
                  <p className="break-words text-muted">
                    {new Date(entry.at).toLocaleString('es-CR')} ·{' '}
                    {entry.by.name ?? 'cuenta eliminada'}
                  </p>
                  <p className="break-words text-muted">
                    {entry.changed.length > 0
                      ? `Cambió: ${entry.changed.map((field) => FIELD_LABELS[field]).join(', ')}`
                      : 'Sin cambios visibles'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={disabled}
                  loading={busy}
                  onClick={() => onRevert(entry.rev)}
                >
                  Volver a antes
                </Button>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

/** Video corto de fondo: se revisa peso, formato y duración antes de subir, con mensajes claros. */
function VideoField({
  value,
  onChange,
  disabled,
}: {
  value: AppearanceForm['video'];
  onChange: (video: AppearanceForm['video']) => void;
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
      onChange(await uploadBackgroundVideo(file, value?.alt ?? 'Video de fondo del quiz'));
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
