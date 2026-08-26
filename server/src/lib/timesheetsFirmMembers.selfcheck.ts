/**
 * Keep in sync with FIRM_MEMBER_ROLES in routes/timesheets.ts
 * Run: npx --yes tsx src/lib/timesheetsFirmMembers.selfcheck.ts
 */
const FIRM_MEMBER_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'HR'] as const;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(!FIRM_MEMBER_ROLES.includes('Client' as (typeof FIRM_MEMBER_ROLES)[number]), 'Client must not be on timesheets');
assert(FIRM_MEMBER_ROLES.includes('Staff'), 'Staff on timesheets');
assert(FIRM_MEMBER_ROLES.includes('HR'), 'HR on timesheets');
console.log('timesheetsFirmMembers.selfcheck: ok');
