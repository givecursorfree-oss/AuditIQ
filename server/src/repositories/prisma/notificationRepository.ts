import prisma from '../../lib/prisma.js';
import type { NotificationRepository } from '../ports.js';

export const prismaNotificationRepository: NotificationRepository = {
  async notifyFirmPartners({ firmId, title, message, link }) {
    const partners = await prisma.user.findMany({
      where: { firmId, role: { in: ['Partner', 'Admin', 'Manager'] }, isActive: true },
      select: { id: true },
    });
    if (!partners.length) return;
    await prisma.notification.createMany({
      data: partners.map((u) => ({
        userId: u.id,
        title,
        message,
        type: 'info' as const,
        link,
      })),
    });
  },
};
