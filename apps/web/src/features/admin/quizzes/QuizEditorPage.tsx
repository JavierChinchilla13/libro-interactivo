import type { QuizDetailResponse, QuizValidationResponse } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../../shared/ui/controls';
import { Alert, Badge, Loading, PageHeader, TabPanel, Tabs } from '../../../shared/ui/layout';
import { keys, quizzesApi } from '../api';
import { errorMessage } from '../errors';
import type { Draft } from './draft';
import { GeneralTab } from './GeneralTab';
import { PreviewPanel } from './PreviewPanel';
import { ResultsTab } from './ResultsTab';
import { StagesTab } from './StagesTab';
import { VersionsTab } from './VersionsTab';

type Tab = 'general' | 'etapas' | 'resultados' | 'versiones';

const snapshot = (draft: Draft) => JSON.stringify(draft);

/** Carga el quiz y entrega el editor con su borrador como valor inicial. */
export function QuizEditorPage() {
  const { quizId = '' } = useParams();
  const detail = useQuery({ queryKey: keys.quiz(quizId), queryFn: () => quizzesApi.get(quizId) });
  if (detail.isError) return <Alert>{errorMessage(detail.error)}</Alert>;
  if (!detail.data) return <Loading />;
  return <QuizEditor key={quizId} quizId={quizId} quiz={detail.data} />;
}

/** Editor de quizzes: guardar borrador, vista previa, validar y publicar. */
function QuizEditor({ quizId, quiz }: { quizId: string; quiz: QuizDetailResponse }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft>(quiz.draft);
  const [saved, setSaved] = useState(() => snapshot(quiz.draft));
  const [tab, setTab] = useState<Tab>('general');
  const [report, setReport] = useState<QuizValidationResponse | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const dirty = snapshot(draft) !== saved;

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function adopt(result: QuizDetailResponse) {
    client.setQueryData(keys.quiz(quizId), result);
    void client.invalidateQueries({ queryKey: ['admin', 'quizzes', 'list'] });
    setDraft(result.draft);
    setSaved(snapshot(result.draft));
  }

  const save = useMutation({
    mutationFn: (value: Draft) => quizzesApi.saveDraft(quizId, value),
    onSuccess: adopt,
  });
  const check = useMutation({
    mutationFn: () => quizzesApi.validate(quizId),
    onSuccess: setReport,
  });
  const publish = useMutation({
    mutationFn: () => quizzesApi.publish(quizId),
    onSuccess: async (result) => {
      setNotice({ tone: 'success', text: `Publicada como versión ${result.version}.` });
      setReport({ valid: true, errors: [], warnings: result.warnings });
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
    if (await ensureSaved()) setNotice({ tone: 'success', text: 'Borrador guardado.' });
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
      setNotice({ tone: 'warning', text: 'Publica el quiz al menos una vez para poder probarlo.' });
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

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/admin/quizzes" className="underline">
          ← Quizzes
        </Link>
      </p>
      <PageHeader
        title={draft.title || 'Quiz'}
        subtitle={
          quiz.currentVersion > 0 ? `Última publicada: v${quiz.currentVersion}` : 'Nunca publicado'
        }
        actions={
          <>
            <Button
              variant="secondary"
              disabled={busy || archived || !dirty}
              loading={save.isPending}
              onClick={() => void onSave()}
            >
              Guardar borrador
            </Button>
            <Button
              variant="secondary"
              disabled={busy || archived}
              onClick={() => void onPreview()}
            >
              Vista previa
            </Button>
            <Button
              variant="secondary"
              disabled={busy || archived}
              loading={check.isPending}
              onClick={() => void onValidate()}
            >
              Validar
            </Button>
            <Button
              disabled={busy || archived}
              loading={publish.isPending}
              onClick={() => void onPublish()}
            >
              Publicar
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={archived ? 'warning' : quiz.status === 'published' ? 'success' : 'neutral'}>
          {archived ? 'Archivado' : quiz.status === 'published' ? 'Publicado' : 'Borrador'}
        </Badge>
        {dirty ? <Badge tone="warning">Cambios sin guardar</Badge> : null}
        {!dirty && quiz.hasUnpublishedChanges && quiz.currentVersion > 0 ? (
          <Badge tone="warning">Cambios sin publicar</Badge>
        ) : null}
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
      {error ? (
        <div className="mb-4">
          <Alert>{errorMessage(error)}</Alert>
        </div>
      ) : null}
      {report ? <ValidationReport report={report} /> : null}
      {previewing ? <PreviewPanel quizId={quizId} onClose={() => setPreviewing(false)} /> : null}

      <Tabs
        label="Secciones del quiz"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'etapas', label: 'Etapas y preguntas' },
          { id: 'resultados', label: 'Resultados' },
          { id: 'versiones', label: 'Versiones' },
        ]}
      />
      <fieldset disabled={archived} className="contents">
        <TabPanel id="general" active={tab}>
          <GeneralTab quiz={quiz} draft={draft} onChange={setDraft} />
        </TabPanel>
        <TabPanel id="etapas" active={tab}>
          <StagesTab draft={draft} onChange={setDraft} />
        </TabPanel>
        <TabPanel id="resultados" active={tab}>
          <ResultsTab draft={draft} onChange={setDraft} />
        </TabPanel>
      </fieldset>
      <TabPanel id="versiones" active={tab}>
        <VersionsTab quizId={quizId} archived={archived} />
      </TabPanel>
    </>
  );
}

function ValidationReport({ report }: { report: QuizValidationResponse }) {
  return (
    <div className="mb-4 flex flex-col gap-3" aria-label="Resultado de la validación">
      {report.valid && report.errors.length === 0 ? (
        <Alert tone="success" title="El quiz está completo y se puede publicar" />
      ) : (
        <Alert
          title={`${report.errors.length} ${report.errors.length === 1 ? 'error' : 'errores'} (impiden publicar)`}
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
          title={`${report.warnings.length} ${report.warnings.length === 1 ? 'aviso' : 'avisos'}`}
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
