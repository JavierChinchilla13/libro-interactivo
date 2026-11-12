import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { DEFAULT_LIMITS, limitFactor, scaleLimits, type Limits } from './config/limits.js';
import { createBackgroundTasks, type BackgroundTasks } from './lib/background.js';
import { systemClock, type Clock } from './lib/clock.js';
import type { Logger } from './lib/logger.js';
import { createGuards, type Guards } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.js';
import { createRequireUnlocked } from './middleware/unlocked.js';
import { configureCloudinaryAccount } from './lib/images.js';
import { createImageProvider, type ImageProvider } from './providers/images/ImageProvider.js';
import { S3StorageProvider, s3ConfigFromEnv } from './providers/storage/S3StorageProvider.js';
import {
  MemoryStorageProvider,
  type StorageProvider,
} from './providers/storage/StorageProvider.js';
import { createClientIpMiddleware } from './lib/clientIp.js';
import { noIndex } from './middleware/noIndex.js';
import { createSameOriginGuard } from './middleware/sameOrigin.js';
import type { MailProvider } from './providers/mail/MailProvider.js';
import { createMailProvider } from './providers/mail/createMailProvider.js';
import { createApiRouter } from './routes/index.js';
import { createAccessService } from './services/access.service.js';
import { createLibraryService } from './services/library.service.js';
import { createPublicBookService } from './services/publicBook.service.js';
import { createAdminMetricsService } from './services/adminMetrics.service.js';
import { createAdminUsersService } from './services/adminUsers.service.js';
import {
  createBackupDownloadService,
  type BackupDownloadDeps,
} from './services/backupDownload.service.js';
import { createFanArtService, createReviewService } from './services/community.service.js';
import { createPostService } from './services/post.service.js';
import { createPublicWikiService } from './services/publicWiki.service.js';
import { createSitemapService } from './services/sitemap.service.js';
import { createSiteSettingsService } from './services/siteSettings.service.js';
import { createWelcomeService } from './services/welcome.service.js';
import { createNewsletterService } from './services/newsletter.service.js';
import { createNotificationService } from './services/notification.service.js';
import { CountingMailProvider, createMailQuota } from './services/mailQuota.service.js';
import { createCardService } from './services/card.service.js';
import { createExtraService } from './services/extra.service.js';
import { createAccountService } from './services/account.service.js';
import { AGE_REJECTION_LIMIT, createAgeGate } from './services/ageGate.service.js';
import { createAuthService, type AuthService } from './services/auth.service.js';
import { createContactService } from './services/contact.service.js';
import { createGoogleVerifier, type GoogleVerifier } from './services/google.service.js';
import { createPasswordResetService } from './services/passwordReset.service.js';
import { createGameService } from './services/game.service.js';
import { createProgressService } from './services/progress.service.js';
import { cryptoRandomInt, type RandomInt } from './services/quiz-engine.js';
import { createQuizService } from './services/quiz.service.js';
import { createQuizPublishService } from './services/quizPublish.service.js';
import { maskAccessToken } from './lib/maskUrl.js';
import { createBookService } from './services/book.service.js';
import { createQuizAdminService } from './services/quizAdmin.service.js';
import { createQuizAppearanceService } from './services/quizAppearance.service.js';
import { createWikiService } from './services/wiki.service.js';
import { createTokenService } from './services/token.service.js';

export { maskAccessToken };

export interface AppDeps {
  env: Pick<
    Env,
    | 'NODE_ENV'
    | 'CORS_ORIGIN'
    | 'JWT_ACCESS_SECRET'
    | 'ACCESS_TOKEN_TTL_SECONDS'
    | 'REFRESH_TOKEN_TTL_DAYS'
    | 'COOKIE_DOMAIN'
    | 'APP_URL'
    | 'RESET_TOKEN_TTL_MINUTES'
    | 'MAIL_PROVIDER'
    | 'MAIL_FROM'
    | 'GMAIL_USER'
    | 'GMAIL_APP_PASSWORD'
    | 'RESEND_API_KEY'
    | 'GOOGLE_CLIENT_ID'
    | 'RATE_LIMIT_MULTIPLIER'
    | 'TRUST_PROXY_HOPS'
    | 'TRUST_CLOUDFLARE_HEADER'
    | 'ALLOW_INDEXING'
    | 'CONTACT_RECIPIENT_EMAIL'
    | 'REQUIRE_QR_UNLOCK'
    | 'ACCESS_TOKEN_SECRET'
    | 'S3_ENDPOINT'
    | 'S3_BUCKET'
    | 'S3_ACCESS_KEY_ID'
    | 'S3_SECRET_ACCESS_KEY'
    | 'S3_REGION'
    | 'S3_FORCE_PATH_STYLE'
    | 'CLOUDINARY_CLOUD_NAME'
    | 'CLOUDINARY_API_KEY'
    | 'CLOUDINARY_API_SECRET'
    | 'UNSUBSCRIBE_SECRET'
    | 'RESEND_WEBHOOK_SECRET'
    | 'MAIL_FROM_NEWS'
    | 'MAIL_DAILY_LIMIT'
    | 'MAIL_MONTHLY_LIMIT'
    | 'MAIL_TRANSACTIONAL_RESERVE'
  >;
  logger: Logger;
  isDbUp: () => boolean;
  /** Reloj inyectable (pruebas de caducidad y bloqueos). Por defecto, la hora del sistema. */
  clock?: Clock;
  /** Límites de intentos por IP; por defecto `DEFAULT_LIMITS`. */
  limits?: Partial<Limits>;
  /** Proveedor de correo; por defecto el que indique MAIL_PROVIDER. */
  mail?: MailProvider;
  /** Ejecutor de tareas en segundo plano (envío de correos); por defecto uno propio. */
  tasks?: BackgroundTasks;
  /** Azar del barajado y de los empates de quizzes; por defecto `crypto`. Inyectable para pruebas con semilla. */
  random?: RandomInt;
  /** Verificador de ingreso con Google; por defecto el real si hay GOOGLE_CLIENT_ID. */
  google?: GoogleVerifier;
  /** Proveedor de imágenes (firma de subida); por defecto Cloudinary si hay credenciales. */
  images?: ImageProvider;
  /** Almacenamiento privado S3-compatible; por defecto el real si hay credenciales o uno en memoria. */
  storage?: StorageProvider;
  /**
   * Arranca el trabajador de la cola de avisos por correo (una pasada al poco de arrancar y cada 5 minutos). Solo el
   * servidor real lo enciende; las pruebas llaman a la pasada a mano.
   */
  startWorkers?: boolean;
  /** Ajustes del respaldo descargable (solo pruebas: carpeta temporal, tope y scrypt más liviano). */
  backup?: Pick<BackupDownloadDeps, 'tmpDir' | 'maxBytes' | 'scrypt'>;
}

/** Piezas compartidas que los módulos de rutas reutilizan (guards de sesión y rol, servicio de auth). */
export interface AppContext {
  guards: Guards;
  auth: AuthService;
}

/**
 * Construye la app Express sin escuchar en ningún puerto (así Supertest la prueba directamente).
 * `configure` permite montar rutas extra antes del 404 (se usa solo en pruebas).
 */
export function createApp(
  deps: AppDeps,
  configure?: (app: Express, ctx: AppContext) => void,
): Express {
  const clock = deps.clock ?? systemClock;
  // Todo correo pasa por el contador del cupo (los transaccionales y los avisos), por día UTC.
  const quota = createMailQuota({
    clock,
    config: {
      dailyLimit: deps.env.MAIL_DAILY_LIMIT,
      monthlyLimit: deps.env.MAIL_MONTHLY_LIMIT,
      reserve: deps.env.MAIL_TRANSACTIONAL_RESERVE,
    },
  });
  const mail = new CountingMailProvider(
    deps.mail ?? createMailProvider(deps.env, deps.logger),
    quota,
    deps.logger,
  );
  const tasks = deps.tasks ?? createBackgroundTasks(deps.logger);

  const auth = createAuthService({
    tokens: createTokenService({
      secret: deps.env.JWT_ACCESS_SECRET,
      ttlSeconds: deps.env.ACCESS_TOKEN_TTL_SECONDS,
      clock,
    }),
    clock,
    ipSecret: deps.env.JWT_ACCESS_SECRET,
    refreshTtlDays: deps.env.REFRESH_TOKEN_TTL_DAYS,
    // Con `RATE_LIMIT_MULTIPLIER` (solo pruebas E2E) el tope sube igual que el de los demás límites.
    ageGate: createAgeGate({
      clock,
      secret: deps.env.JWT_ACCESS_SECRET,
      limit: AGE_REJECTION_LIMIT * limitFactor(deps.env),
      // Sin decir qué red: sirve para notar si un valor mal puesto de TRUST_PROXY_HOPS cierra el registro a todos.
      onClosed: () =>
        deps.logger.warn('El registro quedó cerrado para una red por rechazos de edad'),
    }),
  });
  const guards = createGuards(auth);
  const account = createAccountService({ auth, mail, tasks, clock });
  const recovery = createPasswordResetService({
    auth,
    mail,
    tasks,
    clock,
    appUrl: deps.env.APP_URL,
    ttlMinutes: deps.env.RESET_TOKEN_TTL_MINUTES,
  });
  const contact = createContactService({
    mail,
    tasks,
    clock,
    logger: deps.logger,
    fallbackRecipient: deps.env.CONTACT_RECIPIENT_EMAIL,
    ipSecret: deps.env.JWT_ACCESS_SECRET,
  });

  const progress = createProgressService({ requireQrUnlock: deps.env.REQUIRE_QR_UNLOCK });
  const quizzes = createQuizService({ progress, clock, random: deps.random ?? cryptoRandomInt });
  const library = createLibraryService({ progress, quizzes });
  const game = createGameService({ progress, clock });
  const quizPublisher = createQuizPublishService({ clock, quizzes });
  const requireUnlocked = createRequireUnlocked(progress);
  const quizAdmin = createQuizAdminService({ clock });
  const books = createBookService();
  const wiki = createWikiService();
  const images = deps.images ?? createImageProvider(deps.env);
  // Las URLs de contenido solo valen si son de nuestra cuenta de Cloudinary (y `demo` fuera de producción).
  configureCloudinaryAccount({
    cloudName: deps.env.CLOUDINARY_CLOUD_NAME,
    production: deps.env.NODE_ENV === 'production',
  });
  const quizAppearance = createQuizAppearanceService({ clock, images, logger: deps.logger });
  const s3 = s3ConfigFromEnv(deps.env);
  const storage =
    deps.storage ?? (s3 ? new S3StorageProvider({ ...s3, clock }) : new MemoryStorageProvider());
  const access = createAccessService({
    secret: deps.env.ACCESS_TOKEN_SECRET,
    appUrl: deps.env.APP_URL,
    clock,
    progress,
  });
  const extras = createExtraService({ storage, progress, clock });
  const cards = createCardService({ images, clock });
  const welcome = createWelcomeService({ clock });
  const publicBooks = createPublicBookService();
  const publicWiki = createPublicWikiService();
  const sitemap = createSitemapService({ publicWiki, clock, siteUrl: deps.env.APP_URL });
  const posts = createPostService({ clock });
  const adminUsers = createAdminUsersService({ auth, passwordReset: recovery });
  const adminMetrics = createAdminMetricsService({ clock });
  const fanArts = createFanArtService();
  const reviews = createReviewService();
  const siteSettings = createSiteSettingsService();
  const newsletter = createNewsletterService({
    clock,
    mail,
    tasks,
    logger: deps.logger,
    appUrl: deps.env.APP_URL,
    unsubscribeSecret: deps.env.UNSUBSCRIBE_SECRET,
    webhookSecret: deps.env.RESEND_WEBHOOK_SECRET,
  });
  const notifications = createNotificationService({
    clock,
    mail,
    quota,
    tasks,
    logger: deps.logger,
    appUrl: deps.env.APP_URL,
    unsubscribeSecret: deps.env.UNSUBSCRIBE_SECRET,
    fromNews: deps.env.MAIL_FROM_NEWS,
  });
  const backups = createBackupDownloadService({
    clock,
    mail,
    tasks,
    logger: deps.logger,
    ...deps.backup,
  });

  const app = express();
  app.disable('x-powered-by');
  // Cuántos proxies de confianza hay delante (ver `TRUST_PROXY_HOPS`); de esto sale `req.ip`, la clave de los límites.
  app.set('trust proxy', deps.env.TRUST_PROXY_HOPS);
  // Con Cloudflare delante, la IP de la lectora sale de `CF-Connecting-IP` (respaldo: los saltos de arriba).
  app.use(createClientIpMiddleware(deps.env.TRUST_CLOUDFLARE_HEADER));

  app.use(
    pinoHttp({
      logger: deps.logger,
      // El diagnóstico de red muestra la cadena de proxies de quien lo abre: no se registra.
      autoLogging: {
        ignore: (req) =>
          req.url === '/api/health' || req.url?.startsWith('/api/admin/network-check') === true,
      },
      // El token del QR viaja en la URL de /access/resolve: nunca debe quedar en los logs.
      // Lista blanca: de cada petición solo se registra qué se pidió y cómo terminó. Nada de cabeceras (IP, navegador,
      // país, origen, referer) ni de la conexión: la política de privacidad dice que los registros no guardan la IP.
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: maskAccessToken(req.url),
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  // Todo lo que sirve el API es JSON o archivos para la aplicación: nunca debe aparecer en un buscador.
  app.use('/api', noIndex);
  app.use(cors({ origin: deps.env.CORS_ORIGIN, credentials: true }));
  // El informe de la política de contenido y el webhook de Resend tienen su propio lector (y van detrás de su límite).
  const json = express.json({ limit: '100kb' });
  const ownReader = new Set(['/api/csp-report', '/api/webhooks/resend']);
  app.use((req, res, next) => (ownReader.has(req.path) ? next() : json(req, res, next)));
  app.use(cookieParser());
  // Sin protección de mismo origen: la baja en un clic la manda el cliente de correo (no el sitio) y el webhook viene de
  // Resend. Ninguna usa cookies: las protege el token firmado o la firma Svix.
  const sameOrigin = createSameOriginGuard(deps.env.CORS_ORIGIN);
  const crossOriginOk = new Set(['/newsletter/unsubscribe', '/webhooks/resend']);
  app.use('/api', (req, res, next) =>
    crossOriginOk.has(req.path) ? next() : sameOrigin(req, res, next),
  );

  app.use(
    '/api',
    createApiRouter({
      game,
      google:
        deps.google ??
        (deps.env.GOOGLE_CLIENT_ID ? createGoogleVerifier(deps.env.GOOGLE_CLIENT_ID) : undefined),
      env: deps.env,
      isDbUp: deps.isDbUp,
      auth,
      account,
      recovery,
      contact,
      quizzes,
      progress,
      quizPublisher,
      quizAdmin,
      quizAppearance,
      books,
      wiki,
      images,
      access,
      extras,
      cards,
      welcome,
      publicBooks,
      library,
      publicWiki,
      sitemap,
      logger: deps.logger,
      posts,
      fanArts,
      adminUsers,
      adminMetrics,
      reviews,
      siteSettings,
      backups,
      newsletter,
      notifications,
      clock,
      requireUnlocked,
      guards,
      limits: scaleLimits({ ...DEFAULT_LIMITS, ...deps.limits }, limitFactor(deps.env)),
    }),
  );
  configure?.(app, { guards, auth });

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));

  if (deps.startWorkers) {
    // La cola vive en la base: se retoma al arrancar (Render puede reiniciar) y cada 5 minutos mientras esté despierto.
    const first = setTimeout(() => void notifications.tick(), 5_000);
    const every = setInterval(() => void notifications.tick(), 5 * 60_000);
    first.unref();
    every.unref();
    app.locals['stopWorkers'] = () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }
  return app;
}
