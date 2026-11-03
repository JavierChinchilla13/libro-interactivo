import type { ReactNode } from 'react';
import { FactList, type Fact } from './FactList';
import { Placeholder } from './LegalPage';

const link = 'underline underline-offset-4 decoration-1 hover:text-text';

/** «Dónde y su política»: el país o la región del proveedor y el enlace a su política de privacidad. */
function where(country: string, name: string, href: string): ReactNode {
  return (
    <>
      {country}.{' '}
      <a className={link} href={href} rel="noopener noreferrer">
        Política de privacidad de {name}
      </a>
    </>
  );
}

/**
 * Quién más interviene cuando alguien usa el sitio. La lista sale de lo que el sitio usa de verdad; cada enlace se
 * comprobó que abre la política oficial del proveedor (3-nov-2026). Si cambia un proveedor o su región, se cambia
 * aquí y sube `LEGAL_VERSION`.
 */
const THIRD_PARTIES: ReadonlyArray<Fact> = [
  {
    name: 'Render',
    rows: [
      ['Para qué', 'Alojamiento del sitio web y del servidor.'],
      ['Qué recibe', 'Dirección IP y registros técnicos de cada visita.'],
      ['Dónde y su política', where('Estados Unidos', 'Render', 'https://render.com/privacy')],
    ],
  },
  {
    name: 'Cloudflare',
    rows: [
      [
        'Para qué',
        'Red de entrega que usa Render para servir el sitio; no la administramos nosotros.',
      ],
      [
        'Qué recibe',
        'Todas las visitas pasan por ahí: dirección IP, navegador y las páginas que se piden.',
      ],
      [
        'Dónde y su política',
        where(
          'Estados Unidos, con una red en todo el mundo',
          'Cloudflare',
          'https://www.cloudflare.com/privacypolicy/',
        ),
      ],
    ],
  },
  {
    name: 'MongoDB Atlas',
    rows: [
      ['Para qué', 'Base de datos.'],
      ['Qué recibe', 'Cuentas, progreso, resultados y mensajes de contacto.'],
      [
        'Dónde y su política',
        where(
          'Estados Unidos (AWS, N. Virginia)',
          'MongoDB',
          'https://www.mongodb.com/legal/privacy/privacy-policy',
        ),
      ],
    ],
  },
  {
    name: 'Cloudinary',
    rows: [
      ['Para qué', 'Alojamiento de las imágenes y los videos del sitio.'],
      [
        'Qué recibe',
        'Tu navegador pide las imágenes y los videos directamente a Cloudinary, así que recibe tu dirección IP y datos técnicos de la petición. No recibe datos de tu cuenta.',
      ],
      [
        'Dónde y su política',
        where('Estados Unidos', 'Cloudinary', 'https://cloudinary.com/privacy'),
      ],
    ],
  },
  {
    name: 'Resend',
    rows: [
      [
        'Para qué',
        'Envío de correos del servicio (recuperar contraseña, avisos de seguridad, mensajes de contacto).',
      ],
      ['Qué recibe', 'La dirección de correo y el texto del mensaje.'],
      [
        'Dónde y su política',
        where('Estados Unidos', 'Resend', 'https://resend.com/legal/privacy-policy'),
      ],
    ],
  },
  {
    name: 'Google Identity',
    rows: [
      ['Para qué', 'Solo si eliges «Continuar con Google».'],
      [
        'Qué recibe',
        'Te pide iniciar sesión en Google y nos envía tu correo, tu nombre y si el correo está verificado. Su botón carga un script de Google y puede usar cookies propias.',
      ],
      [
        'Dónde y su política',
        where('Estados Unidos', 'Google', 'https://policies.google.com/privacy'),
      ],
    ],
  },
  {
    name: 'Namecheap',
    rows: [
      ['Para qué', 'Dominio y reenvío del correo de contacto.'],
      ['Qué recibe', 'Los mensajes enviados a la dirección de contacto pasan por su reenvío.'],
      [
        'Dónde y su política',
        where(
          'Estados Unidos',
          'Namecheap',
          'https://www.namecheap.com/legal/general/privacy-policy/',
        ),
      ],
    ],
  },
  {
    name: 'Almacenamiento de documentos privados',
    rows: [
      ['Para qué', 'Archivos de los capítulos extra.'],
      ['Qué recibe', 'Los archivos que sube el equipo; no recibe datos de las lectoras.'],
      [
        'Dónde y su política',
        <Placeholder key="almacenamiento">
          proveedor, país y enlace a su política, si se usan capítulos extra con archivo
        </Placeholder>,
      ],
    ],
  },
];

/** La lista de proveedores de la política de privacidad. */
export function ThirdPartyList() {
  return <FactList items={THIRD_PARTIES} />;
}
