import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { User } from '../models/User.js';
import { createUser } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { describeNewsletterDiagnosis, diagnoseNewsletter } from './newsletterDiagnosis.js';

useTestDb();

async function subscribe(email: string, extra: Record<string, unknown> = {}) {
  const user = await createUser({ email });
  await User.collection.updateOne(
    { _id: user._id },
    {
      $set: { 'newsletter.status': 'subscribed', 'newsletter.subscribedAt': new Date(), ...extra },
    },
  );
  return user;
}

describe('diagnóstico de los correos de novedades', () => {
  it('cuenta las apuntadas, las que el aviso incluye y las que no, sin imprimir correos', async () => {
    await subscribe('a@ejemplo.com');
    await subscribe('b@ejemplo.com');
    await subscribe('c@ejemplo.com', { status: 'disabled' });
    const sinCampo = await subscribe('d@ejemplo.com');
    await User.collection.updateOne({ _id: sinCampo._id }, { $unset: { status: '' } });
    await createUser({ email: 'e@ejemplo.com' });

    const db = mongoose.connection.db!;
    const d = await diagnoseNewsletter(db);
    expect(d).toMatchObject({
      users: 5,
      subscribed: 4,
      subscribedWithDate: 4,
      countedByRecipientsFilter: 3,
      countedByService: 3,
      notCountedByAccountStatus: { disabled: 1 },
    });
    expect(d.byAccountStatus).toMatchObject({ active: 3, 'sin campo': 1, disabled: 1 });
    expect(d.byNewsletterStatus).toMatchObject({ subscribed: 4, 'sin campo': 1 });
    expect(
      d.indexes.some((index) => index.name.includes('newsletter.status') && index.partial),
    ).toBe(true);

    const text = describeNewsletterDiagnosis(d).join('\n');
    expect(text).toMatch(/1 cuenta apuntada no se cuenta porque la cuenta está desactivada/);
    expect(text).not.toMatch(/@ejemplo\.com/);
  });

  it('sin apuntadas lo dice: el 0 es correcto', async () => {
    await createUser({ email: 'a@ejemplo.com' });
    const d = await diagnoseNewsletter(mongoose.connection.db!);
    expect(describeNewsletterDiagnosis(d).join('\n')).toMatch(/el 0 del aviso es correcto/);
  });

  it('con todas contadas, concluye que el 0 no viene de esta base', async () => {
    await subscribe('a@ejemplo.com');
    const d = await diagnoseNewsletter(mongoose.connection.db!);
    expect(describeNewsletterDiagnosis(d).join('\n')).toMatch(
      /Se cuentan todas las apuntadas \(1\): si el aviso dice 0, el dato no viene de esta base/,
    );
  });
});
