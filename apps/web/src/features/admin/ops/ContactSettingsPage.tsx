import { contactSettingsSchema, type ContactSettings } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { CheckField, TextField } from '../../../shared/ui/controls';
import { Alert, Loading, PageHeader } from '../../../shared/ui/layout';
import { keys, siteApi } from '../api';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { errorMessage, fieldErrors } from '../errors';

const DEFAULTS: ContactSettings = { storeMessages: true, retentionDays: 365 };

interface ContactForm {
  email: string;
  store: boolean;
  days: string;
}

/** Contacto del sitio (solo administradoras): adónde llegan los mensajes y cuánto se guardan. */
export function ContactSettingsPage() {
  const settings = useQuery({
    queryKey: keys.site,
    queryFn: siteApi.get,
    staleTime: 0,
    gcTime: 0,
  });
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <Loading />;
  return <ContactFormView initial={settings.data.contact ?? DEFAULTS} />;
}

function ContactFormView({ initial }: { initial: ContactSettings }) {
  const client = useQueryClient();
  const toast = useToast();
  const start: ContactForm = {
    email: initial.recipientEmail ?? '',
    store: initial.storeMessages,
    days: String(initial.retentionDays),
  };
  const [form, setForm] = useState<ContactForm>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const guard = useFormGuard(form, start);
  const submitted = useRef(form);
  const save = useMutation({
    mutationFn: siteApi.update,
    onSuccess: (response) => {
      guard.markSaved(submitted.current);
      toast.success('Guardado');
      client.setQueryData(keys.site, response);
    },
  });
  const set = (patch: Partial<ContactForm>) => setForm((current) => ({ ...current, ...patch }));

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const parsed = contactSettingsSchema.safeParse({
      ...(form.email.trim() ? { recipientEmail: form.email.trim() } : {}),
      storeMessages: form.store,
      retentionDays: Number(form.days),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    submitted.current = form;
    save.mutate({ contact: parsed.data });
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader
        title="Contacto del sitio"
        subtitle="Mensajes de contacto: adónde llegan y cuánto tiempo se conservan."
      />
      <FormSection
        title="Cómo llegan los mensajes"
        help="A qué correo llegan y cuánto tiempo se guardan en el panel."
      >
        <TextField
          label="Correo donde llegan los mensajes"
          type="email"
          value={form.email}
          hint="Si lo dejas vacío se usa el configurado por el desarrollador. No se muestra en el sitio."
          error={errors['recipientEmail']}
          onChange={(event) => set({ email: event.target.value })}
        />
        <CheckField
          label="Guardar los mensajes aquí en el panel"
          hint="Apagado, los mensajes solo llegan al correo y no quedan en «Mensajes»."
          checked={form.store}
          onChange={(value) => set({ store: value })}
        />
        <TextField
          label="Días que se guardan los mensajes"
          type="number"
          min={1}
          max={3650}
          value={form.days}
          hint="Pasado ese tiempo se borran solos (datos personales: conviene no guardarlos de más)."
          error={errors['retentionDays']}
          onChange={(event) => set({ days: event.target.value })}
        />
      </FormSection>
      <SaveBar
        dirty={guard.dirty}
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
