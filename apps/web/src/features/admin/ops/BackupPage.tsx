import {
  BACKUP_ARCHIVE_PASSWORD_MIN,
  archivePasswordProblems,
  createBackupRequestSchema,
  isBackupStale,
  type BackupDownload,
  type BackupStatusResponse,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiClientError, saveDownloadedFile } from '../../../shared/api/client';
import { Badge, Alert, PageHeader } from '../../../shared/ui/layout';
import { Button, CheckField } from '../../../shared/ui/controls';
import { PasswordField } from '../../../shared/ui/PasswordField';
import { useSession } from '../../auth/session';
import { backupsApi, keys } from '../api';
import { DataList, type Column } from '../components/DataList';
import { FormSection } from '../components/FormSection';
import { SkeletonRows } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { errorMessage, fieldErrors } from '../errors';

interface BackupForm {
  password: string;
  archivePassword: string;
  archivePasswordConfirm: string;
  saved: boolean;
}

const EMPTY: BackupForm = {
  password: '',
  archivePassword: '',
  archivePasswordConfirm: '',
  saved: false,
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'long', timeStyle: 'short' });

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('es-CR', { maximumFractionDigits: 1 })} MB`;
}

function agoLabel(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
}

/** El estado arriba de todo: cuándo fue el último respaldo y si ya toca otro. */
function LastBackup({ status }: { status: BackupStatusResponse }) {
  if (status.lastAt === null || status.daysAgo === null) {
    return (
      <Alert tone="warning" title="Todavía no hay ningún respaldo descargado desde el panel">
        <p className="mt-1">
          El plan gratuito de la base de datos no guarda copias automáticas. Descarga uno ahora y
          repítelo cada semana.
        </p>
      </Alert>
    );
  }
  const text = `Último respaldo: ${agoLabel(status.daysAgo)} (${when(status.lastAt)}).`;
  return isBackupStale(status) ? (
    <Alert tone="warning" title={text}>
      <p className="mt-1">
        Pasaron {status.staleAfterDays} días o más: conviene descargar uno nuevo.
      </p>
    </Alert>
  ) : (
    <Alert tone="success" title={text}>
      <p className="mt-1">Al día. Conviene repetirlo cada semana.</p>
    </Alert>
  );
}

const columns: Column<BackupDownload>[] = [
  { id: 'at', header: 'Fecha', role: 'title', cell: (row) => when(row.at) },
  {
    id: 'ok',
    header: 'Estado',
    role: 'status',
    cell: (row) =>
      row.ok ? <Badge tone="success">Completo</Badge> : <Badge tone="warning">Se cortó</Badge>,
  },
  {
    id: 'by',
    header: 'Quién',
    role: 'meta',
    cell: (row) => row.by?.name ?? 'Una cuenta que ya no existe',
  },
  { id: 'bytes', header: 'Tamaño', role: 'meta', cell: (row) => sizeLabel(row.bytes) },
];

/**
 * Respaldo (solo administradores): descarga una copia cifrada de toda la base de datos. El archivo se cifra con una
 * contraseña que se elige aquí y que el servidor no guarda: sin ella, el respaldo no sirve.
 */
export function BackupPage() {
  const session = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: keys.backups, queryFn: backupsApi.status, staleTime: 0 });
  const [form, setForm] = useState<BackupForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wrongPassword, setWrongPassword] = useState(false);
  // Cada vez que cambia, las tres contraseñas vuelven a ocultarse (al enviar y al terminar la descarga).
  const [conceal, setConceal] = useState(0);
  const hideAll = () => setConceal((count) => count + 1);

  const download = useMutation({
    mutationFn: backupsApi.download,
    onSuccess: (file) => {
      saveDownloadedFile(file);
      setForm(EMPTY);
      setErrors({});
      toast.success('Respaldo descargado. Guárdalo en un lugar seguro.');
    },
    onError: (error) => {
      const wrong =
        error instanceof ApiClientError &&
        error.code === 'VALIDATION' &&
        /contraseña no es correcta/.test(error.message);
      setWrongPassword(wrong);
      if (wrong) setErrors({ password: 'La contraseña no es correcta.' });
    },
    onSettled: () => {
      hideAll();
      void client.invalidateQueries({ queryKey: keys.backups });
    },
  });

  const set = (patch: Partial<BackupForm>) => setForm((current) => ({ ...current, ...patch }));
  const busy = download.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    hideAll();
    const body = {
      password: form.password,
      archivePassword: form.archivePassword,
      archivePasswordConfirm: form.archivePasswordConfirm,
    };
    const parsed = createBackupRequestSchema.safeParse(body);
    const next: Record<string, string> = parsed.success ? {} : fieldErrors(parsed.error.issues);
    const personal = archivePasswordProblems(form.archivePassword, {
      name: session.data?.name,
      email: session.data?.email,
    });
    if (!next['archivePassword'] && personal.length > 0) next['archivePassword'] = personal[0]!;
    if (!form.saved) next['saved'] = 'Confirma que guardaste la contraseña del archivo.';
    setErrors(next);
    setWrongPassword(false);
    if (Object.keys(next).length > 0 || !parsed.success) return;
    download.mutate(parsed.data);
  }

  // Los errores de campo ya se muestran junto a cada campo; arriba solo lo demás (límite, tope, red…).
  const generalError =
    download.isError && !wrongPassword
      ? download.error instanceof ApiClientError && download.error.code === 'RATE_LIMITED'
        ? download.error.message
        : errorMessage(download.error)
      : null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Respaldo"
        subtitle="Descarga una copia cifrada de toda la base de datos del sitio."
      />

      {status.isError ? (
        <Alert title="No pudimos cargar el estado del respaldo">
          <p className="mt-1">{errorMessage(status.error)}</p>
        </Alert>
      ) : status.data ? (
        <LastBackup status={status.data} />
      ) : (
        <SkeletonRows rows={1} />
      )}

      <section aria-labelledby="backup-what" className="admin-card flex flex-col gap-2 text-sm">
        <h2 id="backup-what" className="text-base font-semibold">
          Qué es y cómo guardarlo
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-pretty">
          <li>
            Trae <strong>toda la base de datos</strong>: cuentas, progreso de los lectores, quizzes,
            textos y mensajes. Las imágenes y los videos no van (están en Cloudinary).
          </li>
          <li>
            <strong>Es un secreto</strong>: tiene correos y huellas de contraseñas. Por eso se
            descarga cifrado con una contraseña que eliges aquí.
          </li>
          <li>
            Guarda el archivo en una carpeta privada (no en una compartida, ni en un correo o chat)
            y la contraseña en tu gestor de contraseñas.{' '}
            <strong>Sin la contraseña el respaldo no se puede abrir</strong>: nadie puede
            recuperarla, ni el desarrollador.
          </li>
          <li>
            <strong>Bórralo a los 90 días</strong>: la política de privacidad promete que las copias
            no se guardan más tiempo. El sitio no puede borrar lo que ya está en tu computadora.
          </li>
          <li>Si algún día hay que restaurarlo, se lo das al desarrollador con la contraseña.</li>
        </ul>
      </section>

      <form onSubmit={submit} noValidate aria-busy={busy || undefined}>
        <FormSection
          title="Descargar un respaldo"
          help="Te llegará un correo de aviso cada vez que se descargue uno con tu cuenta."
        >
          <PasswordField
            label="Tu contraseña"
            autoComplete="current-password"
            required={false}
            concealKey={conceal}
            value={form.password}
            hint="La de tu cuenta, para confirmar que eres tú."
            error={errors['password']}
            disabled={busy}
            onChange={(value) => set({ password: value })}
          />
          {wrongPassword ? (
            <Alert tone="warning" title="¿Entras con Google?">
              <p className="mt-1">
                Si siempre ingresas con el botón de Google, tu cuenta todavía no tiene una
                contraseña propia. Crea una con{' '}
                <Link to="/olvide-mi-contrasena" className="underline">
                  ¿Olvidaste tu contraseña?
                </Link>
                : te llega un enlace por correo. Después vuelve aquí y escríbela.
              </p>
            </Alert>
          ) : null}
          <PasswordField
            label="Contraseña para el archivo"
            autoComplete="new-password"
            required={false}
            concealKey={conceal}
            value={form.archivePassword}
            hint={`Al menos ${BACKUP_ARCHIVE_PASSWORD_MIN} caracteres, distinta de la de tu cuenta. Se usa solo para cifrar este archivo; el sitio no la guarda.`}
            error={errors['archivePassword']}
            disabled={busy}
            onChange={(value) => set({ archivePassword: value })}
          />
          <PasswordField
            label="Repite la contraseña para el archivo"
            autoComplete="new-password"
            required={false}
            concealKey={conceal}
            value={form.archivePasswordConfirm}
            error={errors['archivePasswordConfirm']}
            disabled={busy}
            onChange={(value) => set({ archivePasswordConfirm: value })}
          />
          <div>
            <CheckField
              label="Ya guardé la contraseña del archivo en un lugar seguro"
              hint="Por ejemplo, en tu gestor de contraseñas. Sin ella el respaldo no sirve."
              checked={form.saved}
              disabled={busy}
              onChange={(value) => set({ saved: value })}
            />
            {errors['saved'] ? (
              <p role="alert" className="mt-1 text-xs text-danger">
                {errors['saved']}
              </p>
            ) : null}
          </div>
          {generalError ? <Alert>{generalError}</Alert> : null}
          <div>
            <Button type="submit" loading={busy}>
              Descargar respaldo
            </Button>
            {busy ? (
              <p role="status" className="mt-2 text-sm text-muted">
                Preparando el respaldo… puede tardar unos segundos.
              </p>
            ) : null}
          </div>
        </FormSection>
      </form>

      <section aria-labelledby="backup-history" className="flex flex-col gap-3">
        <h2 id="backup-history" className="admin-h2">
          Últimas descargas
        </h2>
        {status.data ? (
          status.data.downloads.length > 0 ? (
            <DataList
              label="Últimas descargas"
              rows={status.data.downloads}
              rowKey={(row) => `${row.at}-${row.by?.id ?? 'x'}`}
              columns={columns}
            />
          ) : (
            <p className="text-sm text-muted">Todavía no se descargó ninguno.</p>
          )
        ) : status.isError ? null : (
          <SkeletonRows rows={2} />
        )}
      </section>
    </div>
  );
}
