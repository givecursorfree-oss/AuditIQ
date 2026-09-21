/** ponytail: T+N claim cutoff day math */
function daysLate(expenseYmd, todayYmd) {
  const [ey, em, ed] = expenseYmd.split('-').map(Number);
  const [ty, tm, td] = todayYmd.split('-').map(Number);
  const e = Date.UTC(ey, em - 1, ed);
  const t = Date.UTC(ty, tm - 1, td);
  return Math.floor((t - e) / 86_400_000);
}

function allowed(expenseYmd, todayYmd, windowDays) {
  const d = daysLate(expenseYmd, todayYmd);
  return d >= 0 && d <= windowDays;
}

const cases = [
  ['2026-09-18', '2026-09-21', 3, true],
  ['2026-09-17', '2026-09-21', 3, false],
  ['2026-09-21', '2026-09-21', 3, true],
  ['2026-09-22', '2026-09-21', 3, false],
];

for (const [e, t, w, want] of cases) {
  const got = allowed(e, t, w);
  if (got !== want) {
    console.error(`FAIL ${e} vs ${t} w=${w}: got ${got} want ${want}`);
    process.exit(1);
  }
}
console.log('ok: claim cutoff T+N');
