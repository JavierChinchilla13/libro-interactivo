import { welcomeSettingsSchema, type WelcomeSettings } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { Button, CheckField, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, Loading, PageHeader } from '../../../shared/ui/layout';
import { keys, siteApi } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';
import { errorMessage, fieldErrors } from '../errors';

/** Mensaje de bienvenida: el «pacto» con el lector, escrito por la autora. */
export function WelcomeSettingsPage() {
  const settings = useQuery({ queryKey: keys.site, queryFn: siteApi.get });
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <Loading />;
  return <WelcomeForm key={settings.dataUpdatedAt} initial={settings.data.welcome} />;
}

function WelcomeForm({ initial }: { initial: WelcomeSettings }) {
  const client = useQueryClient();
  const [form, setForm] = useState<WelcomeSettings>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: siteApi.update,
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries({ queryKey: keys.site });
    },
  });
  const set = (patch: Partial<WelcomeSettings>) => {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = welcomeSettingsSchema.safeParse({
      ...form,
      title: form.title?.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate({ welcome: parsed.data });
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <PageHeader
        title="Mensaje de bienvenida"
        subtitle="Lo ve el lector al iniciar sesión: el «pacto» con quien juega."
        actions={
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        }
      />
      {saved ? (
        <div className="mb-4">
          <Alert tone="success" title="Cambios guardados" />
        </div>
      ) : null}
      {save.isError ? (
        <div className="mb-4">
          <Alert>{errorMessage(save.error)}</Alert>
        </div>
      ) : null}
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
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
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Así lo verá el lector</h2>
          {form.bodyHtml ? (
            <>
              {form.title ? (
                <p className="mb-2 font-display text-xl font-bold">{form.title}</p>
              ) : null}
              <SafeHtml html={form.bodyHtml} />
            </>
          ) : (
            <p className="text-sm text-muted">Escribe el mensaje para ver la vista previa.</p>
          )}
        </Card>
      </div>
    </form>
  );
}
