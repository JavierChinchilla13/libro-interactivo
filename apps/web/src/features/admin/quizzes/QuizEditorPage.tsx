import type { QuizDetailResponse, QuizValidationResponse } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../../shared/ui/controls';
import { Alert, Loading, PageHeader, TabPanel, Tabs } from '../../../shared/ui/layout';
import { keys, quizzesApi } from '../api';
import { useCrumbLeaf } from '../components/Breadcrumbs';
import { HelpTip } from '../components/HelpTip';
import { SaveBar } from '../components/SaveBar';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useUnsavedChanges } from '../components/useUnsavedChanges';
import { errorMessage } from '../errors';
import type { Draft } from './draft';
import { AppearanceTab } from './AppearanceTab';
import { GeneralTab } from './GeneralTab';
import { PreviewPanel } from './PreviewPanel';
import { ResultsTab } from './ResultsTab';
import { StagesTab } from './StagesTab';
import { VersionsTab } from './VersionsTab';

type Tab = 'general' | 'etapas' | 'resultados' | 'apariencia' | 'versiones';

/** Nombre de cada pestaña y la frase que dice qué se hace en ella. */
const TABS: readonly { id: Tab; label: string; help: string }[] = [
  { id: 'general', label: 'Datos', help: 'Nombre, reglas y posición del quiz.' },
  {
    id: 'etapas',
    label: 'Preguntas',
    help: 'Etapas, preguntas y a qué resultado suma cada respuesta.',
  },
  { id: 'resultados', label: 'Resultados', help: 'Qué descubre la lectora al terminar.' },
  {
    id: 'apariencia',
    label: 'Apariencia',
    help: 'Fondo, color y portada; se aplica sin publicar.',
  },
  {
    id: 'versiones',
    label: 'Versiones',
    help: 'Historial de lo publicado y cuántas lectoras lo usaron.',
  },
];

const snapshot = (draft: Draft) => JSON.stringify(draft);

/** Carga el quiz y entrega el editor con su borrador como valor inicial. */
export function QuizEditorPage() {
  const { quizId = '' } = useParams();
  const detail = useQuery({ queryKey: keys.quiz(quizId), queryFn: () => quizzesApi.get(quizId) });
  if (!detail.data && detail.isError) return <Alert>{errorMessage(detail.error)}</Alert>;
  if (!detail.data) return <Loading />;
  return <QuizEditor key={quizId} quizId={quizId} quiz={detail.data} />;
}

/** Una sola etiqueta con el estado del quiz: «Borrador», «Publicado · v2» o «Publicado · v2 con cambios sin publicar». */
function QuizState({ quiz }: { quiz: QuizDetailResponse }) {
  if (quiz.status === 'archived') return <StatusBadge status="archived" />;
  if (quiz.status === 'draft' || quiz.currentVersion < 1) return <StatusBadge status="draft" />;
  const label = `Publicado · v${quiz.currentVersion}`;
  return quiz.hasUnpublishedChanges ? (
    <StatusBadge status="changes" label={`${label} con cambios sin publicar`} />
  ) : (
    <StatusBadge status="published" label={label} />
  );
}

/** Editor de quizzes: guardar el borrador, revisarlo, probarlo y publicarlo. */
function QuizEditor({ quizId, quiz }: { quizId: string; quiz: QuizDetailResponse }) {
  const client = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(quiz.draft);
  const [saved, setSaved] = useState(() => snapshot(quiz.draft));
  const [tab, setTab] = useState<Tab>('general');
  const [appearanceOpened, setAppearanceOpened] = useState(false);
  const openTab = (next: Tab) => {
    if (next === 'apariencia') setAppearanceOpened(true);
    setTab(next);
  };
  // La revisión recuerda sobre qué borrador se hizo: si después se edita algo, deja de valer.
  const [reviewed, setReviewed] = useState<{ report: QuizValidationResponse; at: string } | null>(
    null,
  );
  // Lo último que el servidor guardó (la revisión se hace sobre eso, ya normalizado por el servidor).
  const savedRef = useRef(snapshot(quiz.draft));
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const dirty = snapshot(draft) !== saved;
  useCrumbLeaf(draft.title.trim() || 'Quiz');
  // Avisa antes de salir con cambios sin guardar (cerrar la pestaña o ir a otra pantalla).
  useUnsavedChanges(dirty);

  function adopt(result: QuizDetailResponse) {
    client.setQueryData(keys.quiz(quizId), result);
    void client.invalidateQueries({ queryKey: ['admin', 'quizzes', 'list'] });
    setDraft(result.draft);
    setSaved(snapshot(result.draft));
    savedRef.current = snapshot(result.draft);
  }

  const save = useMutation({
    mutationFn: (value: Draft) => quizzesApi.saveDraft(quizId, value),
    onSuccess: adopt,
  });
  const check = useMutation({
    mutationFn: () => quizzesApi.validate(quizId),
    onSuccess: (result) => setReviewed({ report: result, at: savedRef.current }),
  });
  const publish = useMutation({
    mutationFn: () => quizzesApi.publish(quizId),
    onSuccess: async (result) => {
      toast.success(`Publicado: ya es la versión ${result.version} y las lectoras la ven.`);
      setReviewed({
        report: { valid: true, errors: [], warnings: result.warnings },
        at: savedRef.current,
      });
      await client.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
    },
  });

  /** Guarda si hay cambios; todas las acciones parten de lo guardado en el servidor. */
  async function ensureSaved(): Promise<boolean> {
    if (!dirty) return true;
    try {
      await save.mutateAsync(draft);
      return true;
    } catch {
      return false;
    }
  }

  async function onSave() {
    setNotice(null);
    if (await ensureSaved()) toast.success('Borrador guardado');
  }

  async function onValidate() {
    setNotice(null);
    if (await ensureSaved()) await check.mutateAsync().catch(() => undefined);
  }

  async function onPublish() {
    setNotice(null);
    if (!(await ensureSaved())) return;
    const result = await check.mutateAsync().catch(() => null);
    if (!result?.valid) return;
    await publish.mutateAsync().catch(() => undefined);
  }

  async function onPreview() {
    setNotice(null);
    if (quiz.currentVersion < 1) {
      setNotice({
        tone: 'warning',
        text: 'Todavía no hay nada publicado que probar. Publica el quiz una vez y vuelve.',
      });
      return;
    }
    if (dirty) {
      setNotice({
        tone: 'warning',
        text: 'La vista previa juega la versión publicada, no los cambios del borrador sin publicar.',
      });
    }
    setPreviewing(true);
  }

  const archived = quiz.status === 'archived';
  const busy = save.isPending || check.isPending || publish.isPending;
  const error = save.error ?? check.error ?? publish.error;
  // Tras revisar, si hay cosas por arreglar y nada cambió desde entonces, Publicar se apaga y dice por qué.
  const stale = reviewed !== null && reviewed.at !== snapshot(draft);
  const report = reviewed?.report ?? null;
  const blockedBy = report && !report.valid && !stale ? report.errors.length : 0;
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <>
      <PageHeader
        title={draft.title || 'Quiz'}
        subtitle="Lo que editas aquí es un borrador: las lectoras no lo ven hasta que lo publiques."
      />
      <div className="admin-status-line">
        <QuizState quiz={quiz} />
        <HelpTip title="¿Qué hace cada botón?">
          <ul className="list-disc pl-5">
            <li>
              <strong>Guardar borrador</strong>: guarda lo que escribiste; las lectoras no ven nada
              todavía.
            </li>
            <li>
              <strong>Revisar</strong>: comprueba que no falte nada antes de publicar.
            </li>
            <li>
              <strong>Vista previa</strong>: pruébalo como lectora; no cuenta en estadísticas.
            </li>
            <li>
              <strong>Publicar</strong>: crea una versión nueva y las lectoras la ven.
            </li>
          </ul>
        </HelpTip>
      </div>

      {archived ? (
        <div className="mb-4">
          <Alert tone="warning" title="Este quiz está archivado">
            No se puede editar ni publicar. Sus resultados se conservan.
          </Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      {report && stale ? (
        <div className="mb-4">
          <Alert tone="warning" title="Vuelve a revisar">
            Cambiaste algo después de la última revisión: pulsa «Revisar» para comprobarlo de nuevo.
          </Alert>
        </div>
      ) : null}
      {report && !stale ? <ValidationReport report={report} /> : null}
      {previewing ? <PreviewPanel quizId={quizId} onClose={() => setPreviewing(false)} /> : null}

      <Tabs
        label="Secciones del quiz"
        active={tab}
        onChange={openTab}
        tabs={TABS.map(({ id, label }) => ({ id, label }))}
      />
      {activeTab ? <p className="admin-tab-help">{activeTab.help}</p> : null}
      <fieldset disabled={archived} className="contents">
        <TabPanel id="general" active={tab}>
          <GeneralTab
            quiz={quiz}
            draft={draft}
            onChange={setDraft}
            onOpenAppearance={() => openTab('apariencia')}
          />
        </TabPanel>
        <TabPanel id="etapas" active={tab}>
          <StagesTab draft={draft} onChange={setDraft} />
        </TabPanel>
        <TabPanel id="resultados" active={tab}>
          <ResultsTab draft={draft} bookId={quiz.bookId} onChange={setDraft} />
        </TabPanel>
      </fieldset>
      {/* Una vez abierta se queda montada (oculta): cambiar de pestaña no debe tirar lo que está sin guardar. */}
      {appearanceOpened ? (
        <div
          role="tabpanel"
          id="panel-apariencia"
          aria-labelledby="tab-apariencia"
          hidden={tab !== 'apariencia'}
        >
          <AppearanceTab quiz={quiz} archived={archived} title={draft.title} />
        </div>
      ) : null}
      <TabPanel id="versiones" active={tab}>
        <VersionsTab quizId={quizId} archived={archived} />
      </TabPanel>

      {tab === 'apariencia' || tab === 'versiones' ? null : (
        <SaveBar
          dirty={dirty && !archived}
          saving={save.isPending}
          error={error ? errorMessage(error) : null}
          onSave={() => void onSave()}
          saveLabel="Guardar borrador"
          saveVariant="secondary"
          savedLabel={archived ? 'Solo lectura' : 'Todo guardado'}
          moreItems={[
            {
              label: check.isPending ? 'Revisando…' : 'Revisar',
              disabled: busy || archived,
              title: 'Comprueba que no falte nada antes de publicar',
              onClick: () => void onValidate(),
            },
            {
              label: 'Vista previa',
              disabled: busy || archived,
              title: 'Pruébalo como lectora; no cuenta en estadísticas',
              onClick: () => void onPreview(),
            },
            {
              label: save.isPending ? 'Guardando…' : 'Guardar borrador',
              disabled: !dirty || busy || archived,
              onClick: () => void onSave(),
            },
          ]}
          after={
            <Button
              disabled={busy || archived || blockedBy > 0}
              loading={publish.isPending}
              onClick={() => void onPublish()}
            >
              Publicar
            </Button>
          }
          disabledReason={
            blockedBy > 0
              ? `Hay ${blockedBy} ${blockedBy === 1 ? 'cosa' : 'cosas'} por arreglar antes de publicar (mira el aviso de arriba).`
              : undefined
          }
        >
          <Button
            variant="secondary"
            disabled={busy || archived}
            loading={check.isPending}
            title="Comprueba que no falte nada antes de publicar"
            onClick={() => void onValidate()}
          >
            Revisar
          </Button>
          <Button
            variant="secondary"
            disabled={busy || archived}
            title="Pruébalo como lectora; no cuenta en estadísticas"
            onClick={() => void onPreview()}
          >
            Vista previa
          </Button>
        </SaveBar>
      )}
    </>
  );
}

function ValidationReport({ report }: { report: QuizValidationResponse }) {
  return (
    <div className="mb-4 flex flex-col gap-3" aria-label="Resultado de la revisión">
      {report.valid && report.errors.length === 0 ? (
        <Alert tone="success" title="El quiz está completo y se puede publicar" />
      ) : (
        <Alert
          title={`Hay ${report.errors.length} ${report.errors.length === 1 ? 'cosa' : 'cosas'} por arreglar antes de publicar`}
        >
          <ul className="mt-1 list-disc pl-5">
            {report.errors.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {report.warnings.length > 0 ? (
        <Alert
          tone="warning"
          title={`${report.warnings.length} ${report.warnings.length === 1 ? 'sugerencia' : 'sugerencias'} (no impiden publicar)`}
        >
          <ul className="mt-1 list-disc pl-5">
            {report.warnings.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
