import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firmId: string | null;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    const payload = jwt.verify(token, secret) as AuthRequest['user'];
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
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
      console.error('Permission check error:', err);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}
