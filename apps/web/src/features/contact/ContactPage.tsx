import { PageHeader } from '../../shared/ui/layout';
import { ContactForm } from '../home/ContactForm';
import { usePageMeta } from '../../shared/seo/usePageMeta';

/** Página de contacto: el mismo formulario de la landing, en su propia dirección. */
export function ContactPage() {
  usePageMeta({
    title: 'Contacto',
    description: 'Escríbele a la autora de Universo Memorias: tu mensaje le llega por correo.',
  });
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageHeader
        title="Contacto"
        subtitle="Escríbele a la autora: tu mensaje le llega por correo."
      />
      <ContactForm />
    </div>
  );
}
