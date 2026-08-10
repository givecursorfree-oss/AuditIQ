import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../index.js';
import { getEnv } from '../lib/env.js';
import { isEmailVerificationRequired } from '../lib/emailVerification.js';
import logger from '../lib/logger.js';
import { isDatabaseUnreachableError, DATABASE_UNAVAILABLE_MESSAGE } from '../lib/dbErrors.js';
import { normalizeEmail } from '../lib/emailNormalize.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  generateToken,
  hashToken,
  isLocked,
  lockoutRemainingMinutes,
  failedAttemptUpdate,
  LOCKOUT_THRESHOLD,
  maskPan,
  consumeHandoffJti,
} from '../lib/authSecurity.js';
import { generateTotpSecret, verifyTotp, totpAuthUri } from '../lib/totp.js';
import { encryptSecret, decryptSecret } from '../lib/vaultCrypto.js';

const router = Router();

const COOKIE_NAME = 'auditiq_token';
const TWO_FA_ROLES = ['Partner', 'Admin'];

function setTokensCookie(res: Response, accessToken: string, refreshToken?: string): void {
  const isProduction = getEnv().NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 mins
    path: '/',
  });
  if (refreshToken) {
    res.cookie('auditiq_refresh', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh',
    });
  }
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['Partner', 'Manager', 'Staff']).optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  firmName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const PASSWORD_STRENGTH = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

const clientRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  entityType: z.enum([
    'Individual', 'Proprietorship', 'Partnership', 'LLP',
    'Private Limited', 'Public Limited', 'Trust', 'HUF', 'Other',
  ]),
  entityName: z.string().min(1),
  pan: z.string().regex(PAN_REGEX, 'Invalid PAN format'),
  gstin: z.string().optional(),
  mobile: z.string().regex(MOBILE_REGEX, 'Invalid mobile number'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.socket.remoteAddress ?? undefined;
}

async function resolveDefaultFirmId(): Promise<string> {
  const firm = await prisma.firm.findFirst({ orderBy: { createdAt: 'asc' } });
  if (firm) return firm.id;
  const created = await prisma.firm.create({
    data: { name: 'AuditIQ Platform Firm', city: 'Mumbai', state: 'Maharashtra' },
  });
  return created.id;
}

// POST /api/auth/register-client — self-service client registration
router.post('/register-client', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = clientRegisterSchema.parse(req.body);

    if (!PASSWORD_STRENGTH.test(data.password)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 number, and 1 special character',
      });
      return;
    }

    if (data.gstin && data.entityType !== 'Individual' && !GSTIN_REGEX.test(data.gstin)) {
      res.status(400).json({ error: 'Invalid GSTIN format' });
      return;
    }

    const email = normalizeEmail(data.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const existingPan = await prisma.client.findFirst({ where: { pan: data.pan.toUpperCase() } });
    if (existingPan) {
      res.status(409).json({ error: 'A client with this PAN is already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const requireVerification = isEmailVerificationRequired();
    const verificationToken = requireVerification ? crypto.randomBytes(32).toString('hex') : null;
    const verificationExpires = requireVerification
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : null;
    const firmId = await resolveDefaultFirmId();
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } });
    const initials = (data.firstName[0] + (data.lastName?.[0] || data.entityName[0] || 'C')).toUpperCase();

    const clientRole = await prisma.role.findFirst({
      where: { name: 'Client' },
      select: { id: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: data.entityName,
          legalName: data.entityName,
          pan: data.pan.toUpperCase(),
          gstin: data.gstin?.toUpperCase() || null,
          category: data.entityType,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          contactName: data.firstName,
          contactEmail: email,
          contactPhone: data.mobile,
          status: 'Prospect',
          firmId,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName || '',
          initials,
          role: 'Client',
          roleId: clientRole?.id ?? null,
          phone: data.mobile,
          firmId,
          emailVerified: !requireVerification,
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
      });

      await tx.clientPortalUser.create({
        data: {
          clientId: client.id,
          userId: user.id,
          email,
          passwordHash,
          fullName: data.entityName,
          mobile: data.mobile,
        },
      });

      const admins = await tx.user.findMany({
        where: { firmId, role: { in: ['Partner', 'Admin'] }, isActive: true },
        select: { id: true },
      });

      await tx.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          title: 'New client registered',
          message: `New client registered: ${data.entityName} (${data.entityType} — PAN: ${maskPan(data.pan.toUpperCase())}). Awaiting first engagement request.`,
          type: 'info' as const,
          link: `/clients?tab=incoming`,
        })),
      });

      await tx.auditLog.create({
        data: {
          action: 'REGISTER',
          entity: 'Client',
          entityId: client.id,
          userId: user.id,
          details: JSON.stringify({ entityType: data.entityType, pan: maskPan(data.pan.toUpperCase()) }),
          ipAddress: clientIp(req),
        },
      });

      return { user, client, firmName: firm?.name ?? 'Your CA Firm' };
    });

    if (requireVerification && verificationToken) {
      const verifyUrl = `${getEnv().CLIENT_URL}/verify-email?token=${verificationToken}`;
      const { sendEmail } = await import('../lib/emailService.js');
      await sendEmail({
        to: email,
        subject: 'Verify your AuditIQ account',
        body: `<p>Dear ${data.firstName},</p>
          <p>Thank you for registering with ${result.firmName}. Please verify your email to access your client portal.</p>
          <p><a href="${verifyUrl}">Verify Email Address</a></p>
          <p>This link expires in 24 hours.</p>`,
        clientId: result.client.id,
        templateKey: 'email-verification',
      });
    }

    res.status(201).json({
      message: requireVerification
        ? 'Account created. Please verify your email to continue.'
        : 'Account created. You can sign in now.',
      email,
      emailVerificationRequired: requireVerification,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Client register error', { error: (err as Error).message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/auth/verify-email?token=...
router.get('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.query.token || '');
    if (!token) {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification link' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
      });

      await tx.notification.create({
        data: {
          userId: user.id,
          title: 'Welcome to AuditIQ',
          message: 'Welcome to AuditIQ. You can now submit your first engagement request.',
          type: 'success',
          link: '/client/dashboard',
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'EMAIL_VERIFIED',
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          ipAddress: clientIp(req),
        },
      });
    });

    res.json({ message: 'Email verified successfully', redirectTo: '/client/dashboard' });
  } catch (err) {
    logger.error('Email verify error', { error: (err as Error).message });
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/register — staff signup (disabled in production unless ALLOW_STAFF_REGISTRATION=true)
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0 && !getEnv().ALLOW_STAFF_REGISTRATION) {
      res.status(403).json({
        error: 'Staff registration is disabled. Ask your firm administrator for an account.',
      });
      return;
    }

    const data = registerSchema.parse(req.body);
    const email = normalizeEmail(data.email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const initials = (data.firstName[0] + data.lastName[0]).toUpperCase();

    // Privilege-escalation guard: only the bootstrap (first) user may be Partner.
    // Later self-registrations are always created as Staff — elevated roles must
    // be granted by an admin from Settings, never self-assigned.
    const role = userCount === 0 ? 'Partner' : 'Staff';
    if (userCount > 0 && data.role && data.role !== 'Staff') {
      logger.warn('Self-registration requested elevated role — coerced to Staff', {
        email,
        requestedRole: data.role,
      });
    }

    // Create firm if this is the first user (Partner)
    let firmId: string | null = null;
    if (userCount === 0) {
      const firm = await prisma.firm.create({
        data: {
          name: data.firmName || 'M.K. Dandeker & Co LLP',
          city: 'Mumbai',
          state: 'Maharashtra',
        },
      });
      firmId = firm.id;
    } else {
      const firstUser = await prisma.user.findFirst({ where: { firmId: { not: null } } });
      firmId = firstUser?.firmId ?? null;
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        initials,
        role,
        designation: data.designation,
        phone: data.phone,
        firmId,
        emailVerified: true,
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, firmId: user.firmId },
      getEnv().JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refreshToken = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashToken(refreshToken), refreshToken: null },
    });

    setTokensCookie(res, token, refreshToken);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        initials: user.initials,
        role: user.role,
        designation: user.designation,
        firmId: user.firmId,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Register error', { error: (err as Error).message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

// POST /api/auth/forgot-password — always returns success (no account enumeration)
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (user?.isActive) {
      const resetToken = generateToken(32);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: hashToken(resetToken),
          passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      const resetUrl = `${getEnv().CLIENT_URL}/reset-password?token=${resetToken}`;
      const { sendEmail } = await import('../lib/emailService.js');
      await sendEmail({
        to: user.email,
        subject: 'Reset your AuditIQ password',
        body: `<p>Dear ${user.firstName},</p>
          <p>We received a request to reset your AuditIQ password. Click the link below to set a new password:</p>
          <p><a href="${resetUrl}">Reset Password</a></p>
          <p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>`,
        templateKey: 'password-reset',
      });

      await prisma.auditLog.create({
        data: {
          action: 'PASSWORD_RESET_REQUESTED',
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          ipAddress: clientIp(req),
        },
      });
    }
    res.json({
      message: 'If an account exists for this email, you will receive password reset instructions shortly.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
    logger.error('Forgot password error', { error: (err as Error).message });
    res.status(500).json({ error: 'Unable to process request' });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

// POST /api/auth/reset-password — completes the reset using the emailed token
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    if (!PASSWORD_STRENGTH.test(password)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 number, and 1 special character',
      });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpires: null,
          // Reset lockout and revoke all sessions — old refresh tokens die with the old password
          failedLoginCount: 0,
          lockedUntil: null,
          refreshTokenHash: null,
          refreshToken: null,
        },
      }),
      // Keep the client portal credential in sync when one exists
      prisma.clientPortalUser.updateMany({
        where: { userId: user.id },
        data: { passwordHash },
      }),
      prisma.auditLog.create({
        data: {
          action: 'PASSWORD_RESET',
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          ipAddress: clientIp(req),
        },
      }),
    ]);

    res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Reset password error', { error: (err as Error).message });
    res.status(500).json({ error: 'Unable to reset password' });
  }
});

type LoginUser = NonNullable<
  Awaited<ReturnType<typeof findLoginUser>>
>;

function findLoginUser(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: {
      roleRef: { select: { id: true, name: true } },
      firm: { select: { id: true, name: true } },
    },
  });
}

/** Issues access + refresh tokens, marks presence, writes the audit log, and responds. */
async function issueSession(
  req: Request,
  res: Response,
  user: LoginUser,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, firmId: user.firmId },
    getEnv().JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = generateToken();
  const staffRoles = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'];
  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshTokenHash: hashToken(refreshToken),
      refreshToken: null, // clear any legacy plaintext token
      failedLoginCount: 0,
      lockedUntil: null,
      ...(staffRoles.includes(user.role)
        ? { presenceStatus: 'online', presenceUpdatedAt: new Date() }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      ipAddress: clientIp(req),
    },
  });

  setTokensCookie(res, token, refreshToken);

  const { getUserPermissionKeys } = await import('../lib/permissions.js');
  const permissions = await getUserPermissionKeys(user.id, user.role);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      initials: user.initials,
      role: user.role,
      roleRef: user.roleRef,
      designation: user.designation,
      firmId: user.firmId,
      firm: user.firm ?? undefined,
      presenceStatus: staffRoles.includes(user.role) ? 'online' : user.presenceStatus,
      twoFactorEnabled: user.twoFactorEnabled,
      permissions,
    },
    ...extra,
  });
}

// POST /api/auth/consume-portal-handoff — staff opens client portal in a new tab (2-minute token)
router.post('/consume-portal-handoff', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
      res.status(401).json({
        error: 'This portal link has expired. Return to the engagement and open Client portal again.',
      });
      return;
    }
    if (payload.typ !== 'portal_handoff' || typeof payload.userId !== 'string' || typeof payload.jti !== 'string') {
      res.status(401).json({ error: 'Invalid portal handoff token' });
      return;
    }
    if (!consumeHandoffJti(payload.jti)) {
      res.status(401).json({ error: 'This portal link has already been used. Open Client portal again.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        roleRef: { select: { id: true, name: true } },
        firm: { select: { id: true, name: true } },
      },
    });
    if (!user || user.role !== 'Client' || !user.isActive) {
      res.status(403).json({ error: 'Client portal account is not available' });
      return;
    }

    await issueSession(req, res, user, {
      engagementId: typeof payload.engagementId === 'string' ? payload.engagementId : null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Consume portal handoff error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to sign in to client portal' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);
    const email = normalizeEmail(data.email);

    let user = await findLoginUser(email);
    let pendingLegacyMigration: string | null = null;

    // Legacy accounts registered before email normalization: locate them, but
    // only migrate the email AFTER the password is verified — an unauthenticated
    // request must never be able to rewrite account emails.
    if (!user) {
      const legacyEmail = data.email.trim();
      if (legacyEmail !== email) {
        const legacyUser = await findLoginUser(legacyEmail);
        if (legacyUser) {
          user = legacyUser;
          pendingLegacyMigration = legacyEmail;
        }
      }
    }

    if (!user || !user.isActive) {
      // Equalize timing with a dummy compare so missing accounts aren't detectable
      await bcrypt.compare(data.password, '$2a$12$invalidsaltinvalidsaltinvalidsaltinvalid');
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (isLocked(user)) {
      res.status(429).json({
        error: `Account temporarily locked due to repeated failed sign-ins. Try again in ${lockoutRemainingMinutes(user)} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
      return;
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      const update = failedAttemptUpdate(user.failedLoginCount);
      await prisma.user.update({ where: { id: user.id }, data: update });
      if (update.lockedUntil) {
        logger.warn('Account locked after repeated failed logins', { userId: user.id });
        res.status(429).json({
          error: `Too many failed attempts (${LOCKOUT_THRESHOLD}). Account locked for 15 minutes.`,
          code: 'ACCOUNT_LOCKED',
        });
        return;
      }
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Password verified — now it is safe to migrate the legacy email
    if (pendingLegacyMigration) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { email } }),
        prisma.clientPortalUser.updateMany({ where: { userId: user.id }, data: { email } }),
      ]);
      user = (await findLoginUser(email)) ?? user;
    }

    if (isEmailVerificationRequired() && user.role === 'Client' && !user.emailVerified) {
      res.status(403).json({
        error: 'Please verify your email before logging in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }

    // TOTP 2FA — password alone is not enough when enabled
    if (user.twoFactorEnabled && user.totpSecret) {
      const preAuthToken = jwt.sign(
        { id: user.id, scope: '2fa-pending' },
        getEnv().JWT_SECRET,
        { expiresIn: '5m' }
      );
      res.json({ twoFactorRequired: true, preAuthToken });
      return;
    }

    await issueSession(req, res, user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    if (isDatabaseUnreachableError(err)) {
      logger.error('Login error — database unreachable', { error: (err as Error).message });
      res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE, code: 'DATABASE_UNAVAILABLE' });
      return;
    }
    logger.error('Login error', { error: (err as Error).message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/2fa/verify — completes a 2FA-gated login
const twoFaVerifySchema = z.object({
  preAuthToken: z.string().min(10),
  code: z.string().min(6).max(8),
});

router.post('/2fa/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { preAuthToken, code } = twoFaVerifySchema.parse(req.body);

    let payload: { id: string; scope?: string };
    try {
      payload = jwt.verify(preAuthToken, getEnv().JWT_SECRET) as { id: string; scope?: string };
    } catch {
      res.status(401).json({ error: 'Sign-in session expired. Please enter your password again.' });
      return;
    }
    if (payload.scope !== '2fa-pending') {
      res.status(401).json({ error: 'Invalid sign-in session' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: {
        roleRef: { select: { id: true, name: true } },
        firm: { select: { id: true, name: true } },
      },
    });
    if (!user || !user.isActive || !user.totpSecret) {
      res.status(401).json({ error: 'Invalid sign-in session' });
      return;
    }

    if (isLocked(user)) {
      res.status(429).json({ error: 'Account temporarily locked. Try again later.', code: 'ACCOUNT_LOCKED' });
      return;
    }

    const secret = decryptSecret(user.totpSecret);
    if (!verifyTotp(secret, code)) {
      const update = failedAttemptUpdate(user.failedLoginCount);
      await prisma.user.update({ where: { id: user.id }, data: update });
      res.status(401).json({ error: 'Invalid authentication code. Please try again.' });
      return;
    }

    await issueSession(req, res, user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }
    logger.error('2FA verify error', { error: (err as Error).message });
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/2fa/setup — generates a TOTP secret (Partner/Admin only)
router.post('/2fa/setup', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!TWO_FA_ROLES.includes(req.user!.role)) {
      res.status(403).json({ error: 'Two-factor authentication is available for Partner and Admin accounts' });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorEnabled: true },
    });
    if (existing?.twoFactorEnabled) {
      res.status(400).json({
        error: 'Two-factor authentication is already enabled. Disable it first to set up a new authenticator.',
      });
      return;
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: encryptSecret(secret) },
    });

    res.json({
      secret,
      otpauthUri: totpAuthUri(secret, req.user!.email),
      message: 'Scan or enter this secret in your authenticator app, then confirm with a code to enable 2FA.',
    });
  } catch (err) {
    logger.error('2FA setup error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to set up two-factor authentication' });
  }
});

// POST /api/auth/2fa/enable — confirms the secret with a live code
router.post('/2fa/enable', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = String(req.body?.code || '');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, totpSecret: true },
    });
    if (!user?.totpSecret) {
      res.status(400).json({ error: 'Run 2FA setup first' });
      return;
    }

    if (!verifyTotp(decryptSecret(user.totpSecret), code)) {
      res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await prisma.auditLog.create({
      data: { action: '2FA_ENABLED', entity: 'User', entityId: user.id, userId: user.id, ipAddress: clientIp(req) },
    });
    res.json({ message: 'Two-factor authentication enabled' });
  } catch (err) {
    logger.error('2FA enable error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to enable two-factor authentication' });
  }
});

// POST /api/auth/2fa/disable — requires current password + valid code
router.post('/2fa/disable', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const password = String(req.body?.password || '');
    const code = String(req.body?.code || '');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, passwordHash: true, totpSecret: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled || !user.totpSecret) {
      res.status(400).json({ error: 'Two-factor authentication is not enabled' });
      return;
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    const codeOk = verifyTotp(decryptSecret(user.totpSecret), code);
    if (!passwordOk || !codeOk) {
      res.status(401).json({ error: 'Password and a valid authenticator code are required to disable 2FA' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, totpSecret: null },
    });
    await prisma.auditLog.create({
      data: { action: '2FA_DISABLED', entity: 'User', entityId: user.id, userId: user.id, ipAddress: clientIp(req) },
    });
    res.json({ message: 'Two-factor authentication disabled' });
  } catch (err) {
    logger.error('2FA disable error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to disable two-factor authentication' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user) {
    const staffRoles = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'];
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        refreshToken: null,
        refreshTokenHash: null,
        ...(staffRoles.includes(req.user.role)
          ? { presenceStatus: 'offline', presenceUpdatedAt: new Date() }
          : {}),
      },
    });
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.clearCookie('auditiq_refresh', { path: '/api/auth/refresh' });
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        initials: true, role: true, designation: true, phone: true,
        firmId: true, isActive: true, createdAt: true, emailVerified: true,
        presenceStatus: true, presenceUpdatedAt: true, twoFactorEnabled: true,
        roleRef: { select: { id: true, name: true } },
        hierarchyLevel: { select: { id: true, code: true, title: true } },
        firm: { select: { id: true, name: true } },
      },
    });

    if (!user || !user.isActive) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { getUserPermissionKeys } = await import('../lib/permissions.js');
    const permissions = await getUserPermissionKeys(user.id, user.role);
    res.json({ ...user, permissions });
  } catch (err) {
    logger.error('Auth/me error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.auditiq_refresh;
    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token provided' });
      return;
    }

    // Primary lookup by hash; fall back to legacy plaintext column for
    // sessions issued before this hardening (migrated to hash on rotation).
    let user = await prisma.user.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
    });
    if (!user) {
      user = await prisma.user.findFirst({ where: { refreshToken } });
    }

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // Generate new tokens (rotation: old token is invalidated)
    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, firmId: user.firmId },
      getEnv().JWT_SECRET,
      { expiresIn: '15m' }
    );
    const newRefreshToken = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashToken(newRefreshToken), refreshToken: null },
    });

    setTokensCookie(res, newToken, newRefreshToken);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Refresh error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

export default router;
