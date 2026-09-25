/**
 * Run: npx --yes tsx src/lib/timesheetExcel.selfcheck.ts
 */
import {
  TIMESHEET_EXCEL_HEADERS,
  expandTimesheetDays,
  groupTimesheetDays,
  type TimesheetSourceEntry,
} from './timesheetExcel.js';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

const base = (n: number, extra: Partial<TimesheetSourceEntry> = {}): TimesheetSourceEntry => ({
  userId: 'u1',
  dateKey: '2026-04-01',
  email: 'a@firm.test',
  staffName: 'Asha Rao',
  designation: 'Article Executive',
  clientName: `Client ${n}`,
  activity: 'Statutory Audit',
  manager: 'Nirmal P',
  hours: 1,
  details: n === 1 ? 'Fieldwork' : '',
  compOff: false,
  ...extra,
});

assert(TIMESHEET_EXCEL_HEADERS.length === 28, 'header width');
assert(TIMESHEET_EXCEL_HEADERS[26] === 'Details of Work Performed', 'details column');
assert(TIMESHEET_EXCEL_HEADERS[27] === 'Comp off', 'comp off column');

const one = groupTimesheetDays([base(1, { hours: 8, compOff: true })]);
assert(one.length === 1, 'one day');
assert(one[0].hours === 8, 'hours summed');
assert(one[0].compOff === true, 'comp off');
const wide = expandTimesheetDays(one);
assert(wide.length === 1, 'one excel row');
assert(wide[0][4] === 'Client 1', 'first client slot');
assert(wide[0][6] === 'Nirmal P', 'manager slot');
assert(wide[0][25] === 8, 'time spent');
assert(wide[0][27] === 'Yes', 'comp off yes');

const many = groupTimesheetDays(Array.from({ length: 8 }, (_, i) => base(i + 1)));
const spilled = expandTimesheetDays(many);
assert(spilled.length === 2, 'eighth client spills to a second row');
assert(spilled[1][4] === 'Client 8', 'overflow client');
assert(spilled[0][25] === 8, 'time spent stays on the first row');
assert(spilled[1][25] === '', 'overflow row has no second time total');

console.log('timesheetExcel.selfcheck: ok');
