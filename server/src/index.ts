import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import prisma from './lib/prisma.js';
import logger from './lib/logger.js';
import { validateEnv } from './lib/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import engagementRoutes from './routes/engagements.js';
import workpaperRoutes from './routes/workpapers.js';
import documentRoutes from './routes/documents.js';
import attendanceRoutes from './routes/attendance.js';
import reportRoutes from './routes/reports.js';
import copilotRoutes from './routes/copilot.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import clientPortalRoutes from './routes/clientPortal.js';
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
import { startScheduler } from './lib/scheduler.js';

dotenv.config();
const env = validateEnv();

export { prisma };
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: env.CLIENT_URL,
    credentials: true,
  }
});

// Real-time Collaboration WebSockets
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Workpaper collaboration
  socket.on('join-workpaper', ({ workpaperId, user }) => {
    socket.join(`workpaper:${workpaperId}`);
    socket.to(`workpaper:${workpaperId}`).emit('user-joined', user);
  });

  socket.on('leave-workpaper', ({ workpaperId, user }) => {
    socket.leave(`workpaper:${workpaperId}`);
    socket.to(`workpaper:${workpaperId}`).emit('user-left', user);
  });

  socket.on('workpaper-updated', ({ workpaperId }) => {
    socket.to(`workpaper:${workpaperId}`).emit('workpaper-updated');
  });

  // Engagement-scoped rooms
  socket.on('join-engagement', ({ engagementId, user }) => {
    socket.join(`engagement:${engagementId}`);
    socket.to(`engagement:${engagementId}`).emit('engagement-user-joined', user);
  });

  socket.on('leave-engagement', ({ engagementId, user }) => {
    socket.leave(`engagement:${engagementId}`);
    socket.to(`engagement:${engagementId}`).emit('engagement-user-left', user);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Export io for use in routes
export { io };

const PORT = env.PORT;

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

// Rate limiting — relaxed in development, strict in production
const isDev = env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 20, // relaxed in dev
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 5000 : 200, // relaxed in dev
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// Request logging
app.use(requestLogger);

// CORS
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/workpapers', workpaperRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientPortalRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/signoffs', signoffRoutes);
app.use('/api/observations', observationRoutes);
app.use('/api/form3cd', form3cdRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/client-master', clientMasterRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/document-shares', documentShareRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/engagement-stages', engagementStageRoutes);
app.use('/api/data-checklist', dataChecklistRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/stipend', stipendRoutes);
app.use('/api/articleship', articleshipRoutes);
app.use('/api/vault', passwordVaultRoutes);
app.use('/api/udin', udinRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/comms', commsRoutes);
app.use('/api/management-reports', managementReportsRoutes);
app.use('/api/stopwatch', stopwatchRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
});

export default app;
