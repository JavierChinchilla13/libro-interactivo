import { FactList, type Fact } from './FactList';

/**
 * Quién más interviene cuando alguien usa el sitio. La lista sale de lo que el sitio usa de verdad. El país o la región
 * de cada uno y el enlace a su política quedan como dato pendiente (un solo aviso arriba de la lista): no se supone
 * ninguno.
 */
const PENDING = 'Pendiente';

const THIRD_PARTIES: ReadonlyArray<Fact> = [
  {
    name: 'Cloudflare',
    rows: [
      ['Para qué', 'Dirección del sitio (DNS) y protección delante de él.'],
      [
        'Qué recibe',
        'Todas las visitas pasan por ahí: dirección IP, navegador y las páginas que se piden.',
      ],
      ['Dónde y su política', PENDING],
    ],
  },
  {
    name: 'Render',
    rows: [
      ['Para qué', 'Alojamiento del sitio web y del servidor.'],
      ['Qué recibe', 'Dirección IP y registros técnicos de cada visita.'],
      ['Dónde y su política', PENDING],
    ],
  },
  {
    name: 'MongoDB Atlas',
    rows: [
      ['Para qué', 'Base de datos.'],
      ['Qué recibe', 'Cuentas, progreso, resultados y mensajes de contacto.'],
      ['Dónde y su política', PENDING],
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
      ['Dónde y su política', PENDING],
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
      ['Dónde y su política', PENDING],
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
      ['Dónde y su política', PENDING],
    ],
  },
  {
    name: 'Namecheap',
    rows: [
      ['Para qué', 'Dominio y reenvío del correo de contacto.'],
      ['Qué recibe', 'Los mensajes enviados a la dirección de contacto pasan por su reenvío.'],
      ['Dónde y su política', PENDING],
    ],
  },
  {
    name: 'Almacenamiento de documentos privados',
    rows: [
      ['Para qué', 'Archivos de los capítulos extra.'],
      ['Qué recibe', 'Los archivos que sube el equipo; no recibe datos de las lectoras.'],
      ['Dónde y su política', PENDING],
    ],
  },
];

/** La lista de proveedores de la política de privacidad. */
export function ThirdPartyList() {
  return <FactList items={THIRD_PARTIES} />;
}
