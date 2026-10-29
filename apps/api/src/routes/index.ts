import { Router } from 'express';
import type { Env } from '../config/env.js';
import type { Limits } from '../config/limits.js';
import { createGameController } from '../controllers/game.controller.js';
import type { GameService } from '../services/game.service.js';
import type { GoogleVerifier } from '../services/google.service.js';
import { createAdminGameRouter, createGameRouter } from './game.routes.js';
import {
  createAdminPostController,
  createPublicPostController,
} from '../controllers/post.controller.js';
import {
  createAdminFanArtController,
  createAdminReviewController,
  createPublicCommunityController,
} from '../controllers/community.controller.js';
import {
  createAdminMetricsController,
  createAdminNetworkController,
  createAdminUsersController,
} from '../controllers/adminOps.controller.js';
import { createPublicWikiController } from '../controllers/publicWiki.controller.js';
import { createAccountController } from '../controllers/account.controller.js';
import {
  createAdminBookController,
  createAdminQuizEditorController,
  createAdminUploadController,
  createAdminWikiController,
} from '../controllers/admin.controller.js';
import {
  createAccessController,
  createAdminAccessController,
  createAdminExtraController,
  createReaderExtraController,
} from '../controllers/access.controller.js';
import { createQuizController, createAdminQuizController } from '../controllers/quiz.controller.js';
import {
  createAdminSiteController,
  createPublicBookController,
  createPublicSiteController,
  createWelcomeController,
} from '../controllers/site.controller.js';
import type { Clock } from '../lib/clock.js';
import type { ImageProvider } from '../providers/images/ImageProvider.js';
import type { LibraryService } from '../services/library.service.js';
import type { PublicBookService } from '../services/publicBook.service.js';
import type { FanArtService, ReviewService } from '../services/community.service.js';
import type { AdminMetricsService } from '../services/adminMetrics.service.js';
import type { AdminUsersService } from '../services/adminUsers.service.js';
import type { PostService } from '../services/post.service.js';
import type { PublicWikiService } from '../services/publicWiki.service.js';
import type { SiteSettingsService } from '../services/siteSettings.service.js';
import type { WelcomeService } from '../services/welcome.service.js';
import type { AccessService } from '../services/access.service.js';
import type { ExtraService } from '../services/extra.service.js';
import type { BookService } from '../services/book.service.js';
import type { QuizAdminService } from '../services/quizAdmin.service.js';
import type { QuizAppearanceService } from '../services/quizAppearance.service.js';
import type { WikiService } from '../services/wiki.service.js';
import type { Guards } from '../middleware/auth.js';
import type { RequireUnlocked } from '../middleware/unlocked.js';
import type { AccountService } from '../services/account.service.js';
import type { AuthService } from '../services/auth.service.js';
import type { ContactService } from '../services/contact.service.js';
import type { PasswordResetService } from '../services/passwordReset.service.js';
import type { ProgressService } from '../services/progress.service.js';
import type { QuizService } from '../services/quiz.service.js';
import type { QuizPublishService } from '../services/quizPublish.service.js';
import { createAccountRouter } from './account.routes.js';
import {
  createAccessRouter,
  createAdminAccessRouter,
  createAdminExtraRouter,
  createReaderExtraRouter,
} from './access.routes.js';
import {
  createAdminBookRouter,
  createAdminUploadRouter,
  createAdminWikiRouter,
} from './admin.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { createContactRouter } from './contact.routes.js';
import { createHealthRouter } from './health.routes.js';
import {
  createAdminFanArtRouter,
  createAdminReviewRouter,
  createPublicFanArtRouter,
  createPublicReviewRouter,
} from './community.routes.js';
import {
  createAdminMessagesRouter,
  createAdminNetworkRouter,
  createAdminStatsRouter,
  createAdminUsersRouter,
} from './adminOps.routes.js';
import { createAdminPostRouter, createPublicPostRouter } from './post.routes.js';
import { createPublicWikiRouter } from './publicWiki.routes.js';
import {
  createAdminSiteRouter,
  createPublicBookRouter,
  createPublicSiteRouter,
  createWelcomeRouter,
} from './site.routes.js';
import {
  createAdminQuizRouter,
  createAttemptRouter,
  createLearningRouter,
  createQuizRouter,
} from './quiz.routes.js';

export interface RouteDeps {
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN' | 'TRUST_PROXY_HOPS' | 'TRUST_CLOUDFLARE_HEADER'>;
  isDbUp: () => boolean;
  auth: AuthService;
  account: AccountService;
  recovery: PasswordResetService;
  contact: ContactService;
  quizzes: QuizService;
  progress: ProgressService;
  library: LibraryService;
  quizPublisher: QuizPublishService;
  quizAdmin: QuizAdminService;
  quizAppearance: QuizAppearanceService;
  books: BookService;
  wiki: WikiService;
  images: ImageProvider;
  access: AccessService;
  welcome: WelcomeService;
  publicBooks: PublicBookService;
  publicWiki: PublicWikiService;
  posts: PostService;
  adminUsers: AdminUsersService;
  adminMetrics: AdminMetricsService;
  fanArts: FanArtService;
  reviews: ReviewService;
  siteSettings: SiteSettingsService;
  extras: ExtraService;
  clock: Clock;
  requireUnlocked: RequireUnlocked;
  game: GameService;
  guards: Guards;
  limits: Limits;
  /** Verificador de Google; sin él (no hay GOOGLE_CLIENT_ID) `POST /auth/google` responde 404. */
  google?: GoogleVerifier | undefined;
}

/** Router raíz de `/api`. Cada módulo (auth, quizzes, …) monta aquí su propio router. */
export function createApiRouter(deps: RouteDeps): Router {
  const accountController = createAccountController(deps.account, deps.env);
  const quizController = createQuizController(deps.quizzes, deps.progress, deps.library);
  const router = Router();
  router.use('/health', createHealthRouter(deps.isDbUp));
  router.use(
    '/auth',
    createAuthRouter({
      auth: deps.auth,
      recovery: deps.recovery,
      account: accountController,
      guards: deps.guards,
      env: deps.env,
      limits: deps.limits,
      google: deps.google,
    }),
  );
  router.use('/me', createAccountRouter(accountController, deps.guards, deps.limits));
  router.use('/me', createLearningRouter(quizController, deps.guards));
  router.use('/me', createWelcomeRouter(createWelcomeController(deps.welcome), deps.guards));
  router.use('/site', createPublicSiteRouter(createPublicSiteController(deps.siteSettings)));
  router.use(
    '/wiki',
    createPublicWikiRouter(createPublicWikiController(deps.publicWiki), deps.guards),
  );
  router.use('/posts', createPublicPostRouter(createPublicPostController(deps.posts)));
  // Piso de seguridad de TODO `/admin`: sin sesión no se entra, y una lectora recibe 403, aunque a un router nuevo se le
  // olvide su propio guard. Los routers de solo administradoras exigen además `ADMIN` por su cuenta.
  router.use('/admin', deps.guards.requireAuth, deps.guards.requireRole('EDITOR', 'ADMIN'));
  router.use(
    '/admin/posts',
    createAdminPostRouter(createAdminPostController(deps.posts), deps.guards),
  );
  const metrics = createAdminMetricsController(deps.adminMetrics);
  router.use(
    '/admin/users',
    createAdminUsersRouter(createAdminUsersController(deps.adminUsers), deps.guards),
  );
  router.use('/admin/contact-messages', createAdminMessagesRouter(metrics, deps.guards));
  router.use('/admin/stats', createAdminStatsRouter(metrics, deps.guards));
  router.use(
    '/admin/network-check',
    createAdminNetworkRouter(
      createAdminNetworkController(deps.env.TRUST_PROXY_HOPS, deps.env.TRUST_CLOUDFLARE_HEADER),
      deps.guards,
    ),
  );
  const community = createPublicCommunityController(deps.fanArts, deps.reviews);
  router.use('/fan-arts', createPublicFanArtRouter(community));
  router.use('/reviews', createPublicReviewRouter(community));
  router.use(
    '/admin/fan-arts',
    createAdminFanArtRouter(createAdminFanArtController(deps.fanArts), deps.guards),
  );
  router.use(
    '/admin/reviews',
    createAdminReviewRouter(createAdminReviewController(deps.reviews), deps.guards),
  );
  router.use('/books', createPublicBookRouter(createPublicBookController(deps.publicBooks)));
  router.use(
    '/admin/site-settings',
    createAdminSiteRouter(createAdminSiteController(deps.siteSettings), deps.guards),
  );
  router.use('/contact', createContactRouter(deps.contact, deps.limits));
  const gameController = createGameController(deps.game);
  router.use('/game', createGameRouter(gameController, deps.guards));
  router.use('/admin/game-stories', createAdminGameRouter(gameController, deps.guards));
  router.use('/quizzes', createQuizRouter(quizController, deps.guards, deps.requireUnlocked));
  router.use('/attempts', createAttemptRouter(quizController, deps.guards));
  router.use(
    '/admin/quizzes',
    createAdminQuizRouter(
      createAdminQuizController(deps.quizPublisher),
      createAdminQuizEditorController(deps.quizAdmin, deps.quizAppearance),
      deps.guards,
      deps.limits,
    ),
  );
  router.use(
    '/access',
    createAccessRouter(createAccessController(deps.access), deps.guards, deps.limits),
  );
  router.use(
    '/admin/access-tokens',
    createAdminAccessRouter(createAdminAccessController(deps.access), deps.guards),
  );
  router.use(
    '/admin/extras',
    createAdminExtraRouter(createAdminExtraController(deps.extras), deps.guards),
  );
  router.use(
    '/extras',
    createReaderExtraRouter(createReaderExtraController(deps.extras), deps.guards),
  );
  router.use(
    '/admin/books',
    createAdminBookRouter(createAdminBookController(deps.books), deps.guards),
  );
  router.use(
    '/admin/wiki',
    createAdminWikiRouter(createAdminWikiController(deps.wiki), deps.guards),
  );
  router.use(
    '/admin/uploads',
    createAdminUploadRouter(
      createAdminUploadController(deps.images, deps.clock),
      deps.guards,
      deps.limits,
    ),
  );
  return router;
}
