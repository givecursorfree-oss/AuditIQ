import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const clientSchema = z.object({
  name: z.string().min(1),
  cin: z.string().optional(),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  category: z.string().optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  turnover: z.string().optional(),
});

// GET /api/clients
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, category, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = { firmId: req.user!.firmId! };
    if (search) {
      where.OR = [
        { name: { contains: String(search) } },
        { cin: { contains: String(search) } },
        { pan: { contains: String(search) } },
      ];
    }
    if (category) where.category = String(category);

    const [clients, total] = await Promise.all([
      prisma.client.findMany({ where, skip, take: Number(limit), orderBy: { name: 'asc' } }),
      prisma.client.count({ where }),
    ]);

    res.json({ clients, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('List clients error:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      include: { engagements: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json(client);
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// POST /api/clients
router.post('/', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = clientSchema.parse(req.body);
    const client = await prisma.client.create({
      data: { ...data, firmId: req.user!.firmId! },
    });
    res.status(201).json(client);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id
router.put('/:id', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = clientSchema.partial().parse(req.body);
    const client = await prisma.client.updateMany({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      data,
    });
    if (client.count === 0) { res.status(404).json({ error: 'Client not found' }); return; }
    const updated = await prisma.client.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', authorize('Partner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await prisma.client.updateMany({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      data: { isActive: false },
    });
    if (result.count === 0) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json({ message: 'Client deactivated' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
