import {
  OVERLAY_MAX,
  overlayMinimum,
  type AppearanceHistoryEntry,
  type QuizAppearanceResponse,
  type QuizDetailResponse,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ApiClientError } from '../../../shared/api/client';
import { readableAccent } from '../../../shared/lib/accent';
import { posterUrl, thumbUrl } from '../../../shared/lib/cloudinary';
import { measureBackdrop } from '../../../shared/lib/measureBackdrop';
import { accentBackdrop } from '../../../shared/lib/quizAppearance';
import { Button } from '../../../shared/ui/controls';
import { Alert, Card, Loading } from '../../../shared/ui/layout';
import { appearanceApi, keys, quizzesApi } from '../api';
import { AccentField, Chip } from './AccentField';
import { QuestionsSection, type StageQuestions } from './QuestionsSection';
import { ContrastNotice } from './ContrastNotice';
import { VideoField } from './VideoField';
import { ImageField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { errorMessage } from '../errors';
import {
  autoStrength,
  clampStrength,
  contrastReport,
  FIELD_LABELS,
  formFromAppearance,
  formKey,
  incompleteQuestions,
  sampleSource,
  toAppearance,
  type AppearanceForm,
} from './appearanceForm';
import { AppearancePreview } from './AppearancePreview';

const ACTION_LABELS: Record<AppearanceHistoryEntry['action'], string> = {
  seed: 'Primera edición',
  update: 'Edición',
  revert: 'Reversión',
};

const percent = (value: number) => `${Math.round(value * 100)} %`;

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
  // Un fallo al refrescar no debe tirar un editor con cambios: el error solo manda si no hay nada que mostrar.
  if (!query.data && query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  // No se arranca con datos viejos del caché: otra persona pudo guardar mientras esta pestaña estaba cerrada.
  if (!query.data || !query.isFetchedAfterMount) return <Loading />;
  return (
    <AppearanceEditor
      // Solo se remonta al recargar a propósito: guardar no debe borrar el aviso de «Guardado».
      key={generation}
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
  // «Quiz N de M»: el lugar de este quiz entre los quizzes vigentes de su libro (como lo ve la lectora).
  const siblings = useQuery({
    queryKey: keys.quizzes(quiz.bookId),
    queryFn: () => quizzesApi.list(quiz.bookId),
  });
  const position = useMemo(() => {
    const live = (siblings.data?.quizzes ?? [])
      .filter((item) => item.status !== 'archived')
      .sort((a, b) => a.order - b.order);
    const index = live.findIndex((item) => item.id === quiz.id);
    return index >= 0 ? { index: index + 1, total: live.length } : undefined;
  }, [siblings.data, quiz.id]);
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
  // Las preguntas del borrador, por etapa: a ellas se ligan los ajustes (por id estable, nunca por posición).
  const stages: StageQuestions[] = quiz.draft.stages.map((stage, index) => ({
    id: stage.id,
    label: stage.title ? `Etapa ${index + 1} · ${stage.title}` : `Etapa ${index + 1}`,
    questions: stage.questions.map((question) => ({ id: question.id, text: question.text })),
  }));

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
  // El acento se lee contra el fondo ya velado (o, sin fondo de quiz, contra el color liso del sitio); si no se leería a
  // 3:1, se aclara lo mínimo. La autora ve el antes y el después; se guarda lo que ella eligió.
  // Igual que el lector: solo en modo automático mide el fondo; en manual cuenta el peor caso (un punto blanco).
  const accentSurface = accentBackdrop(
    form.kind !== 'none',
    form.mode === 'auto' ? measured : undefined,
    strength,
  );
  const accentResult = form.accent ? readableAccent(form.accent, accentSurface) : undefined;
  const report =
    form.kind === 'none' ? null : contrastReport(measured, strength, accentResult?.hex);

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

  const unfinished = incompleteQuestions(form);

  const save = useMutation({
    mutationFn: (sent: { body: ReturnType<typeof toAppearance>; key: string; rev: number }) =>
      appearanceApi.update(quiz.id, sent.body, sent.rev),
    onSuccess: async (result, sent) => {
      setRev(result.rev);
      setHistory(result.history);
      setWarnings(result.warnings);
      // Lo que se marca como guardado es lo que se envió, no lo que se haya tecleado mientras tanto.
      setSavedKey(sent.key);
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
      <div className="flex min-w-0 flex-col gap-5 pb-24 [&_:is(input,select,button,textarea)]:scroll-mb-28">
        {archived ? (
          <Alert tone="warning" title="La apariencia no se puede cambiar">
            No se puede cambiar su apariencia. Puedes ver cómo quedó en la vista previa.
          </Alert>
        ) : null}
        <p className="text-sm text-muted">
          La apariencia se aplica en cuanto guardas, sin publicar una versión nueva. Cambia solo lo
          que se ve; las preguntas y los resultados siguen su propia publicación. Esta pestaña se
          guarda aparte: no usa «Guardar borrador» ni «Publicar» de arriba.
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
              className="min-h-11 w-full accent-[var(--token-primary)]"
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
          <AccentField
            value={form.accent}
            onChange={(accent) => patch({ accent })}
            result={accentResult}
            backdrop={accentSurface}
            disabled={disabled}
          />
        </Card>

        <QuestionsSection
          stages={stages}
          form={form}
          onChange={(update) =>
            setForm((current) => ({ ...current, questions: update(current.questions) }))
          }
          disabled={disabled}
        />

        <Card className="flex min-w-0 flex-col gap-4">
          {/* Mientras se guarda no se puede teclear: lo escrito en ese momento no iría en el envío. */}
          <div className="flex min-w-0 flex-col gap-4" inert={busy || undefined}>
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
              Es ambientación del quiz, no reglas de puntaje: no nombres resultados ni des pistas.
              Un cuadro vacío quita la introducción a propósito.
            </p>
            <p className="text-xs text-muted tabular-nums">
              {form.introHtml.length} / 5000 caracteres de HTML
            </p>
          </div>
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

        <HistoryList
          history={history}
          disabled={disabled || dirty}
          pendingRev={revert.isPending ? revert.variables : undefined}
          onRevert={(entryRev) => {
            if (
              !window.confirm(
                '¿Volver al estado anterior a este cambio? Las lectoras lo verán en seguida.',
              )
            )
              return;
            setNotice(null);
            revert.mutate(entryRev);
          }}
        />

        {unfinished.length > 0 ? (
          <p className="text-sm text-warning" role="status">
            Hay preguntas con un fondo elegido pero sin archivo: súbelo o elige «Sin fondo» para
            poder guardar.
          </p>
        ) : null}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-token-lg border border-border bg-surface p-3 shadow-[0_-8px_20px_-12px_rgb(0_0_0/0.6)]">
          <Button
            disabled={disabled || !dirty || Boolean(missing) || unfinished.length > 0 || measuring}
            loading={save.isPending}
            onClick={() => {
              setNotice(null);
              save.mutate({ body: toAppearance(effective), key: formKey(effective), rev });
            }}
          >
            Guardar apariencia
          </Button>
          <span role="status" className={`text-sm ${dirty ? 'text-warning' : 'text-muted'}`}>
            {dirty ? 'Cambios sin guardar' : archived ? 'Solo lectura' : 'Todo guardado'}
          </span>
        </div>
      </div>

      <div className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <AppearancePreview form={form} title={title} position={position} stages={stages} />
      </div>
    </div>
  );
}

function HistoryList({
  history,
  disabled,
  pendingRev,
  onRevert,
}: {
  history: AppearanceHistoryEntry[];
  disabled: boolean;
  /** Revisión que se está revirtiendo ahora (solo su fila muestra el «Un momento…»). */
  pendingRev: number | undefined;
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
            {[...history]
              .sort((a, b) => b.rev - a.rev)
              .map((entry) => (
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
                    disabled={disabled || (pendingRev !== undefined && pendingRev !== entry.rev)}
                    loading={pendingRev === entry.rev}
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
