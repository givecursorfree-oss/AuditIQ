import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { normalizeEmail } from '../lib/emailNormalize.js';
import { optionalString, optionalEmail } from '../lib/zodHelpers.js';

const router = Router();

// All admin routes require authentication + admin/partner permissions
router.use(authenticate);

// ─── ROLES ───

// GET /api/admin/roles — List all roles with permission counts
router.get('/roles', authorize('Partner', 'Admin'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });

    const result = roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isActive: r.isActive,
      userCount: r._count.users,
      permissions: r.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
      createdAt: r.createdAt,
    }));

    res.json(result);
  } catch (err) {
    logger.error('Fetch roles error:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// POST /api/admin/roles — Create a new role
const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
});

router.post('/roles', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createRoleSchema.parse(req.body);

    const existing = await prisma.role.findUnique({ where: { name: data.name } });
    if (existing) {
      res.status(409).json({ error: 'Role name already exists' });
      return;
    }

    const role = await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissionIds?.length
          ? {
              create: data.permissionIds.map((pid) => ({
                permissionId: pid,
              })),
            }
          : undefined,
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_ROLE',
        entity: 'Role',
        entityId: role.id,
        details: JSON.stringify({ name: role.name }),
        userId: req.user!.id,
      },
    });

    res.status(201).json({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      userCount: role._count.users,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create role error:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// PUT /api/admin/roles/:id — Update a role  
const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.string()).optional(),
});

router.put('/roles/:id', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const data = updateRoleSchema.parse(req.body);
    const { id } = req.params;

    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    // System roles: allow permission toggles; do not rename (JWT / hierarchy depend on name).
    if (existing.isSystem && data.name && data.name !== existing.name) {
      res.status(400).json({ error: 'System role names cannot be renamed' });
      return;
    }

    // Roles are global. Partners/Admins may update permissions for their firm operations.
    // Only block rename of a custom role that is still assigned outside this firm.
    if (data.name && data.name !== existing.name && !existing.isSystem) {
      const crossFirmUser = await prisma.user.findFirst({
        where: {
          roleId: id,
          OR: [{ firmId: null }, { firmId: { not: firmId } }],
        },
        select: { id: true },
      });
      if (crossFirmUser) {
        res.status(403).json({ error: 'Role is shared across firms and cannot be renamed' });
        return;
      }
    }

    // If permissionIds provided, replace all permissions
    if (data.permissionIds !== undefined) {
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      if (data.permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: data.permissionIds.map((pid) => ({ roleId: id, permissionId: pid })),
        });
      }
    }

    const role = await prisma.role.update({
      where: { id },
      data: {
        name: existing.isSystem ? existing.name : data.name,
        description: data.description,
        isActive: data.isActive,
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_ROLE',
        entity: 'Role',
        entityId: role.id,
        details: JSON.stringify({ changes: data }),
        userId: req.user!.id,
      },
    });

    res.json({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      userCount: role._count.users,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/admin/roles/:id
router.delete('/roles/:id', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const { id } = req.params;

    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    if (role.isSystem) {
      res.status(403).json({ error: 'Cannot delete system roles' });
      return;
    }

    // Role table is global (no firmId): block mutations on roles used by other tenants
    const crossFirmUser = await prisma.user.findFirst({
      where: {
        roleId: id,
        OR: [{ firmId: null }, { firmId: { not: firmId } }],
      },
      select: { id: true },
    });
    if (crossFirmUser) {
      res.status(403).json({ error: 'Role is shared across firms and cannot be modified' });
      return;
    }

    if (role._count.users > 0) {
      res.status(409).json({ error: 'Cannot delete role with assigned users. Reassign users first.' });
      return;
    }

    await prisma.role.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'DELETE_ROLE',
        entity: 'Role',
        entityId: id,
        details: JSON.stringify({ name: role.name }),
        userId: req.user!.id,
      },
    });

    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    logger.error('Delete role error:', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// ─── PERMISSIONS ───

// GET /api/admin/permissions — List all available permissions
router.get('/permissions', authorize('Partner', 'Admin'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    res.json(permissions);
  } catch (err) {
    logger.error('Fetch permissions error:', err);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// ─── USERS ───

// GET /api/admin/users — List all users with roles
router.get('/users', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { firmId: req.user!.firmId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        initials: true,
        role: true,
        roleId: true,
        roleRef: { select: { id: true, name: true } },
        designation: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
    });
    res.json(users);
  } catch (err) {
    logger.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id — Update user (role assignment, toggle active)
const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  roleId: z.string().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

router.put('/users/:id', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const data = updateUserSchema.parse(req.body);
    const { id } = req.params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing || existing.firmId !== firmId) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If roleId changes, also update the legacy role string
    let legacyRole: string | undefined;
    if (data.roleId) {
      const role = await prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) {
        res.status(400).json({ error: 'Invalid role ID' });
        return;
      }
      legacyRole = role.name;
    }

    const initials = data.firstName && data.lastName
      ? (data.firstName[0] + data.lastName[0]).toUpperCase()
      : undefined;

    if (legacyRole === 'Partner' && req.user!.role !== 'Partner') {
      res.status(403).json({ error: 'Only Partners can assign the Partner role' });
      return;
    }
    if (id === req.user!.id && legacyRole && legacyRole !== existing.role) {
      res.status(403).json({ error: 'You cannot change your own role' });
      return;
    }

    const { password, ...profileFields } = data;
    const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

    const user = await prisma.user.update({
      where: { id },
      data: {
        firstName: profileFields.firstName,
        lastName: profileFields.lastName,
        designation: profileFields.designation,
        phone: profileFields.phone,
        roleId: profileFields.roleId,
        role: legacyRole,
        isActive: profileFields.isActive,
        initials,
        ...(passwordHash
          ? { passwordHash, refreshTokenHash: null, refreshToken: null }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        initials: true,
        role: true,
        roleId: true,
        roleRef: { select: { id: true, name: true } },
        designation: true,
        phone: true,
        isActive: true,
      },
    });

    if (passwordHash) {
      await prisma.clientPortalUser.updateMany({
        where: { userId: id },
        data: { passwordHash },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_USER',
        entity: 'User',
        entityId: user.id,
        details: JSON.stringify({
          changes: {
            ...profileFields,
            ...(passwordHash ? { passwordChanged: true } : {}),
          },
        }),
        userId: req.user!.id,
      },
    });

    res.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/admin/users — Create a new user (admin creates for firm)
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roleId: z.string(),
  designation: z.string().optional(),
  phone: z.string().optional(),
});

router.post('/users', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createUserSchema.parse(req.body);
    const email = normalizeEmail(data.email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) {
      res.status(400).json({ error: 'Invalid role ID' });
      return;
    }
    if (role.name === 'Partner' && req.user!.role !== 'Partner') {
      res.status(403).json({ error: 'Only Partners can create Partner accounts' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const initials = (data.firstName[0] + data.lastName[0]).toUpperCase();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        initials,
        role: role.name,
        roleId: role.id,
        designation: data.designation,
        phone: data.phone,
        firmId: req.user!.firmId,
        emailVerified: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        initials: true,
        role: true,
        roleId: true,
        roleRef: { select: { id: true, name: true } },
        designation: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_USER',
        entity: 'User',
        entityId: user.id,
        details: JSON.stringify({ email: user.email, role: role.name }),
        userId: req.user!.id,
      },
    });

    res.status(201).json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── FIRM SETTINGS ───

// GET /api/admin/firm — Get firm details
router.get('/firm', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firm = await prisma.firm.findFirst({
      where: { users: { some: { id: req.user!.id } } },
    });

    if (!firm) {
      res.status(404).json({ error: 'Firm not found' });
      return;
    }

    res.json(firm);
  } catch (err) {
    logger.error('Fetch firm error:', err);
    res.status(500).json({ error: 'Failed to fetch firm details' });
  }
});

// PUT /api/admin/firm — Update firm settings
const updateFirmSchema = z.object({
  name: z.string().min(1).optional(),
  registrationNo: optionalString,
  pan: optionalString,
  gstin: optionalString,
  address: optionalString,
  city: optionalString,
  state: optionalString,
  pincode: optionalString,
  phone: optionalString,
  email: optionalEmail,
  website: optionalString,
});

router.put('/firm', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateFirmSchema.parse(req.body);

    const firm = await prisma.firm.findFirst({
      where: { users: { some: { id: req.user!.id } } },
    });

    if (!firm) {
      res.status(404).json({ error: 'Firm not found' });
      return;
    }

    const updated = await prisma.firm.update({
      where: { id: firm.id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_FIRM',
        entity: 'Firm',
        entityId: firm.id,
        details: JSON.stringify({ changes: data }),
        userId: req.user!.id,
      },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update firm error:', err);
    res.status(500).json({ error: 'Failed to update firm settings' });
  }
});

// ─── AUDIT LOGS ───

// GET /api/admin/audit-logs — View audit trail
router.get('/audit-logs', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const firmScope = { user: { firmId } };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: firmScope,
        include: {
          user: { select: { firstName: true, lastName: true, initials: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: firmScope }),
    ]);

    res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error('Fetch audit logs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
