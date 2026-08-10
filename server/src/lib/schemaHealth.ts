import prisma from './prisma.js';
import logger from './logger.js';

const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'Attendance', column: 'totalActiveSeconds' },
  { table: 'ClientStopwatch', column: 'stage' },
  { table: 'StaffWorkStatus', column: 'userId' },
  { table: 'Engagement', column: 'workflowDomain' },
];

/** Warn at startup when migrations were not applied (timer, presence, workflow break). */
export async function warnIfSchemaOutOfDate(): Promise<void> {
  try {
    const missing: string[] = [];
    for (const { table, column } of REQUIRED_COLUMNS) {
      const rows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*) AS cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${table}
          AND COLUMN_NAME = ${column}
      `;
      if (Number(rows[0]?.cnt ?? 0) === 0) {
        missing.push(`${table}.${column}`);
      }
    }
    if (missing.length > 0) {
      logger.error('Database schema is out of date — new features will fail', {
        missing,
        fix: 'Run from project root: npm run db:migrate',
      });
    }
  } catch (err) {
    logger.warn('Could not verify database schema', { error: (err as Error).message });
  }
}
