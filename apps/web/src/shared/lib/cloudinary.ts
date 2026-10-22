/**
 * Vista reducida de una imagen de Cloudinary: formato y calidad automáticos y ancho acotado (imágenes optimizadas).
 * Cualquier URL que no sea de Cloudinary se devuelve igual.
 */
export function thumbUrl(url: string, width = 320): string {
  return url.includes('/upload/')
    ? url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
    : url;
}

/**
 * Igual que `thumbUrl`, pero acotando el alto (para filas de altura fija con imágenes de proporciones distintas).
 * `c_limit` nunca amplía: una imagen más chica que `height` se entrega tal cual.
 */
export function heightUrl(url: string, height = 560): string {
  return url.includes('/upload/')
    ? url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,h_${height}/`)
    : url;
}
