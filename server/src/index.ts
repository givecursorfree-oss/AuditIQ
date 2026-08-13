import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import prisma from './lib/prisma.js';
import logger from './lib/logger.js';
import { validateEnv, getClientOrigins } from './lib/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import engagementRoutes from './routes/engagements.js';
import workpaperRoutes from './routes/workpapers.js';
import documentRoutes from './routes/documents.js';
import attendanceRoutes from './routes/attendance.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import clientPortalRoutes from './routes/clientPortal.js';
import clientQueriesRoutes from './routes/clientQueries.js';
import auditLogRoutes from './routes/auditLog.js';
import signoffRoutes from './routes/signoffs.js';
import observationRoutes from './routes/observations.js';
import form3cdRoutes from './routes/form3cd.js';
import timeEntryRoutes from './routes/timeEntries.js';
import employeeRoutes from './routes/employees.js';
import presenceRoutes from './routes/presence.js';
import clientMasterRoutes from './routes/clientMaster.js';
import approvalRoutes from './routes/approvals.js';
import chatRoutes from './routes/chat.js';
import documentShareRoutes from './routes/documentShares.js';
import onboardingRoutes from './routes/onboarding.js';
import kycRoutes from './routes/kyc.js';
import engagementStageRoutes from './routes/engagementStages.js';
import workflowRoutes from './routes/workflow.js';
import dataChecklistRoutes from './routes/dataChecklist.js';
import taskRoutes from './routes/tasks.js';
import stipendRoutes from './routes/stipend.js';
import articleshipRoutes from './routes/articleship.js';
import passwordVaultRoutes from './routes/passwordVault.js';
import udinRoutes from './routes/udin.js';
import invoiceRoutes from './routes/invoices.js';
import commsRoutes from './routes/comms.js';
import managementReportsRoutes from './routes/managementReports.js';
import stopwatchRoutes from './routes/stopwatch.js';
import staffStatusRoutes from './routes/staffStatus.js';
import searchRoutes from './routes/search.js';
import googleDriveRoutes from './routes/googleDrive.js';
import configRoutes from './routes/config.js';
import navBadgeRoutes from './routes/navBadges.js';
import clientRequestRoutes from './routes/clientRequests.js';
import documentTemplateRoutes from './routes/documentTemplates.js';
import engagementLetterRoutes from './routes/engagementLetters.js';
import schedulerRoutes from './routes/scheduler.js';
import recurringSchedulesRoutes from './routes/recurringSchedules.js';
import timesheetsRoutes from './routes/timesheets.js';
import billingPendingRoutes from './routes/billingPending.js';
import claimsRoutes from './routes/claims.js';
import noticesRoutes from './routes/notices.js';
import portalsRoutes from './routes/portals.js';
import { startScheduler } from './lib/scheduler.js';
import { warnIfSchemaOutOfDate } from './lib/schemaHealth.js';
import { enqueueDocumentIndex, queuePendingDocumentIndexing } from './lib/documentIndexer.js';
import { canAccessEngagement } from './lib/engagementAccess.js';
import { registerChatSockets } from './lib/chatRealtime.js';
import type { AuthRequest } from './middleware/auth.js';
import { staffApi } from './middleware/staffApi.js';

dotenv.config();
const env = validateEnv();
const clientOrigins = getClientOrigins(env);

export { prisma };
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: clientOrigins,
    credentials: true,
  }
});

type SocketUser = NonNullable<AuthRequest['user']>;

function parseSocketToken(socket: Socket): SocketUser | null {
  const authToken = socket.handshake.auth?.token as string | undefined;
  const header = socket.handshake.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const cookieHeader = socket.handshake.headers.cookie || '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)auditiq_token=([^;]+)/);
  const token = authToken || bearer || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : null);
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as SocketUser;
  } catch {
    return null;
  }
}

io.use(async (socket, next) => {
  const user = parseSocketToken(socket);
  if (!user) {
    next(new Error('Authentication required'));
    return;
  }
  // JWT alone isn't enough — a deactivated user could hold a valid token
  // for up to 15 minutes. Verify the account is still active.
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isActive: true },
    });
    if (!dbUser?.isActive) {
      next(new Error('Account disabled'));
      return;
    }
  } catch {
    next(new Error('Authentication failed'));
    return;
  }
  socket.data.user = user;
  next();
});

// Real-time Collaboration WebSockets (authenticated)
io.on('connection', (socket) => {
  const user = socket.data.user as SocketUser;
  logger.info(`Socket connected: ${socket.id}`, { userId: user.id });

  // Personal room for targeted push (e.g. client portal notifications).
  socket.join(`user:${user.id}`);

  socket.on('join-workpaper', async ({ workpaperId, user: displayUser }, ack) => {
    const wp = await prisma.workpaper.findUnique({
      where: { id: workpaperId },
      select: { engagementId: true },
    });
    if (!wp) {
      ack?.({ ok: false, error: 'Workpaper not found' });
      return;
    }
    const allowed = await canAccessEngagement(user.id, user.role, user.firmId, wp.engagementId);
    if (!allowed) {
      ack?.({ ok: false, error: 'Access denied' });
      return;
    }
    socket.join(`workpaper:${workpaperId}`);
    socket.to(`workpaper:${workpaperId}`).emit('user-joined', displayUser);
    ack?.({ ok: true });
  });

  socket.on('leave-workpaper', ({ workpaperId, user: displayUser }) => {
    socket.leave(`workpaper:${workpaperId}`);
    socket.to(`workpaper:${workpaperId}`).emit('user-left', displayUser);
  });

  socket.on('workpaper-updated', async ({ workpaperId }) => {
    const wp = await prisma.workpaper.findUnique({
      where: { id: workpaperId },
      select: { engagementId: true },
    });
    if (!wp) return;
    const allowed = await canAccessEngagement(user.id, user.role, user.firmId, wp.engagementId);
    if (!allowed) return;
    socket.to(`workpaper:${workpaperId}`).emit('workpaper-updated');
  });

  socket.on('join-engagement', async ({ engagementId, user: displayUser }, ack) => {
    const allowed = await canAccessEngagement(user.id, user.role, user.firmId, engagementId);
    if (!allowed) {
      ack?.({ ok: false, error: 'Access denied' });
      return;
    }
    socket.join(`engagement:${engagementId}`);
    socket.to(`engagement:${engagementId}`).emit('engagement-user-joined', displayUser);
    ack?.({ ok: true });
  });

  socket.on('leave-engagement', ({ engagementId, user: displayUser }) => {
    socket.leave(`engagement:${engagementId}`);
    socket.to(`engagement:${engagementId}`).emit('engagement-user-left', displayUser);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

registerChatSockets(io);

// Export io for use in routes
export { io };

const PORT = env.PORT;

// Behind nginx/load balancer in production: trust the first proxy hop so
// req.ip and rate limiting use the real client IP, not the proxy's.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Keep-alive slightly above typical nginx upstream idle so connections reuse under load.
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;
httpServer.requestTimeout = 120_000;

// Security headers (OWASP best practice)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Cookies before rate limit so authenticated SPA traffic is keyed per user
// (CA firm offices share one public IP — IP-only buckets starve concurrent staff).
app.use(cookieParser());

// Rate limiting — off in development (local loops during debugging trip limits fast).
const isDev = env.NODE_ENV !== 'production';
const skipRateLimitInDev = () => isDev;

/** Prefer JWT subject for general limits; fall back to IP for anonymous. */
function generalRateLimitKey(req: express.Request): string {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const cookieToken = (req as express.Request & { cookies?: Record<string, string> }).cookies
    ?.auditiq_token;
  const token = bearer || cookieToken || null;
  if (token) {
    try {
      const payload = jwt.decode(token) as { id?: string } | null;
      if (payload?.id) return `user:${payload.id}`;
    } catch {
      /* fall through to IP */
    }
  }
  return ipKeyGenerator(req.ip || 'unknown');
}

// Strict limiter for credential-submitting endpoints only (brute-force defense).
// Always keyed by IP — do not use the user key here.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 50,
  skip: skipRateLimitInDev,
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many sign-in attempts from this device. Please wait a few minutes and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ~50 concurrent staff: per-user budget covers dashboard + badge polling without
// office-NAT collisions. Health checks skipped so Docker probes never burn quota.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 2500,
  skip: (req) => skipRateLimitInDev() || req.path === '/api/health',
  keyGenerator: generalRateLimitKey,
  message: {
    error: 'You are making requests too quickly. Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// Request logging
app.use(requestLogger);

// CORS — allow Vercel preview + custom app domain(s)
app.use(cors({
  origin(origin, cb) {
    if (!origin || clientOrigins.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  },
  credentials: true,
}));
// File uploads go through multer (multipart), so JSON bodies stay small.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API Routes
// Strict limiter applies ONLY to credential-submission endpoints. Auto-firing
// routes like /auth/me, /auth/refresh and /auth/logout are intentionally left
// on the general limiter so normal page loads/token refreshes never trip 429.
app.use(
  [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/register-client',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/2fa/verify',
  ],
  authLimiter,
);
app.use('/api/auth', authRoutes);
app.use('/api/clients', staffApi(clientRoutes));
app.use('/api/engagements', staffApi(engagementRoutes));
app.use('/api/workpapers', staffApi(workpaperRoutes));
app.use('/api/documents', staffApi(documentRoutes));
app.use('/api/attendance', staffApi(attendanceRoutes));
app.use('/api/reports', staffApi(reportRoutes));
app.use('/api/dashboard', staffApi(dashboardRoutes));
app.use('/api/notifications', notificationRoutes);
app.use('/api/nav-badges', navBadgeRoutes);
app.use('/api/admin', staffApi(adminRoutes));
app.use('/api/client', clientPortalRoutes);
app.use('/api/client-queries', staffApi(clientQueriesRoutes));
app.use('/api/audit-log', staffApi(auditLogRoutes));
app.use('/api/signoffs', staffApi(signoffRoutes));
app.use('/api/observations', staffApi(observationRoutes));
app.use('/api/form3cd', staffApi(form3cdRoutes));
app.use('/api/time-entries', staffApi(timeEntryRoutes));
app.use('/api/employees', staffApi(employeeRoutes));
app.use('/api/presence', staffApi(presenceRoutes));
app.use('/api/client-master', staffApi(clientMasterRoutes));
app.use('/api/approvals', staffApi(approvalRoutes));
app.use('/api/chat', chatRoutes);
app.use('/api/document-shares', documentShareRoutes);
app.use('/api/onboarding', staffApi(onboardingRoutes));
app.use('/api/kyc', staffApi(kycRoutes));
app.use('/api/engagement-stages', staffApi(engagementStageRoutes));
app.use('/api/workflow', staffApi(workflowRoutes));
app.use('/api/data-checklist', staffApi(dataChecklistRoutes));
app.use('/api/tasks', staffApi(taskRoutes));
app.use('/api/stipend', staffApi(stipendRoutes));
app.use('/api/articleship', staffApi(articleshipRoutes));
app.use('/api/vault', staffApi(passwordVaultRoutes));
app.use('/api/udin', staffApi(udinRoutes));
app.use('/api/invoices', staffApi(invoiceRoutes));
app.use('/api/comms', staffApi(commsRoutes));
app.use('/api/management-reports', staffApi(managementReportsRoutes));
app.use('/api/stopwatch', staffApi(stopwatchRoutes));
app.use('/api/staff', staffApi(staffStatusRoutes));
app.use('/api/search', staffApi(searchRoutes));
app.use('/api/integrations/google-drive', staffApi(googleDriveRoutes));
app.use('/api/config', configRoutes);
app.use('/api/requests', staffApi(clientRequestRoutes));
app.use('/api/templates', staffApi(documentTemplateRoutes));
app.use('/api/engagement-letters', staffApi(engagementLetterRoutes));
app.use('/api/scheduler', staffApi(schedulerRoutes));
app.use('/api/recurring-schedules', staffApi(recurringSchedulesRoutes));
app.use('/api/timesheets', staffApi(timesheetsRoutes));
app.use('/api/billing', staffApi(billingPendingRoutes));
app.use('/api/claims', staffApi(claimsRoutes));
app.use('/api/notices', staffApi(noticesRoutes));
app.use('/api/portals', staffApi(portalsRoutes));

// Health check
app.get('/api/health', async (_req, res) => {
  const checks: Record<string, string> = { api: 'ok' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }
  try {
    const tsHost = env.TYPESENSE_HOST.replace(/\/$/, '');
    const r = await fetch(`${tsHost}/health`, {
      headers: { 'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY },
      signal: AbortSignal.timeout(3000),
    });
    checks.typesense = r.ok ? 'ok' : 'error';
  } catch {
    checks.typesense = 'unreachable';
  }
  try {
    const r = await fetch(`${env.TIKA_URL.replace(/\/$/, '')}/tika`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    checks.tika = r.ok || r.status === 405 ? 'ok' : 'error';
  } catch {
    checks.tika = 'unreachable';
  }
  const healthy = checks.database === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    requestId: req.requestId,
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });
  res.status(500).json({ error: 'Internal server error' });
});

httpServer.listen(PORT, () => {
  logger.info(`AuditIQ Server running on http://localhost:${PORT}`, {
    env: process.env.NODE_ENV || 'development',
  });
  startScheduler();
  void warnIfSchemaOutOfDate();
  void backfillDocumentFirmIds();
  void initSemanticSearch();
  void queuePendingDocumentIndexing().catch((err) => {
    logger.warn('Document indexing queue skipped', { error: (err as Error).message });
  });
});

async function initSemanticSearch(): Promise<void> {
  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { isTypesenseReachable } = await import('./lib/searchServices.js');
      if (!(await isTypesenseReachable())) {
        logger.info('Semantic search: waiting for Typesense', { attempt, maxAttempts });
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const { migrateAllFirmCollections } = await import('./lib/typesense.js');
      const { reindexFirmDocuments } = await import('./lib/documentIndexer.js');
      const firms = await prisma.firm.findMany({ select: { id: true } });
      const upgraded = await migrateAllFirmCollections(firms.map((f) => f.id));
      for (const firmId of upgraded) {
        const count = await reindexFirmDocuments(firmId);
        logger.info('Semantic search: re-queued firm documents after index upgrade', { firmId, count });
      }
      if (upgraded.length > 0) {
        logger.info(`Semantic search: upgraded ${upgraded.length} firm collection(s) to hybrid embeddings`);
      } else {
        logger.info('Semantic search: Typesense reachable');
      }
      return;
    } catch (err) {
      logger.warn('Semantic search init attempt failed', {
        attempt,
        error: (err as Error).message,
      });
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  logger.info('Semantic search: Typesense unreachable after retries — using MySQL fallback');
}

async function backfillDocumentFirmIds(): Promise<void> {
  try {
    const docs = await prisma.document.findMany({
      where: { firmId: null, NOT: { engagementId: null } },
      include: { engagement: { select: { firmId: true, clientId: true } } },
      take: 500,
    });
    for (const d of docs) {
      if (!d.engagement) continue;
      await prisma.document.update({
        where: { id: d.id },
        data: {
          firmId: d.engagement.firmId,
          clientId: d.engagement.clientId,
          visibility: d.visibility || 'ENGAGEMENT',
          source: d.source || 'UPLOAD',
        },
      });
      enqueueDocumentIndex(d.id);
    }
    if (docs.length > 0) {
      logger.info(`Backfilled firmId on ${docs.length} document(s) and queued indexing`);
    }
  } catch (err) {
    logger.warn('Document backfill skipped', { error: (err as Error).message });
  }
}

export default app;
