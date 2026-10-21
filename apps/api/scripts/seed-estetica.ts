/**
 * Datos de PRUEBA para ver la «estética de la autora» en la web de desarrollo (todo marcado `[PRUEBA]`; las imágenes
 * son de la cuenta de demostración de Cloudinary). Uso (con MongoDB, un ADMIN y un libro publicado):
 *   npm run seed:estetica -w apps/api            carga lo que falte (no pisa lo que ya escribió la autora)
 *   npm run seed:estetica -w apps/api -- --quitar  retira lo que este script cargó (todo lo marcado `[PRUEBA]`)
 * Es idempotente. Se niega a correr en producción y con una base de datos que no sea local (para una base remota de
 * desarrollo hay que decirlo con `--base-remota`). Rechaza opciones que no conoce.
 *
 * Qué prepara, en el libro publicado de mayor orden (el de la portada):
 *   fondo del sitio y 6 imágenes del encabezado · fecha de salida a 30 días · carpetas de lugares (3 tipos) ·
 *   5 fan arts · 5 reseñas · 6 campos de poder con su fondo animado · un quiz cuyos resultados pertenecen a esos campos.
 */
import { parseEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { canonicalJson } from '../src/lib/canonicalJson.js';
import { sha256Hex } from '../src/lib/crypto.js';
import { escapeRegex, letterOf, normalizeName } from '../src/lib/text.js';
import { isLocalMongoUri, parseEsteticaArgs } from '../src/seed/esteticaGuards.js';
import { resultsFor, simpleStage } from '../src/seed/quizBuilders.js';
import { AccessToken } from '../src/models/AccessToken.js';
import { Book } from '../src/models/Book.js';
import { FanArt } from '../src/models/FanArt.js';
import { Quiz } from '../src/models/Quiz.js';
import { QuizAttempt } from '../src/models/QuizAttempt.js';
import { QuizVersion } from '../src/models/QuizVersion.js';
import { Review } from '../src/models/Review.js';
import { SiteSettings } from '../src/models/SiteSettings.js';
import { User } from '../src/models/User.js';
import { UserProgress } from '../src/models/UserProgress.js';
import { WikiEntry } from '../src/models/WikiEntry.js';

const MARK = '[PRUEBA]';
const DEMO_IDS = [
  'sample',
  'cld-sample',
  'cld-sample-2',
  'cld-sample-3',
  'cld-sample-4',
  'cld-sample-5',
];

const image = (publicId: string, alt: string, size = { width: 800, height: 1000 }) => ({
  provider: 'cloudinary' as const,
  publicId,
  url: `https://res.cloudinary.com/demo/image/upload/${publicId}`,
  ...size,
  alt: `${MARK} ${alt}`,
  deliveryType: 'upload' as const,
});

const env = parseEnv();
if (env.NODE_ENV === 'production') {
  console.error('Los datos de prueba no se cargan en producción.');
  process.exit(1);
}
const args = parseEsteticaArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
if (!args.allowRemote && !isLocalMongoUri(env.MONGODB_URI)) {
  console.error(
    'MONGODB_URI no apunta a esta máquina: los datos de prueba solo se cargan en una base local (usa --base-remota si de verdad es una base de desarrollo).',
  );
  process.exit(1);
}
const remove = args.remove;
const marked = new RegExp(`^${escapeRegex(MARK)}`);

try {
  await connectDb(env.MONGODB_URI);

  if (remove) {
    const arts = await FanArt.deleteMany({ title: marked });
    const reviews = await Review.deleteMany({ authorName: marked });
    const places = await WikiEntry.deleteMany({ name: marked });
    const demoQuizzes = await Quiz.find({ title: marked }).select('_id').lean();
    const demoIds = demoQuizzes.map((quiz) => quiz._id);
    // Lo que quedaría apuntando al quiz demo: intentos, avance de quienes lo jugaron y sus códigos QR.
    const attempts = await QuizAttempt.deleteMany({ quizId: { $in: demoIds } });
    await UserProgress.updateMany(
      {},
      { $pull: { completed: { refId: { $in: demoIds } }, unlocked: { refId: { $in: demoIds } } } },
    );
    await AccessToken.deleteMany({ 'target.refId': { $in: demoIds } });
    // Las versiones publicadas son inmutables para la aplicación: este script de desarrollo las borra directo de la colección.
    await QuizVersion.collection.deleteMany({ quizId: { $in: demoIds } });
    await Quiz.deleteMany({ title: marked });

    // Solo se quita lo que esta herramienta puso: lo marcado con `[PRUEBA]` en el texto alternativo y las pestañas de
    // la wiki que añadió (llevan `prueba: true`). Las imágenes reales que la autora haya subido se conservan.
    const settings = await SiteSettings.findOne({ key: 'site' });
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    if (marked.test(String(settings?.universe?.background?.alt ?? '')))
      unset['universe.background'] = 1;
    const header = (settings?.universe?.headerImages ?? []) as { alt?: string }[];
    const keep = header.filter((item) => !marked.test(String(item.alt ?? '')));
    if (keep.length !== header.length) {
      if (keep.length === 0) unset['universe.headerImages'] = 1;
      else set['universe.headerImages'] = keep;
    }
    const settingsUpdate = {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    };
    if (Object.keys(settingsUpdate).length > 0)
      await SiteSettings.updateOne({ key: 'site' }, settingsUpdate);

    let sectionsRemoved = 0;
    for (const book of await Book.find({ 'wikiSections.prueba': true })) {
      const sections = (book.wikiSections ?? []) as { prueba?: boolean }[];
      const kept = sections.filter((section) => section.prueba !== true);
      sectionsRemoved += sections.length - kept.length;
      book.wikiSections = kept;
      book.markModified('wikiSections');
      await book.save();
    }
    console.log(
      `Retirado: ${arts.deletedCount} fan arts, ${reviews.deletedCount} reseñas, ${places.deletedCount} entradas de la wiki, ` +
        `${sectionsRemoved} pestañas de la wiki, ${attempts.deletedCount} intentos del quiz demo` +
        `${Object.keys(settingsUpdate).length > 0 ? ' y las imágenes de prueba del sitio' : ''}` +
        `${demoQuizzes.length > 0 ? ', y el quiz de los campos' : ''}. La fecha de salida del libro no se toca (puede ser real).`,
    );
  } else {
    const admin = await User.findOne({ role: 'ADMIN', status: 'active' }).sort({ createdAt: 1 });
    if (!admin) {
      console.error('No hay ningún administrador. Crea uno con `npm run seed:admin -w apps/api`.');
      process.exit(1);
    }
    const book = await Book.findOne({ status: 'published' }).sort({ order: -1 });
    if (!book) {
      console.error('No hay un libro publicado. Carga uno con `npm run seed:quizzes -w apps/api`.');
      process.exit(1);
    }
    const report: string[] = [];

    // Fondo del sitio y rejilla del encabezado: solo si la autora todavía no puso los suyos.
    const settings = await SiteSettings.findOne({ key: 'site' });
    const set: Record<string, unknown> = {};
    if (!settings?.universe?.background) {
      set['universe.background'] = image(
        'samples/landscapes/nature-mountains',
        'fondo de ejemplo',
        {
          width: 1600,
          height: 1067,
        },
      );
      report.push('fondo del sitio');
    }
    if (!settings?.universe?.headerImages || settings.universe.headerImages.length === 0) {
      set['universe.headerImages'] = DEMO_IDS.map((id, i) =>
        image(id, `imagen ${i + 1} del encabezado`),
      );
      report.push('6 imágenes del encabezado');
    }
    if (Object.keys(set).length > 0) {
      await SiteSettings.updateOne({ key: 'site' }, { $set: set }, { upsert: true });
    }

    // Fecha de salida (cronómetro) a 30 días, si el libro no tiene una.
    if (!book.releaseDate) {
      book.releaseDate = new Date(Date.now() + 30 * 86_400_000);
      await book.save();
      report.push(`fecha de salida de «${book.title}»`);
    }

    // Lugares: la pestaña debe existir en el libro y hay lugares de tres tipos.
    const sections = (book.wikiSections ?? []) as { kind: string; enabled?: boolean }[];
    if (!sections.some((section) => section.kind === 'place' && section.enabled !== false)) {
      book.wikiSections = [
        ...sections.filter((section) => section.kind !== 'place'),
        {
          kind: 'place',
          title: 'Lugares',
          order: sections.length + 1,
          enabled: true,
          prueba: true,
        },
      ];
      book.markModified('wikiSections');
      await book.save();
      report.push('pestaña «Lugares» en la wiki');
    }
    const places: [string, string, string][] = [
      ['Sala de experimentación', 'Laboratorio', 'Sala de experimentación'],
      ['Central de Biología', 'Laboratorio', 'Central de Biología'],
      ['Pasillo del Sector C', 'Laboratorio', 'Pasillo del Sector C'],
      ['Plaza del Reloj', 'Ciudad', 'Plaza del Reloj'],
      ['Mercado de Faroles', 'Ciudad', 'Mercado de Faroles'],
      ['Claro del Bosque', 'Naturaleza', 'Claro del Bosque'],
    ];
    let createdPlaces = 0;
    for (const [index, [name, group]] of places.entries()) {
      const title = `${MARK} ${name}`;
      const exists = await WikiEntry.exists({ bookId: book._id, kind: 'place', name: title });
      if (exists) continue;
      await WikiEntry.create({
        bookId: book._id,
        kind: 'place',
        slug: `prueba-${normalizeName(name).replace(/[^a-z0-9]+/g, '-')}`,
        name: title,
        nameNormalized: normalizeName(title),
        letter: letterOf(title),
        summary: 'Lugar de ejemplo para probar las carpetas.',
        bodyHtml: '<p>[PLACEHOLDER] Descripción del lugar.</p>',
        group,
        order: index + 1,
        status: 'published',
      });
      createdPlaces += 1;
    }
    if (createdPlaces > 0) report.push(`${createdPlaces} lugares en 3 carpetas`);

    // Campos de poder con su fondo animado, y un quiz cuyos resultados pertenecen a cada campo.
    if (!sections.some((section) => section.kind === 'power_field' && section.enabled !== false)) {
      book.wikiSections = [
        ...((book.wikiSections ?? []) as unknown[]),
        {
          kind: 'power_field',
          title: 'Poderes',
          order: (book.wikiSections ?? []).length + 1,
          enabled: true,
          prueba: true,
        },
      ];
      book.markModified('wikiSections');
      await book.save();
    }
    const powerFields: [
      string,
      string,
      'rain' | 'neural' | 'constellation' | 'gradient' | 'field' | 'neon',
    ][] = [
      ['Agitación', 'agitacion', 'rain'],
      ['Mente', 'mente', 'neural'],
      ['Intelectual', 'intelectual', 'constellation'],
      ['Transformación', 'transformacion', 'gradient'],
      ['Naturaleza', 'naturaleza', 'field'],
      ['Virtud', 'virtud', 'neon'],
    ];
    let createdFields = 0;
    for (const [index, [name, slug, visualKey]] of powerFields.entries()) {
      const title = `${MARK} ${name}`;
      if (await WikiEntry.exists({ bookId: book._id, kind: 'power_field', name: title })) continue;
      await WikiEntry.create({
        bookId: book._id,
        kind: 'power_field',
        slug: `prueba-${slug}`,
        name: title,
        nameNormalized: normalizeName(title),
        letter: letterOf(title),
        summary: 'Campo de ejemplo para probar el fondo animado.',
        bodyHtml: '<p>[PLACEHOLDER] Descripción del campo y de sus poderes.</p>',
        visualKey,
        order: 100 + index,
        status: 'published',
      });
      createdFields += 1;
    }
    if (createdFields > 0) report.push(`${createdFields} campos de poder con fondo animado`);

    if (!(await Quiz.exists({ bookId: book._id, title: marked }))) {
      const keys = powerFields.map(([, slug]) => `prueba-${slug}`);
      const results = resultsFor('etapa-1', keys).map((result, index) => ({
        ...result,
        title: `${MARK} Eres del campo ${powerFields[index]?.[0] ?? ''}`,
        fieldSlug: keys[index] as string,
      }));
      const content = {
        title: `${MARK} Quiz de los campos`,
        instructionsHtml:
          '<p>[PLACEHOLDER] Elige cualquier respuesta: cada una te lleva a un campo distinto.</p>',
        settings: { allowRetake: true, showBreakdown: false },
        stages: [simpleStage('etapa-1', keys, { questions: 2 })],
        results,
      };
      const last = await Quiz.findOne({ bookId: book._id })
        .sort({ order: -1 })
        .select('order')
        .lean();
      const quiz = await Quiz.create({
        bookId: book._id,
        slug: 'prueba-campos',
        order: (last?.order ?? 0) + 1,
        title: content.title,
        instructionsHtml: content.instructionsHtml,
        settings: content.settings,
        draft: { stages: content.stages, results: content.results },
        status: 'published',
        currentVersion: 1,
        lastPublishedAt: new Date(),
      });
      await QuizVersion.create({
        quizId: quiz._id,
        bookId: book._id,
        version: 1,
        title: content.title,
        instructionsHtml: content.instructionsHtml,
        settings: content.settings,
        stages: content.stages,
        results: content.results,
        publishedAt: new Date(),
        publishedBy: admin._id,
        contentHash: `sha256:${sha256Hex(canonicalJson(content))}`,
      });
      report.push('quiz de los campos (el último del libro, antes del juego)');
    }

    // Fan arts (con permiso confirmado) y reseñas.
    if (!(await FanArt.exists({ title: marked }))) {
      await FanArt.insertMany(
        DEMO_IDS.slice(0, 5).map((id, i) => ({
          image: image(id, `fan art ${i + 1}`),
          title: `${MARK} Dibujo ${i + 1}`,
          artistName: `Artista de prueba ${i + 1}`,
          permissionConfirmed: true,
          order: 500 + i,
          status: 'published',
          createdBy: admin._id,
        })),
      );
      report.push('5 fan arts');
    }
    if (!(await Review.exists({ authorName: marked }))) {
      const texts = [
        '[PLACEHOLDER] Una historia que no pude soltar hasta la última página.',
        '[PLACEHOLDER] Los quizzes me hicieron sentir parte del universo.',
        '[PLACEHOLDER] La wiki está tan cuidada que da ganas de explorarla entera.',
        '[PLACEHOLDER] Lo leí en un fin de semana y ya quiero el siguiente.',
        '[PLACEHOLDER] Reseña muy larga para probar cómo se comporta el diseño con un texto extenso: ' +
          'cuenta cómo empezó la lectura, qué personaje le gustó más y por qué recomienda el libro a quien ama las sagas.',
      ];
      await Review.insertMany(
        texts.map((text, i) => ({
          bookId: book._id,
          text,
          authorName: `${MARK} Lectora ${i + 1}`,
          rating: 5 - (i % 2),
          order: 500 + i,
          status: 'published',
          createdBy: admin._id,
        })),
      );
      report.push('5 reseñas');
    }

    console.log(`Libro: «${book.title}» (${book.slug})`);
    console.log(report.length > 0 ? `Cargado: ${report.join(', ')}.` : 'Ya estaba todo cargado.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
