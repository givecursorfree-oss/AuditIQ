import { PrismaClient } from '@prisma/client';
import { withPrismaPoolParams } from './dbUrl.js';

const databaseUrl = process.env.DATABASE_URL
  ? withPrismaPoolParams(process.env.DATABASE_URL)
  : undefined;

const prisma = new PrismaClient(
  databaseUrl
    ? {
        datasources: {
          db: { url: databaseUrl },
        },
      }
    : undefined
);

export default prisma;
