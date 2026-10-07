import {
  updateSiteSettingsRequestSchema,
  type ImageRefInput,
  type SiteSettingsResponse,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, TextField } from '../../../shared/ui/controls';
import { Alert, Card, Loading, PageHeader } from '../../../shared/ui/layout';
import { keys, siteApi } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';
import { ImageField } from '../components/MediaFields';
import { errorMessage, fieldErrors } from '../errors';

interface FormState {
  headline: string;
  introHtml: string;
  name: string;
  bioHtml: string;
  photo: ImageRefInput | undefined;
  publicEmail: string;
  social: { label: string; url: string }[];
  lockMessage: string;
}

const fromSettings = (settings: SiteSettingsResponse): FormState => ({
  headline: settings.universe.headline ?? '',
  introHtml: settings.universe.introHtml,
  name: settings.author.name ?? '',
  bioHtml: settings.author.bioHtml,
  photo: settings.author.photo,
  publicEmail: settings.author.publicEmail ?? '',
  social: settings.social.map((link) => ({ ...link })),
  lockMessage: settings.lock.message ?? '',
});

/**
 * Portada y autora: frase principal, «¿Qué es el universo?», la autora, las redes
 * del pie y el texto de «Bloqueado». El correo que muestra la autora NO es donde recibe los mensajes de contacto.
 */
export function SiteContentPage() {
  const settings = useQuery({
    queryKey: keys.site,
    queryFn: siteApi.get,
    // El formulario toma el valor al abrirse: cada visita lo pide de nuevo y no queda copia vieja.
    staleTime: 0,
    gcTime: 0,
  });
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <Loading />;
  return <SiteContentForm initial={fromSettings(settings.data)} />;
}

function SiteContentForm({ initial }: { initial: FormState }) {
  const client = useQueryClient();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: siteApi.update,
    onSuccess: async (response) => {
      setSaved(true);
      // Sin recargar: el formulario sigue siendo el mismo y conserva el aviso «Cambios guardados».
      client.setQueryData(keys.site, response);
      await client.invalidateQueries({ queryKey: ['public'] });
    },
  });
  const set = (patch: Partial<FormState>) => {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  };
  const setLink = (index: number, patch: Partial<FormState['social'][number]>) =>
    set({ social: form.social.map((link, i) => (i === index ? { ...link, ...patch } : link)) });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = updateSiteSettingsRequestSchema.safeParse({
      universe: { headline: form.headline.trim() || undefined, introHtml: form.introHtml },
      author: {
        name: form.name.trim() || undefined,
        bioHtml: form.bioHtml,
        photo: form.photo,
        publicEmail: form.publicEmail.trim() || undefined,
      },
      social: form.social,
      lock: { message: form.lockMessage.trim() || undefined },
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <PageHeader
        title="Portada y autora"
        subtitle="Lo que ven los visitantes en la página principal y en el pie."
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
          <h2 className="font-semibold">Presentación del universo</h2>
          <TextField
            label="Frase principal del sitio"
            maxLength={200}
            value={form.headline}
            error={errors['universe.headline']}
            onChange={(event) => set({ headline: event.target.value })}
          />
          <RichTextEditor
            label="¿Qué es el universo Memorias?"
            value={form.introHtml}
            onChange={(introHtml) => set({ introHtml })}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Conoce a la autora</h2>
          <TextField
            label="Nombre"
            maxLength={120}
            value={form.name}
            error={errors['author.name']}
            onChange={(event) => set({ name: event.target.value })}
          />
          <ImageField
            label="Foto"
            purpose="misc"
            value={form.photo}
            onChange={(photo) => set({ photo })}
          />
          <RichTextEditor
            label="Biografía"
            value={form.bioHtml}
            onChange={(bioHtml) => set({ bioHtml })}
          />
          <TextField
            label="Correo que se muestra al público"
            type="email"
            hint="Opcional. Los mensajes del formulario llegan al correo de recepción, que es otro y no se publica."
            value={form.publicEmail}
            error={errors['author.publicEmail']}
            onChange={(event) => set({ publicEmail: event.target.value })}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Redes sociales (pie de página y autora)</h2>
          {form.social.map((link, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <TextField
                wrapperClassName="w-40"
                label={`Red ${index + 1}`}
                maxLength={40}
                value={link.label}
                error={errors[`social.${index}.label`]}
                onChange={(event) => setLink(index, { label: event.target.value })}
              />
              <TextField
                wrapperClassName="min-w-48 flex-1"
                label={`Enlace ${index + 1}`}
                type="url"
                placeholder="https://"
                value={link.url}
                error={errors[`social.${index}.url`]}
                onChange={(event) => setLink(index, { url: event.target.value })}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => set({ social: form.social.filter((_, i) => i !== index) })}
              >
                Quitar<span className="sr-only"> la red {index + 1}</span>
              </Button>
            </div>
          ))}
          {errors['social'] ? <Alert>{errors['social']}</Alert> : null}
          {form.social.length < 8 ? (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => set({ social: [...form.social, { label: '', url: '' }] })}
            >
              + Agregar red
            </Button>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Texto de «bloqueado»</h2>
          <TextField
            label="Lo que ve el visitante en lo que aún no puede abrir"
            maxLength={200}
            hint="Si lo dejas vacío se muestra «Bloqueado: avanza en tu lectura»."
            value={form.lockMessage}
            error={errors['lock.message']}
            onChange={(event) => set({ lockMessage: event.target.value })}
          />
        </Card>
      </div>
    </form>
  );
}
