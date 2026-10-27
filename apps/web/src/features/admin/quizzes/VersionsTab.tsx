import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../shared/ui/controls';
import { Alert, Card, EmptyState } from '../../../shared/ui/layout';
import { keys, quizzesApi } from '../api';
import { SkeletonRows } from '../components/Skeleton';
import { useConfirm } from '../components/ConfirmDialog';
import { HelpTip } from '../components/HelpTip';
import { errorMessage } from '../errors';

/** Pestaña «Versiones»: cada publicación queda congelada; los lectores terminan con la versión con la que empezaron. */
export function VersionsTab({ quizId, archived }: { quizId: string; archived: boolean }) {
  const client = useQueryClient();
  const versions = useQuery({
    queryKey: keys.versions(quizId),
    queryFn: () => quizzesApi.versions(quizId),
  });
  const confirm = useConfirm();
  const archive = useMutation({
    mutationFn: () => quizzesApi.archive(quizId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <HelpTip>
        Cada vez que publicas se guarda una versión. Las lectoras que ya empezaron terminan con la
        que empezaron.
      </HelpTip>
      {versions.isPending ? <SkeletonRows rows={4} /> : null}
      {versions.isError ? <Alert>{errorMessage(versions.error)}</Alert> : null}
      {versions.data && versions.data.versions.length === 0 ? (
        <EmptyState title="Aún no hay versiones">Al publicar se guarda la primera.</EmptyState>
      ) : null}
      {versions.data && versions.data.versions.length > 0 ? (
        <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Versión
                </th>
                <th scope="col" className="px-4 py-3">
                  Publicada
                </th>
                <th scope="col" className="px-4 py-3">
                  Intentos de lectores
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.data.versions.map((version) => (
                <tr key={version.version} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">v{version.version}</td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(version.publishedAt).toLocaleString('es-CR')}
                  </td>
                  <td className="px-4 py-3">{version.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Archivar el quiz</h2>
        <p className="text-sm text-muted">
          Un quiz con intentos no se borra: se archiva. Deja de verse para los lectores, conserva
          sus resultados y libera su posición en la secuencia.
        </p>
        {archive.isError ? <Alert>{errorMessage(archive.error)}</Alert> : null}
        <Button
          variant="danger-outline"
          className="self-start"
          disabled={archived}
          loading={archive.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: '¿Archivar este quiz?',
              message:
                'Las lectoras dejarán de verlo y de poder jugarlo. Se conservan sus intentos, resultados y versiones publicadas, y se libera su posición en la secuencia.',
              confirmLabel: 'Archivar',
              tone: 'danger',
            });
            if (ok) archive.mutate();
          }}
        >
          {archived ? 'Ya está archivado' : 'Archivar quiz'}
        </Button>
      </Card>
    </div>
  );
}
