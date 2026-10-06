import type { ImageRef, Media } from '@libro/shared';
import { assertCloudinaryUrls } from '../lib/images.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';

/** Lo mínimo que tienen en común el borrador (incompleto) y el contenido completo de un quiz. */
interface HtmlAndMedia {
  instructionsHtml: string;
  image?: ImageRef | undefined;
  stages: { questions: { image?: ImageRef | undefined }[] }[];
  results: { description?: string | undefined; media?: Media | undefined }[];
}

/** Sanea todo el HTML del quiz (instrucciones y descripción de cada resultado). Idempotente. */
export function sanitizeQuizHtml<T extends HtmlAndMedia>(content: T): T {
  return {
    ...content,
    instructionsHtml: sanitizeRichHtml(content.instructionsHtml),
    results: content.results.map((result) =>
      result.description === undefined
        ? result
        : { ...result, description: sanitizeRichHtml(result.description) },
    ),
  };
}

/** Rechaza (400) cualquier imagen o video del quiz que no sea de Cloudinary. */
export function assertQuizMediaAllowed(content: HtmlAndMedia): void {
  const urls: (string | undefined)[] = [content.image?.url];
  for (const stage of content.stages) {
    for (const question of stage.questions) urls.push(question.image?.url);
  }
  for (const result of content.results) {
    const media = result.media;
    if (media?.kind === 'image') urls.push(media.image.url);
    if (media?.kind === 'video') urls.push(media.video.url, media.video.posterUrl);
  }
  assertCloudinaryUrls(urls);
}
