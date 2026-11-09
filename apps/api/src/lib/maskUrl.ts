/** Oculta en una URL (para registros) el token de un QR y el del enlace de baja de los correos de novedades. */
export function maskAccessToken(url: string | undefined): string | undefined {
  return url
    ?.replace(/(\/access\/resolve\/)[^/?#]+/, '$1[REDACTADO]')
    .replace(/(\/newsletter\/[^?#]*\?(?:[^#]*&)?t=)[^&#]+/, '$1[REDACTADO]');
}
