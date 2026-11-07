/**
 * Run: npx --yes tsx src/lib/templateRenderer.gstr.selfcheck.ts
 */
import {
  buildDefaultTemplateVars,
  formatMonthYear,
  previousCalendarMonth,
  renderTemplate,
  tidyRenderedSubject,
} from './templateRenderer.js';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

const nov = new Date(2026, 10, 4); // 4 Nov 2026
const prev = previousCalendarMonth(nov);
assert(prev.getFullYear() === 2026 && prev.getMonth() === 9, 'previous is October');
assert(formatMonthYear(prev) === 'October 2026', `got ${formatMonthYear(prev)}`);

const vars = buildDefaultTemplateVars({
  client: { name: 'Mehta Agencies' },
  firm: { name: 'M K Dandeker & Co' },
  date: nov,
  usePreviousMonth: true,
});
assert(vars.MONTH === 'October', `MONTH ${vars.MONTH}`);
assert(vars.MONTH_YEAR === 'October 2026', `MONTH_YEAR ${vars.MONTH_YEAR}`);

const subject = tidyRenderedSubject(
  renderTemplate('Data Required for GSTR Filing — {{FINANCIAL_YEAR}} — {{MONTH}}', {
    FINANCIAL_YEAR: '',
    MONTH: 'October',
  })
);
assert(!subject.includes('— —'), `no double dash: ${subject}`);
assert(subject === 'Data Required for GSTR Filing — October', `subject ${subject}`);

const good = tidyRenderedSubject(
  renderTemplate('Data Required for GSTR Filing — {{MONTH_YEAR}}', vars)
);
assert(good === 'Data Required for GSTR Filing — October 2026', good);

console.log('templateRenderer.gstr.selfcheck: ok');
