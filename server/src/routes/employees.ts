import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../index.js';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.js';
import {
  canViewSensitiveEmployeeData,
  isSelfOnlyEmployeeRole,
  canDownloadEmployeeDocument,
} from '../lib/employeeAccess.js';
import { getUserPermissionKeys } from '../lib/permissions.js';
import logger from '../lib/logger.js';
import { getEnv } from '../lib/env.js';
import { validateBufferSignature } from '../lib/fileSignature.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const uploadDir = path.join(process.cwd(), getEnv().UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/** Tenant guard: the target user must belong to the requesting user's firm. */
async function requireUserInFirm(req: AuthRequest, res: Response, userId: string): Promise<boolean> {
  if (!req.user!.firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return false;
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, firmId: req.user!.firmId },
    select: { id: true },
  });
  if (!user) {
    res.status(404).json({ error: 'Employee not found' });
    return false;
  }
  return true;
}

/** Tenant guard: document must belong to an employee of the requesting user's firm. */
async function findEmployeeDocInFirm(req: AuthRequest, docId: string) {
  return prisma.employeeDocument.findFirst({
    where: {
      id: docId,
      employeeProfile: { user: { firmId: req.user!.firmId ?? '__none__' } },
    },
  });
}

/** Firm guard for tenant-scoped employee routes. */
function requireFirm(req: AuthRequest, res: Response): boolean {
  if (!req.user!.firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return false;
  }
  return true;
}

// All routes require authentication
router.use(authenticate);

// ─── Workload Summary (for assignment intelligence) ───

// GET /api/employees/workload-summary — returns workload metrics for all firm employees
router.get('/workload-summary', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const firmId = req.user!.firmId!;
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const employees = await prisma.user.findMany({
      where: { firmId, isActive: true, role: { in: ['Partner', 'Manager', 'Staff'] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        initials: true,
        role: true,
        designation: true,
      },
    });

    const employeeIds = employees.map((e) => e.id);

    // Active engagements per employee (as partner, manager, or article)
    const engagements = await prisma.engagement.findMany({
      where: {
        firmId,
        status: { notIn: ['Closed', 'Archived'] },
        OR: [
          { partnerInChargeId: { in: employeeIds } },
          { managerId: { in: employeeIds } },
          { articleAssistantId: { in: employeeIds } },
        ],
      },
      select: {
        id: true,
        currentStage: true,
        deadline: true,
        partnerInChargeId: true,
        managerId: true,
        articleAssistantId: true,
      },
    });

    // Leave requests overlapping today
    const activeLeaves = await prisma.leaveRequest.findMany({
      where: {
        userId: { in: employeeIds },
        status: { in: ['Approved', 'Manager Approved'] },
        fromDate: { lte: sevenDaysLater },
        toDate: { gte: now },
      },
      select: { userId: true, fromDate: true, toDate: true, type: true },
    });

    // Billable hours this week
    const weeklyHours = await prisma.timeEntry.groupBy({
      by: ['userId'],
      where: {
        userId: { in: employeeIds },
        date: { gte: weekStart },
        isBillable: true,
      },
      _sum: { hours: true },
    });
    const hoursMap = new Map(weeklyHours.map((h) => [h.userId, h._sum.hours || 0]));

    const leaveSet = new Set(activeLeaves.filter((l) => l.fromDate <= now && l.toDate >= now).map((l) => l.userId));

    const result = employees.map((emp) => {
      const myEngagements = engagements.filter(
        (e) => e.partnerInChargeId === emp.id || e.managerId === emp.id || e.articleAssistantId === emp.id
      );
      const activeCount = myEngagements.length;

      const stageDistribution: Record<string, number> = {};
      for (const e of myEngagements) {
        stageDistribution[e.currentStage] = (stageDistribution[e.currentStage] || 0) + 1;
      }

      const upcomingDeadlines = myEngagements
        .filter((e) => e.deadline && e.deadline <= sevenDaysLater && e.deadline >= now)
        .length;

      const isOnLeave = leaveSet.has(emp.id);
      const billableHoursThisWeek = hoursMap.get(emp.id) || 0;

      let availability: 'Available' | 'Engaged' | 'On Leave' = 'Available';
      if (isOnLeave) availability = 'On Leave';
      else if (activeCount >= 3) availability = 'Engaged';

      return {
        ...emp,
        activeEngagements: activeCount,
        stageDistribution,
        upcomingDeadlines,
        billableHoursThisWeek,
        availability,
        highWorkload: activeCount >= 3,
        isOnLeave,
        leaveInfo: activeLeaves.filter((l) => l.userId === emp.id),
      };
    });

    res.json(result);
  } catch (err) {
    logger.error('Workload summary error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch workload summary' });
  }
});

// ─── Employee Profile CRUD ───

// GET /api/employees — list all employees (Partners/Admins/Managers see all; Staff/Intern see own)
router.get('/', requirePermission('employees', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const { role, firmId, id: userId } = req.user!;
    const { search, department } = req.query;
    const showSensitive = canViewSensitiveEmployeeData(role, await getUserPermissionKeys(userId, role));

    const where: Record<string, unknown> = { firmId, isActive: true };
    if (isSelfOnlyEmployeeRole(role)) {
      where.id = userId;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: String(search) } },
        { lastName: { contains: String(search) } },
        { email: { contains: String(search) } },
      ];
    }
    if (department) {
      where.employeeProfile = { department: String(department) };
    }

    const employees = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        initials: true,
        email: true,
        role: true,
        designation: true,
        phone: true,
        isActive: true,
        presenceStatus: true,
        presenceUpdatedAt: true,
        reportsToId: true,
        reportsTo: { select: { firstName: true, lastName: true } },
        hierarchyLevelId: true,
        hierarchyLevel: { select: { id: true, code: true, title: true, sortOrder: true } },
        employeeProfile: {
          select: {
            id: true,
            pan: true,
            aadhaar: true,
            joiningDate: true,
            department: true,
            employeeCode: true,
            employmentType: true,
          },
        },
      },
      orderBy: { firstName: 'asc' },
    });

    const sanitized = employees.map((emp) => {
      if (!emp.employeeProfile || showSensitive) return emp;
      return {
        ...emp,
        employeeProfile: {
          ...emp.employeeProfile,
          pan: null,
          aadhaar: null,
        },
      };
    });

    res.json(sanitized);
  } catch (err) {
    logger.error('Failed to list employees', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list employees' });
  }
});

// GET /api/employees/:id — full employee profile
router.get('/:id', requirePermission('employees', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, id: userId } = req.user!;
    const { id } = req.params;
    const showSensitive = canViewSensitiveEmployeeData(role, await getUserPermissionKeys(userId, role));

    if (isSelfOnlyEmployeeRole(role) && id !== userId) {
      res.status(403).json({ error: 'You can only view your own profile' });
      return;
    }

    // Tenant guard: target must be in the same firm as the caller
    const user = await prisma.user.findFirst({
      where: { id, firmId: req.user!.firmId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        initials: true,
        email: true,
        role: true,
        designation: true,
        phone: true,
        isActive: true,
        presenceStatus: true,
        presenceUpdatedAt: true,
        reportsToId: true,
        reportsTo: { select: { id: true, firstName: true, lastName: true } },
        employeeProfile: {
          include: {
            ...(showSensitive ? { salaryStructure: true } : {}),
            employeeDocuments: {
              select: {
                id: true,
                docType: true,
                originalName: true,
                mimeType: true,
                size: true,
                uploadedAt: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const profile = user.employeeProfile;
    const payload =
      profile && !showSensitive
        ? {
            ...user,
            employeeProfile: {
              ...profile,
              pan: null,
              aadhaar: null,
              salaryStructure: undefined,
            },
          }
        : user;

    res.json(payload);
  } catch (err) {
    logger.error('Failed to get employee', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get employee' });
  }
});

// ─── Profile Update ───

const profileSchema = z.object({
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  maritalStatus: z.string().optional(),
  fatherName: z.string().optional(),
  pan: z.string().max(10).optional(),
  aadhaar: z.string().max(12).optional(),
  passportNo: z.string().optional(),
  uanNumber: z.string().optional(),
  currentAddress: z.string().optional(),
  currentCity: z.string().optional(),
  currentState: z.string().optional(),
  currentPincode: z.string().optional(),
  permanentAddress: z.string().optional(),
  permanentCity: z.string().optional(),
  permanentState: z.string().optional(),
  permanentPincode: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyRelation: z.string().optional(),
  emergencyPhone: z.string().optional(),
  joiningDate: z.string().optional(),
  department: z.string().optional(),
  employeeCode: z.string().optional(),
  employmentType: z.string().optional(),
  probationEnd: z.string().optional(),
});

// PUT /api/employees/:id/profile — upsert profile
router.put('/:id/profile', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!(await requireUserInFirm(req, res, id))) return;
    const data = profileSchema.parse(req.body);

    // Convert date strings to Date objects
    const parsed: Record<string, unknown> = { ...data };
    for (const key of ['dateOfBirth', 'joiningDate', 'probationEnd']) {
      if (parsed[key]) parsed[key] = new Date(parsed[key] as string);
    }

    const profile = await prisma.employeeProfile.upsert({
      where: { userId: id },
      update: parsed,
      create: { userId: id, ...parsed },
    });

    res.json(profile);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to update employee profile', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─── Salary Structure ───

const salarySchema = z.object({
  basicSalary: z.number().min(0),
  hra: z.number().min(0).default(0),
  da: z.number().min(0).default(0),
  specialAllowance: z.number().min(0).default(0),
  conveyance: z.number().min(0).default(0),
  medicalAllowance: z.number().min(0).default(0),
  otherAllowances: z.number().min(0).default(0),
  pf: z.number().min(0).default(0),
  esi: z.number().min(0).default(0),
  professionalTax: z.number().min(0).default(0),
  tds: z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
  ctc: z.number().min(0).default(0),
  effectiveFrom: z.string().optional(),
});

// PUT /api/employees/:id/salary — upsert salary (Partner/Admin only)
router.put('/:id/salary', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!(await requireUserInFirm(req, res, id))) return;
    const data = salarySchema.parse(req.body);

    // Ensure profile exists
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: id } });
    if (!profile) {
      res.status(404).json({ error: 'Employee profile not found. Create profile first.' });
      return;
    }

    const parsed = {
      ...data,
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
    };

    const salary = await prisma.salaryStructure.upsert({
      where: { employeeProfileId: profile.id },
      update: parsed,
      create: { employeeProfileId: profile.id, ...parsed },
    });

    res.json(salary);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to update salary', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update salary' });
  }
});

// ─── Employee Documents ───

// POST /api/employees/:id/documents — upload employee document
router.post('/:id/documents', authorize('Partner', 'Admin', 'Manager'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const file = req.file;
    const { docType } = req.body;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const signatureError = validateBufferSignature(file.buffer, file.originalname);
    if (signatureError) {
      res.status(400).json({ error: signatureError });
      return;
    }
    if (!docType) {
      res.status(400).json({ error: 'docType is required' });
      return;
    }

    // Tenant guard: target employee must be in the requesting user's firm
    const employee = await prisma.user.findFirst({
      where: { id, firmId: req.user!.firmId ?? '__none__' },
      select: { id: true },
    });
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Ensure profile exists
    let profile = await prisma.employeeProfile.findUnique({ where: { userId: id } });
    if (!profile) {
      profile = await prisma.employeeProfile.create({ data: { userId: id } });
    }

    const storedName = `employee-doc-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
    const storagePath = path.join(uploadDir, storedName);
    fs.writeFileSync(storagePath, file.buffer);

    const doc = await prisma.employeeDocument.create({
      data: {
        employeeProfileId: profile.id,
        docType,
        fileName: storedName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
      },
    });

    res.status(201).json({
      id: doc.id,
      docType: doc.docType,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
      uploadedAt: doc.uploadedAt,
    });
  } catch (err) {
    logger.error('Failed to upload employee document', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/employees/:id/documents/:docId/download
router.get('/:id/documents/:docId/download', requirePermission('employees', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: employeeUserId, docId } = req.params;
    const { role, id: userId } = req.user!;
    const keys = await getUserPermissionKeys(userId, role);
    if (
      !canDownloadEmployeeDocument(role, keys, userId, employeeUserId)
    ) {
      res.status(403).json({ error: 'Insufficient permissions to download this document' });
      return;
    }

    const doc = await findEmployeeDocInFirm(req, String(docId));
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const profile = await prisma.employeeProfile.findUnique({
      where: { id: doc.employeeProfileId },
      select: { userId: true },
    });
    if (!profile || profile.userId !== employeeUserId) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (!doc.storagePath || !fs.existsSync(doc.storagePath)) {
      res.status(404).json({ error: 'File missing from server disk' });
      return;
    }

    res.download(path.resolve(doc.storagePath), doc.originalName);
  } catch (err) {
    logger.error('Failed to download employee document', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// DELETE /api/employees/:id/documents/:docId
router.delete('/:id/documents/:docId', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const { id: employeeUserId, docId } = req.params;
    const doc = await findEmployeeDocInFirm(req, String(docId));
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const profile = await prisma.employeeProfile.findUnique({
      where: { id: doc.employeeProfileId },
      select: { userId: true },
    });
    if (!profile || profile.userId !== employeeUserId) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    await prisma.employeeDocument.delete({ where: { id: doc.id } });
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      fs.unlinkSync(doc.storagePath);
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete employee document', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ─── Update hierarchy (reporting manager) ───

const hierarchySchema = z.object({
  reportsToId: z.string().min(1).nullable().optional(),
});

router.put('/:id/hierarchy', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!(await requireUserInFirm(req, res, id))) return;
    const { reportsToId } = hierarchySchema.parse(req.body);

    if (reportsToId) {
      const manager = await prisma.user.findFirst({
        where: { id: reportsToId, firmId: req.user!.firmId! },
        select: { id: true },
      });
      if (!manager) {
        res.status(404).json({ error: 'Reporting manager not found in your firm' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: { reportsToId: reportsToId || null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        reportsToId: true,
        reportsTo: { select: { firstName: true, lastName: true } },
      },
    });

    res.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to update hierarchy', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update hierarchy' });
  }
});

export default router;
