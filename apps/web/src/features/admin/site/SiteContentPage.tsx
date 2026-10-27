import {
  updateSiteSettingsRequestSchema,
  type ImageRefInput,
  type SiteSettingsResponse,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Button, TextField } from '../../../shared/ui/controls';
import { Alert, PageHeader } from '../../../shared/ui/layout';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { keys, siteApi } from '../api';
import { SkeletonRows } from '../components/Skeleton';
import { RichTextEditor } from '../components/RichTextEditor';
import { ImageField } from '../components/MediaFields';
import { errorMessage, fieldErrors } from '../errors';

interface FormState {
  headline: string;
  introHtml: string;
  background: ImageRefInput | undefined;
  headerImages: ImageRefInput[];
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
  background: settings.universe.background,
  headerImages: settings.universe.headerImages ?? [],
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
  if (!settings.data) return <SkeletonRows rows={4} />;
  return <SiteContentForm initial={fromSettings(settings.data)} />;
}

/** Rejilla inclinada del encabezado: ninguna imagen (no se muestra) o entre 5 y 9, en el orden en que se ven. */
function HeaderImagesField({
  value,
  error,
  onChange,
}: {
  value: ImageRefInput[];
  error: string | undefined;
  onChange: (value: ImageRefInput[]) => void;
}) {
  const move = (index: number, delta: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    if (item) next.splice(index + delta, 0, item);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">Imágenes del encabezado (5 a 9)</legend>
      <p className="text-xs text-muted">
        Se ven en una rejilla inclinada bajo la frase principal. Mientras no haya al menos 5, la
        rejilla no aparece en el sitio.
      </p>
      {value.map((image, index) => (
        <div
          key={image.publicId + index}
          className="flex flex-col gap-2 rounded-token border border-border p-3"
        >
          <ImageField
            label={`Imagen ${index + 1}`}
            purpose="misc"
            value={image}
            onChange={(next) =>
              onChange(
                next
                  ? value.map((it, i) => (i === index ? next : it))
                  : value.filter((_, i) => i !== index),
              )
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑<span className="sr-only"> Subir la imagen {index + 1}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={index === value.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓<span className="sr-only"> Bajar la imagen {index + 1}</span>
            </Button>
          </div>
        </div>
      ))}
      {value.length < 9 ? <NewHeaderImage onAdd={(image) => onChange([...value, image])} /> : null}
      {error ? <Alert>{error}</Alert> : null}
    </fieldset>
  );
}

/** Un campo de subida vacío: al elegir el archivo, la imagen se añade a la lista y el campo vuelve a quedar vacío. */
function NewHeaderImage({ onAdd }: { onAdd: (image: ImageRefInput) => void }) {
  const [key, setKey] = useState(0);
  return (
    <ImageField
      key={key}
      label="Añadir imagen"
      purpose="misc"
      value={undefined}
      onChange={(image) => {
        if (!image) return;
        onAdd(image);
        setKey((k) => k + 1);
      }}
    />
  );
}

function SiteContentForm({ initial }: { initial: FormState }) {
  const client = useQueryClient();
  const [form, setForm] = useState<FormState>(initial);
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
      await client.invalidateQueries({ queryKey: ['public'] });
    },
  });
  const set = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };
  const setLink = (index: number, patch: Partial<FormState['social'][number]>) =>
    set({ social: form.social.map((link, i) => (i === index ? { ...link, ...patch } : link)) });

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const parsed = updateSiteSettingsRequestSchema.safeParse({
      universe: {
        headline: form.headline.trim() || undefined,
        introHtml: form.introHtml,
        background: form.background,
        headerImages: form.headerImages,
      },
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
    submitted.current = form;
    save.mutate(parsed.data);
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <PageHeader
        title="Portada y autora"
        subtitle="Lo que ven los visitantes en la página principal y en el pie."
      />
      <div className="flex flex-col gap-5">
        <FormSection
          title="Presentación del universo"
          help="La frase y el texto que ven los visitantes al entrar."
        >
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
          <ImageField
            label="Fondo del sitio (pintura)"
            purpose="theme"
            value={form.background}
            onChange={(background) => set({ background })}
          />
          <HeaderImagesField
            value={form.headerImages}
            error={errors['universe.headerImages']}
            onChange={(headerImages) => set({ headerImages })}
          />
        </FormSection>

        <FormSection title="Conoce a la autora" help="Foto, biografía y contacto público.">
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
        </FormSection>

        <FormSection
          title="Redes sociales (pie de página y autora)"
          help="Enlaces que salen en el pie de página."
        >
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
        </FormSection>

        <FormSection
          title="Texto de «bloqueado»"
          help="Lo que ve una lectora ante algo que aún no puede abrir."
        >
          <TextField
            label="Mensaje de lo que aún está bloqueado"
            maxLength={200}
            hint="Si lo dejas vacío se muestra «Bloqueado: avanza en tu lectura»."
            value={form.lockMessage}
            error={errors['lock.message']}
            onChange={(event) => set({ lockMessage: event.target.value })}
          />
        </FormSection>
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
        saveLabel="Guardar cambios"
      />
    </form>
  );
}
