import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from './auth.js';
import { apiPathAllowedForHierarchy } from '../lib/hierarchyAccess.js';

/**
 * Enforces MKD hierarchy API scope for HR, Accounts, and limited office roles.
 * Partner and Admin always pass.
 */
export async function enforceHierarchyScope(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    next();
    return;
  }

  if (req.user.role === 'Partner' || req.user.role === 'Admin') {
    next();
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { hierarchyLevel: { select: { code: true } } },
    });

    const code = user?.hierarchyLevel?.code;
    if (!code) {
      next();
      return;
    }

    const path = req.originalUrl.split('?')[0];
    if (!apiPathAllowedForHierarchy(code, path)) {
      res.status(403).json({
        error: 'Access restricted for your MKD role',
        code: 'HIERARCHY_SCOPE_DENIED',
      });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: 'Failed to verify role scope' });
  }
}
