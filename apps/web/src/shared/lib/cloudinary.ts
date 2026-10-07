/**
 * Vista reducida de una imagen de Cloudinary: formato y calidad automáticos y ancho acotado (imágenes optimizadas).
 * Cualquier URL que no sea de Cloudinary se devuelve igual.
 */
export function thumbUrl(url: string, width = 320): string {
  return url.includes('/upload/')
    ? url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
    : url;
}
