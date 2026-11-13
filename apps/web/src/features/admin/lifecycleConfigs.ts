import { keys } from './api';
import type { LifecycleConfig } from './components/lifecycle';

/**
 * Qué se puede archivar y eliminar en cada parte del panel, y cómo se dice. Las reglas (qué estados se eliminan) son las
 * del servidor; aquí solo se ofrece lo que tiene sentido y el servidor decide (y bloquea con su mensaje).
 */
const IMAGES_NOTE = 'Las imágenes ya subidas no se borran de Cloudinary: quedan guardadas.';

export const POST_LIFECYCLE: LifecycleConfig = {
  base: '/admin/posts',
  noun: 'actualización',
  feminine: true,
  deletableStatuses: ['draft', 'archived'],
  restoredAs: 'borrador',
  deletes: 'la actualización y todo lo que escribiste en ella',
  note: IMAGES_NOTE,
  keys: [keys.posts],
};

export const CARD_LIFECYCLE: LifecycleConfig = {
  base: '/admin/cards',
  noun: 'carta',
  feminine: true,
  // Una carta no tiene borrador: solo se elimina archivada.
  deletableStatuses: ['archived'],
  restoredAs: 'publicada',
  deletes: 'la carta y la lista de sus imágenes (también sus códigos QR ya revocados)',
  note: IMAGES_NOTE,
  keys: [['admin', 'cards']],
};

export const EXTRA_LIFECYCLE: LifecycleConfig = {
  base: '/admin/extras',
  noun: 'capítulo extra',
  feminine: false,
  deletableStatuses: ['draft', 'archived'],
  restoredAs: 'borrador',
  deletes: 'el capítulo extra y su archivo',
  keys: [['admin', 'extras']],
};

export const FAN_ART_LIFECYCLE: LifecycleConfig = {
  base: '/admin/fan-arts',
  noun: 'fan art',
  feminine: false,
  deletableStatuses: ['draft', 'archived'],
  restoredAs: 'borrador',
  deletes: 'el fan art',
  note: IMAGES_NOTE,
  keys: [keys.fanArts],
};

/** En las reseñas «archivar» es ocultar (`hidden`) y no hay borrador. */
export const REVIEW_LIFECYCLE: LifecycleConfig = {
  base: '/admin/reviews',
  noun: 'reseña',
  feminine: true,
  archivedStatus: 'hidden',
  deletableStatuses: ['hidden'],
  restoredAs: 'publicada',
  deletes: 'la reseña',
  keys: [keys.reviews],
};

export const WIKI_LIFECYCLE: LifecycleConfig = {
  base: '/admin/wiki',
  noun: 'entrada',
  feminine: true,
  deletableStatuses: ['draft', 'archived'],
  restoredAs: 'borrador',
  deletes: 'la entrada de la wiki',
  note: IMAGES_NOTE,
  keys: [keys.wiki],
};
