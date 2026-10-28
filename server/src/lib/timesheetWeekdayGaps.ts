function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isWeekendKey(key: string): boolean {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Last `count` weekdays strictly before `dateKey` (YYYY-MM-DD calendar keys). */
export function recentWeekdayKeysBefore(dateKey: string, count = 7): string[] {
  const keys: string[] = [];
  let cursor = dateKey;
  let guard = 0;
  while (keys.length < count && guard < 40) {
    cursor = shiftDateKey(cursor, -1);
    if (!isWeekendKey(cursor)) keys.push(cursor);
    guard += 1;
  }
  return keys;
}
