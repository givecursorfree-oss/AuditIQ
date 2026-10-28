/**
 * Run: npx --yes tsx src/lib/timesheetSubmitMail.selfcheck.ts
 */
import { recentWeekdayKeysBefore } from './timesheetWeekdayGaps.js';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

// 2026-04-01 is Wednesday → prior 7 weekdays: Mar 31,30,27,26,25,24,23
const fromWed = recentWeekdayKeysBefore('2026-04-01', 7);
assert(fromWed.length === 7, 'expected 7 weekdays');
assert(fromWed[0] === '2026-03-31', `got ${fromWed[0]}`);
assert(fromWed[1] === '2026-03-30', `got ${fromWed[1]}`);
assert(fromWed[2] === '2026-03-27', `got ${fromWed[2]}`); // skips Sat 28 / Sun 29
assert(!fromWed.includes('2026-03-28'), 'weekend must be excluded');
assert(!fromWed.includes('2026-03-29'), 'weekend must be excluded');
assert(fromWed[6] === '2026-03-23', `got ${fromWed[6]}`);

// Monday → prior weekdays skip weekend immediately
const fromMon = recentWeekdayKeysBefore('2026-03-30', 2);
assert(fromMon[0] === '2026-03-27', `Mon-1 weekday got ${fromMon[0]}`);
assert(fromMon[1] === '2026-03-26', `Mon-2 weekday got ${fromMon[1]}`);

console.log('timesheetSubmitMail.selfcheck: ok');
