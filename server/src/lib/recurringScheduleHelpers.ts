import type { RecurringSchedule } from '@prisma/client';
import type { RecurringScheduleRule } from './recurringScheduler.js';

export function parseTriggerDates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function scheduleMatchesDate(
  schedule: Pick<
    RecurringSchedule,
    'frequency' | 'triggerDay' | 'triggerDates' | 'triggerMonth' | 'autoCreateStartDate' | 'autoCreateEndDate' | 'isActive'
  >,
  d: Date
): boolean {
  if (!schedule.isActive) return false;
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const start = new Date(schedule.autoCreateStartDate);
  start.setHours(0, 0, 0, 0);
  if (d < start) return false;
  if (schedule.autoCreateEndDate) {
    const end = new Date(schedule.autoCreateEndDate);
    end.setHours(23, 59, 59, 999);
    if (d > end) return false;
  }
  if (schedule.triggerDay && day !== schedule.triggerDay) return false;
  if (schedule.frequency === 'monthly') return true;
  if (schedule.frequency === 'quarterly') {
    const dates = parseTriggerDates(schedule.triggerDates);
    if (dates.length) {
      const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return dates.some((x) => x.endsWith(key) || x === key);
    }
    return true;
  }
  if (schedule.frequency === 'yearly' && schedule.triggerMonth) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const target = monthNames.findIndex((m) => schedule.triggerMonth!.toLowerCase().startsWith(m.toLowerCase())) + 1;
    return target === month;
  }
  return false;
}

export function computeNextCreateAt(
  schedule: Pick<
    RecurringSchedule,
    'frequency' | 'triggerDay' | 'triggerDates' | 'triggerMonth' | 'autoCreateStartDate' | 'autoCreateEndDate' | 'isActive'
  >,
  from = new Date()
): Date | null {
  if (!schedule.isActive) return null;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < 366; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (scheduleMatchesDate(schedule, d)) return d;
  }
  return null;
}

export function ruleToScheduleFields(rule: RecurringScheduleRule) {
  return {
    frequency: rule.frequency,
    triggerDay: rule.triggerDay ?? null,
    triggerTime: '09:00',
    triggerDates: rule.triggerMonths
      ? JSON.stringify(rule.triggerMonths.map((m) => `${String(m).padStart(2, '0')}-01`))
      : null,
    triggerMonth: rule.frequency === 'yearly' && rule.triggerMonths?.[0]
      ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][rule.triggerMonths[0] - 1]
      : null,
  };
}
