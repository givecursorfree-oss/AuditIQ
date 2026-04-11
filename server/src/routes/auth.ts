import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['Partner', 'Manager', 'Staff', 'Client']).optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const initials = (data.firstName[0] + data.lastName[0]).toUpperCase();

    // Create firm if this is the first user (Partner)
    let firmId: string | null = null;
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const firm = await prisma.firm.create({
        data: {
          name: 'M/s Sharma & Associates',
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
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        initials,
        role: data.role || (userCount === 0 ? 'Partner' : 'Staff'),
        designation: data.designation,
        phone: data.phone,
        firmId,
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, firmId: user.firmId },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
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
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { roleRef: { select: { id: true, name: true } } },
    });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, firmId: user.firmId },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    // Log the login action
    await prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
      },
    });

    res.json({
      token,
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
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        initials: true, role: true, designation: true, phone: true,
        firmId: true, isActive: true, createdAt: true,
        roleRef: { select: { id: true, name: true } },
        firm: { select: { id: true, name: true } },
      },
    });

    if (!user || !user.isActive) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
