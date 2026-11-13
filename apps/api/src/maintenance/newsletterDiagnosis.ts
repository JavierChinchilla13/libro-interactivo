import { plural } from '@libro/shared';
import mongoose from 'mongoose';
import { User } from '../models/User.js';

type Db = NonNullable<typeof mongoose.connection.db>;

/**
 * Diagnóstico de los correos de novedades (SOLO LEE): ¿el conteo de «Lo recibirían N lectores apuntados» coincide con lo
 * que hay guardado? Cuenta cuentas por estado, cuántas están apuntadas y cuántas de ellas el conteo no incluye (con el
 * motivo), y lista los índices de `users` y las versiones. Nunca imprime correos, nombres ni identificadores.
 */
export interface NewsletterDiagnosis {
  users: number;
  /** Por el campo `status` de la cuenta (`sin campo` = el documento no lo trae). */
  byAccountStatus: Record<string, number>;
  /** Por `newsletter.status` (`sin alta` = nunca se apuntó). */
  byNewsletterStatus: Record<string, number>;
  subscribed: number;
  subscribedWithDate: number;
  /** Apuntadas que cuenta la consulta directa del aviso (cuenta activa y `subscribed`). */
  countedByRecipientsFilter: number;
  /** Lo mismo, con la consulta que usa el servidor (Mongoose, con el filtro actual). */
  countedByService: number;
  /** Apuntadas que el conteo directo NO incluye, por el estado de su cuenta. */
  notCountedByAccountStatus: Record<string, number>;
  indexes: Array<{ name: string; key: string; partial: boolean }>;
  mongoose: string;
  server: string;
}

const label = (value: unknown) =>
  value === undefined || value === null ? 'sin campo' : String(value);

async function tally(db: Db, field: string, filter: Record<string, unknown> = {}) {
  const rows = await db
    .collection('users')
    .aggregate<{ _id: unknown; n: number }>([
      { $match: filter },
      { $group: { _id: { $ifNull: [`$${field}`, null] }, n: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((row) => [label(row._id), row.n]));
}

export async function diagnoseNewsletter(db: Db): Promise<NewsletterDiagnosis> {
  const users = db.collection('users');
  const subscribedFilter = { 'newsletter.status': 'subscribed' };
  let server = 'desconocida';
  try {
    const info = await db.command({ buildInfo: 1 });
    server = String(info['version'] ?? server);
  } catch {
    // Sin permiso para `buildInfo`: se omite.
  }
  const indexes = (await users.indexes()).map((index) => ({
    name: String(index.name),
    key: Object.keys(index.key).join(','),
    partial: index['partialFilterExpression'] !== undefined,
  }));
  return {
    users: await users.countDocuments({}),
    byAccountStatus: await tally(db, 'status'),
    byNewsletterStatus: await tally(db, 'newsletter.status'),
    subscribed: await users.countDocuments(subscribedFilter),
    subscribedWithDate: await users.countDocuments({
      ...subscribedFilter,
      'newsletter.subscribedAt': { $type: 'date' },
    }),
    countedByRecipientsFilter: await users.countDocuments({
      ...subscribedFilter,
      status: { $ne: 'disabled' },
    }),
    countedByService: await User.countDocuments({
      status: { $ne: 'disabled' },
      'newsletter.status': 'subscribed',
    }),
    notCountedByAccountStatus: await tally(db, 'status', {
      ...subscribedFilter,
      status: { $in: ['disabled'] },
    }),
    indexes,
    mongoose: mongoose.version,
    server,
  };
}

/** Líneas legibles del diagnóstico, con una conclusión al final. */
export function describeNewsletterDiagnosis(d: NewsletterDiagnosis): string[] {
  const fmt = (record: Record<string, number>) =>
    Object.entries(record)
      .map(([key, n]) => `${key}: ${n}`)
      .join(' · ') || '—';
  const lines = [
    `Versiones: mongoose ${d.mongoose}, MongoDB ${d.server}`,
    `Cuentas: ${d.users}`,
    `Por estado de la cuenta → ${fmt(d.byAccountStatus)}`,
    `Por estado de las novedades → ${fmt(d.byNewsletterStatus)}`,
    `Apuntadas (newsletter.status = subscribed): ${d.subscribed} (con fecha de alta: ${d.subscribedWithDate})`,
    `Las cuenta el aviso: ${d.countedByRecipientsFilter} (consulta directa) y ${d.countedByService} (consulta del servidor)`,
    `Apuntadas que NO entran por tener la cuenta desactivada → ${fmt(d.notCountedByAccountStatus)}`,
    `Índices de users → ${d.indexes.map((i) => `${i.name}${i.partial ? ' (parcial)' : ''}`).join(', ')}`,
  ];
  const missing = d.subscribed - d.countedByRecipientsFilter;
  lines.push(
    d.subscribed === 0
      ? '! Ninguna cuenta tiene newsletter.status = subscribed: el 0 del aviso es correcto para esta base.'
      : d.countedByRecipientsFilter !== d.countedByService
        ? `✗ La consulta directa (${d.countedByRecipientsFilter}) y la del servidor (${d.countedByService}) no coinciden: mirar los índices y la versión de mongoose.`
        : missing > 0
          ? `! ${plural(missing, 'cuenta apuntada', 'cuentas apuntadas')} no se cuenta${missing === 1 ? '' : 'n'} porque la cuenta está desactivada.`
          : `✓ Se cuentan todas las apuntadas (${d.subscribed}): si el aviso dice 0, el dato no viene de esta base.`,
  );
  return lines;
}
