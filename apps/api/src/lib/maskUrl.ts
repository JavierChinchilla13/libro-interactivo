/** Oculta el token de un QR en una URL (para registros). */
export function maskAccessToken(url: string | undefined): string | undefined {
  return url?.replace(/(\/access\/resolve\/)[^/?#]+/, '$1[REDACTADO]');
}
