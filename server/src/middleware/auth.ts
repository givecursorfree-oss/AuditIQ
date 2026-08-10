import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';
import logger from '../lib/logger.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firmId: string | null;
  };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token =
    req.cookies?.auditiq_token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as NonNullable<AuthRequest['user']>;
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, firmId: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firmId: user.firmId,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Block Client-role users from internal staff APIs. */
export function requireStaff(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role === 'Client') {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }
  next();
}

// Legacy role-based authorization (checks role name string)
export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

// Dynamic permission-based authorization (checks database permissions)
export function requirePermission(module: string, action: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      // Admin/Partner bypass — always allowed
      if (req.user.role === 'Admin' || req.user.role === 'Partner') {
        next();
        return;
      }

      // Check user's role permissions from database
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          roleRef: {
            select: {
              permissions: {
                select: {
                  permission: { select: { module: true, action: true } },
                },
              },
            },
          },
        },
      });

      const permissions = user?.roleRef?.permissions?.map((rp) => rp.permission) || [];
      const hasPermission = permissions.some(
        (p) => p.module === module && p.action === action
      );

      if (!hasPermission) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    } catch (err) {
      logger.error('Permission check error', { error: (err as Error).message });
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}
