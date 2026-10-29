import { Placeholder } from './LegalPage';

/**
 * Quién más interviene cuando alguien usa el sitio. La lista sale de lo que el sitio usa de verdad; el país y el
 * enlace a cada política quedan como dato pendiente para la revisión legal.
 */
const THIRD_PARTIES = [
  {
    name: 'Cloudflare',
    purpose: 'Dirección del sitio (DNS) y protección delante de él.',
    data: 'Todas las visitas pasan por ahí: dirección IP, navegador y las páginas que se piden.',
  },
  {
    name: 'Render',
    purpose: 'Alojamiento del sitio web y del servidor.',
    data: 'Dirección IP y registros técnicos de cada visita.',
  },
  {
    name: 'MongoDB Atlas',
    purpose: 'Base de datos.',
    data: 'Cuentas, progreso, resultados y mensajes de contacto.',
  },
  {
    name: 'Cloudinary',
    purpose: 'Alojamiento de las imágenes y los videos del sitio.',
    data: 'Tu navegador pide las imágenes y los videos directamente a Cloudinary, así que recibe tu dirección IP y datos técnicos de la petición. No recibe datos de tu cuenta.',
  },
  {
    name: 'Resend',
    purpose:
      'Envío de correos del servicio (recuperar contraseña, avisos de seguridad, mensajes de contacto).',
    data: 'La dirección de correo y el texto del mensaje.',
  },
  {
    name: 'Google Identity',
    purpose: 'Solo si eliges «Continuar con Google».',
    data: 'Tu correo, tu nombre y tu identificador de Google. Su botón carga un script de Google y puede usar cookies propias.',
  },
  {
    name: 'Namecheap',
    purpose: 'Dominio y reenvío del correo de contacto.',
    data: 'Los mensajes enviados a la dirección de contacto pasan por su reenvío.',
  },
  {
    name: 'Almacenamiento de documentos privados',
    purpose: 'Archivos de los capítulos extra.',
    data: 'Los archivos que sube el equipo; no recibe datos de las lectoras.',
  },
] as const;

/** La tabla de terceros de la política de privacidad. */
export function ThirdPartyTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="sr-only">Proveedores que tratan datos</caption>
        <thead>
          <tr className="border-b border-line text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Proveedor
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Para qué
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Qué datos recibe
            </th>
            <th scope="col" className="py-2 font-medium">
              País y política
            </th>
          </tr>
        </thead>
        <tbody>
          {THIRD_PARTIES.map((row) => (
            <tr key={row.name} className="border-b border-line align-top">
              <th scope="row" className="py-3 pr-3 font-medium">
                {row.name}
              </th>
              <td className="py-3 pr-3">{row.purpose}</td>
              <td className="py-3 pr-3">{row.data}</td>
              <td className="py-3">
                <Placeholder>país o región y enlace a su política</Placeholder>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
