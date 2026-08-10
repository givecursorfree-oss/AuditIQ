import { Prisma } from '@prisma/client';

export function isDatabaseUnreachableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P1001' || err.code === 'P1017';
  }
  const msg = (err as Error)?.message ?? '';
  return msg.includes("Can't reach database server") || msg.includes('ECONNREFUSED');
}

export const DATABASE_UNAVAILABLE_MESSAGE =
  'Cannot connect to MySQL. In XAMPP Control Panel, click Stop then Start on MySQL. Use DATABASE_URL=mysql://root@127.0.0.1:3306/auditiq in server/.env (not localhost on Windows).';
