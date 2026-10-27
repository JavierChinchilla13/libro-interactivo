import { welcomeSettingsSchema, type WelcomeSettings } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { CheckField, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, PageHeader } from '../../../shared/ui/layout';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { keys, siteApi } from '../api';
import { SkeletonRows } from '../components/Skeleton';
import { RichTextEditor } from '../components/RichTextEditor';
import { errorMessage, fieldErrors } from '../errors';

/** Mensaje de bienvenida: el «pacto» con el lector, escrito por la autora. */
export function WelcomeSettingsPage() {
  const settings = useQuery({
    queryKey: keys.site,
    queryFn: siteApi.get,
    // El formulario toma el valor al abrirse: cada visita lo pide de nuevo y no queda copia vieja.
    staleTime: 0,
    gcTime: 0,
  });
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <SkeletonRows rows={4} />;
  return <WelcomeForm initial={settings.data.welcome} />;
}

function WelcomeForm({ initial }: { initial: WelcomeSettings }) {
  const client = useQueryClient();
  const [form, setForm] = useState<WelcomeSettings>(initial);
  const guard = useFormGuard(form, initial);
  const toast = useToast();
  const submitted = useRef(form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: siteApi.update,
    onSuccess: async (response) => {
      guard.markSaved(submitted.current);
      toast.success('Guardado');
      // Sin recargar: el formulario sigue siendo el mismo y conserva el aviso «Cambios guardados».
      client.setQueryData(keys.site, response);
    },
  });
  const set = (patch: Partial<WelcomeSettings>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const parsed = welcomeSettingsSchema.safeParse({
      ...form,
      title: form.title?.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    submitted.current = form;
    save.mutate({ welcome: parsed.data });
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <PageHeader
        title="Mensaje de bienvenida"
        subtitle="Lo ve el lector al iniciar sesión: el «pacto» con quien juega."
      />
      <div className="flex flex-col gap-5">
        <FormSection title="El mensaje" help="Qué dice y cuándo se muestra.">
          <CheckField
            label="Mostrar el mensaje de bienvenida"
            hint="Apagado, nadie lo ve."
            checked={form.enabled}
            onChange={(enabled) => set({ enabled })}
          />
          <SelectField
            label="¿Cuándo se muestra?"
            value={form.showMode}
            options={[
              { value: 'every_login', label: 'Cada vez que la persona inicia sesión' },
              { value: 'first_login', label: 'Solo la primera vez' },
            ]}
            onChange={(event) =>
              set({ showMode: event.target.value as WelcomeSettings['showMode'] })
            }
          />
          <TextField
            label="Título"
            maxLength={120}
            value={form.title ?? ''}
            error={errors['title']}
            onChange={(event) => set({ title: event.target.value })}
          />
          <RichTextEditor
            label="Mensaje"
            value={form.bodyHtml}
            onChange={(bodyHtml) => set({ bodyHtml })}
          />
          {errors['bodyHtml'] ? <Alert>{errors['bodyHtml']}</Alert> : null}
        </FormSection>
        <Card>
          <h2 className="mb-2 font-semibold">Así lo verá el lector</h2>
          {form.bodyHtml ? (
            <>
              {form.title ? <p className="section-title mb-2">{form.title}</p> : null}
              <SafeHtml html={form.bodyHtml} />
            </>
          ) : (
            <p className="text-sm text-muted">Escribe el mensaje para ver la vista previa.</p>
          )}
        </Card>
      </div>
      <SaveBar
        dirty={guard.dirty}
        dirtyLabel={undefined}
        saving={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onSave={() => submit()}
        onDiscard={() => {
          setForm(guard.saved);
          setErrors({});
        }}
        saveLabel="Guardar mensaje"
      />
    </form>
  );
}
