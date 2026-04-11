import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/copilot/sessions
router.get('/sessions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessions = await prisma.copilotSession.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    res.json(sessions);
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// POST /api/copilot/sessions
router.post('/sessions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, title } = req.body;
    const session = await prisma.copilotSession.create({
      data: {
        userId: req.user!.id,
        engagementId: engagementId || null,
        title: title || 'New Chat',
      },
    });
    res.status(201).json(session);
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/copilot/sessions/:id/messages
router.get('/sessions/:id/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const messages = await prisma.copilotMessage.findMany({
      where: { sessionId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (err) {
    console.error('List messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/copilot/sessions/:id/messages — send a message & get AI response
router.post('/sessions/:id/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { content } = req.body;
    if (!content) { res.status(400).json({ error: 'Message content is required' }); return; }

    // Save user message
    const userMsg = await prisma.copilotMessage.create({
      data: {
        sessionId: req.params.id,
        role: 'user',
        content,
      },
    });

    // AI response (placeholder — will be replaced with real AI integration)
    const aiResponse = generateAIResponse(content);

    const assistantMsg = await prisma.copilotMessage.create({
      data: {
        sessionId: req.params.id,
        role: 'assistant',
        content: aiResponse,
      },
    });

    // Update session timestamp
    await prisma.copilotSession.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// DELETE /api/copilot/sessions/:id
router.delete('/sessions/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.copilotMessage.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.copilotSession.delete({ where: { id: req.params.id } });
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ─── AI Response Generation (placeholder) ───
function generateAIResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.includes('sa 500') || q.includes('audit evidence')) {
    return `**SA 500 – Audit Evidence**\n\nSA 500 requires auditors to obtain sufficient appropriate audit evidence to draw reasonable conclusions. Key aspects:\n\n• **Sufficiency**: Quantity of evidence (affected by risk assessment and quality)\n• **Appropriateness**: Quality — relevance and reliability\n• **Methods**: Inspection, observation, external confirmation, recalculation, reperformance, analytical procedures, inquiry\n\nFor the current engagement, ensure all workpapers document the evidence obtained and link to specific assertions.`;
  }

  if (q.includes('form 3cd') || q.includes('tax audit') || q.includes('clause')) {
    return `**Form 3CD — Tax Audit Report**\n\nForm 3CD contains 44 clauses as per Section 44AB. Key areas:\n\n• **Clauses 1-12**: Basic information (name, address, PAN, business nature)\n• **Clauses 13-20**: Accounting methods, deviations, changes\n• **Clauses 21-30**: Specific deductions (depreciation, Sec 40A, 43B)\n• **Clauses 31-44**: TDS compliance, GST reconciliation, MSME payments\n\nI can help you draft specific clause responses. Which clause would you like to work on?`;
  }

  if (q.includes('materiality') || q.includes('material')) {
    return `**Materiality Assessment**\n\nPer SA 320, consider the following benchmarks for Indian entities:\n\n| Benchmark | Typical % | Use Case |\n|---|---|---|\n| Profit Before Tax | 5-10% | Profit-making entities |\n| Total Revenue | 0.5-1% | Revenue-based approach |\n| Total Assets | 1-2% | Asset-heavy entities |\n| Total Equity | 2-5% | Equity-based approach |\n\nPerformance materiality is typically set at 50-75% of overall materiality. Clearly trivial threshold is usually 3-5% of overall materiality.`;
  }

  return `I can help with:\n\n• **Audit Standards**: SA 200-810 guidance and application\n• **Tax Compliance**: Form 3CD clauses, Section 44AB, TDS requirements\n• **Workpaper Review**: Check completeness and quality of documentation\n• **Risk Assessment**: Industry-specific risk factors and procedures\n• **Indian Regulations**: Companies Act 2013, ICAI guidelines, SEBI requirements\n\nPlease ask a specific question about your audit engagement, and I'll provide detailed guidance.`;
}

export default router;
