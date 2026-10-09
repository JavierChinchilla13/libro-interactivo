import { contactSettingsSchema, type ContactSettings } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, CheckField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, Loading, PageHeader } from '../../../shared/ui/layout';
import { keys, siteApi } from '../api';
import { errorMessage, fieldErrors } from '../errors';

const DEFAULTS: ContactSettings = { storeMessages: true, retentionDays: 365 };

/** Ajustes del sitio (solo administradoras): adónde llegan los mensajes de contacto y cuánto se guardan. */
export function ContactSettingsPage() {
  const settings = useQuery({
    queryKey: keys.site,
    queryFn: siteApi.get,
    staleTime: 0,
    gcTime: 0,
  });
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <Loading />;
  return <ContactForm initial={settings.data.contact ?? DEFAULTS} />;
}

function ContactForm({ initial }: { initial: ContactSettings }) {
  const client = useQueryClient();
  const [email, setEmail] = useState(initial.recipientEmail ?? '');
  const [store, setStore] = useState(initial.storeMessages);
  const [days, setDays] = useState(String(initial.retentionDays));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: siteApi.update,
    onSuccess: (response) => {
      setSaved(true);
      client.setQueryData(keys.site, response);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = contactSettingsSchema.safeParse({
      ...(email.trim() ? { recipientEmail: email.trim() } : {}),
      storeMessages: store,
      retentionDays: Number(days),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate({ contact: parsed.data });
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader
        title="Ajustes del sitio"
        subtitle="Mensajes de contacto: adónde llegan y cuánto tiempo se conservan."
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
      <Card className="flex flex-col gap-4">
        <TextField
          label="Correo donde llegan los mensajes"
          type="email"
          value={email}
          hint="Si lo dejas vacío se usa el configurado por el desarrollador. No se muestra en el sitio."
          error={errors['recipientEmail']}
          onChange={(event) => {
            setSaved(false);
            setEmail(event.target.value);
          }}
        />
        <CheckField
          label="Guardar los mensajes en el panel"
          hint="Apagado, los mensajes solo llegan al correo y no quedan en «Mensajes de contacto»."
          checked={store}
          onChange={(value) => {
            setSaved(false);
            setStore(value);
          }}
        />
        <TextField
          label="Días que se guardan los mensajes"
          type="number"
          min={1}
          max={3650}
          value={days}
          hint="Pasado ese tiempo se borran solos (datos personales: conviene no guardarlos de más)."
          error={errors['retentionDays']}
          onChange={(event) => {
            setSaved(false);
            setDays(event.target.value);
          }}
        />
      </Card>
    </form>
  );
}
