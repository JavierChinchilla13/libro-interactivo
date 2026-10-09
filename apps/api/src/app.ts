import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { DEFAULT_LIMITS, type Limits } from './config/limits.js';
import { createBackgroundTasks, type BackgroundTasks } from './lib/background.js';
import { systemClock, type Clock } from './lib/clock.js';
import type { Logger } from './lib/logger.js';
import { createGuards, type Guards } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.js';
import { createRequireUnlocked } from './middleware/unlocked.js';
import { createImageProvider, type ImageProvider } from './providers/images/ImageProvider.js';
import { S3StorageProvider, s3ConfigFromEnv } from './providers/storage/S3StorageProvider.js';
import {
  MemoryStorageProvider,
  type StorageProvider,
} from './providers/storage/StorageProvider.js';
import { createSameOriginGuard } from './middleware/sameOrigin.js';
import type { MailProvider } from './providers/mail/MailProvider.js';
import { createMailProvider } from './providers/mail/createMailProvider.js';
import { createApiRouter } from './routes/index.js';
import { createAccessService } from './services/access.service.js';
import { createPublicBookService } from './services/publicBook.service.js';
import { createAdminMetricsService } from './services/adminMetrics.service.js';
import { createAdminUsersService } from './services/adminUsers.service.js';
import { createFanArtService, createReviewService } from './services/community.service.js';
import { createPostService } from './services/post.service.js';
import { createPublicWikiService } from './services/publicWiki.service.js';
import { createSiteSettingsService } from './services/siteSettings.service.js';
import { createWelcomeService } from './services/welcome.service.js';
import { createExtraService } from './services/extra.service.js';
import { createAccountService } from './services/account.service.js';
import { createAuthService, type AuthService } from './services/auth.service.js';
import { createContactService } from './services/contact.service.js';
import { createPasswordResetService } from './services/passwordReset.service.js';
import { createProgressService } from './services/progress.service.js';
import { cryptoRandomInt, type RandomInt } from './services/quiz-engine.js';
import { createQuizService } from './services/quiz.service.js';
import { createQuizPublishService } from './services/quizPublish.service.js';
import { createBookService } from './services/book.service.js';
import { createQuizAdminService } from './services/quizAdmin.service.js';
import { createWikiService } from './services/wiki.service.js';
import { createTokenService } from './services/token.service.js';

/** Oculta el token de un QR en una URL (para logs). */
export function maskAccessToken(url: string | undefined): string | undefined {
  return url?.replace(/(\/access\/resolve\/)[^/?#]+/, '$1[REDACTADO]');
}

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
  /** Proveedor de imágenes (firma de subida); por defecto Cloudinary si hay credenciales. */
  images?: ImageProvider;
  /** Almacenamiento privado S3-compatible; por defecto el real si hay credenciales o uno en memoria. */
  storage?: StorageProvider;
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
  const mail = deps.mail ?? createMailProvider(deps.env, deps.logger);
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
  const quizPublisher = createQuizPublishService({ clock, quizzes });
  const requireUnlocked = createRequireUnlocked(progress);
  const quizAdmin = createQuizAdminService({ clock });
  const books = createBookService();
  const wiki = createWikiService();
  const images = deps.images ?? createImageProvider(deps.env);
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
  const welcome = createWelcomeService({ clock });
  const publicBooks = createPublicBookService();
  const publicWiki = createPublicWikiService();
  const posts = createPostService({ clock });
  const adminUsers = createAdminUsersService({ auth, passwordReset: recovery });
  const adminMetrics = createAdminMetricsService({ clock });
  const fanArts = createFanArtService();
  const reviews = createReviewService();
  const siteSettings = createSiteSettingsService();

  const app = express();
  app.disable('x-powered-by');
  if (deps.env.NODE_ENV === 'production') app.set('trust proxy', 1); // Render está detrás de un proxy

  app.use(
    pinoHttp({
      logger: deps.logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      // El token del QR viaja en la URL de /access/resolve: nunca debe quedar en los logs.
      serializers: { req: (req: { url?: string }) => ({ ...req, url: maskAccessToken(req.url) }) },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: deps.env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', createSameOriginGuard(deps.env.CORS_ORIGIN));

  app.use(
    '/api',
    createApiRouter({
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
      books,
      wiki,
      images,
      access,
      extras,
      welcome,
      publicBooks,
      publicWiki,
      posts,
      fanArts,
      adminUsers,
      adminMetrics,
      reviews,
      siteSettings,
      clock,
      requireUnlocked,
      guards,
      limits: { ...DEFAULT_LIMITS, ...deps.limits },
    }),
  );
  configure?.(app, { guards, auth });

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
