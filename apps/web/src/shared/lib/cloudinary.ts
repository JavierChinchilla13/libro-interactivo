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

/**
 * Video de fondo reducido: formato (mp4 o webm según el navegador) y calidad automáticos, ancho acotado sin ampliar.
 * Una URL que no es de video de Cloudinary se devuelve igual.
 */
export function videoUrl(url: string, width = 720): string {
  return url.includes('/video/upload/')
    ? url.replace('/video/upload/', `/video/upload/f_auto,q_auto,c_limit,w_${width}/`)
    : url;
}

/**
 * Póster de un video (su primer fotograma, ya como imagen) con el ancho acotado. Se encadena una transformación
 * antes de la que ya trae el póster. Una URL que no es de Cloudinary se devuelve igual.
 */
export function posterUrl(url: string, width = 720): string {
  return url.includes('/upload/') ? url.replace('/upload/', `/upload/c_limit,w_${width}/`) : url;
}
