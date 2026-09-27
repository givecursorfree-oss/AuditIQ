const IST = 'Asia/Kolkata';

export function istDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function entryDateWindow(now = new Date()): { min: string; max: string } {
  const max = istDateKey(now);
  return { min: shiftDateKey(max, -1), max };
}

export function isEntryDateAllowed(isoDate: string, now = new Date()): boolean {
  const { min, max } = entryDateWindow(now);
  return isoDate >= min && isoDate <= max;
}

export function hoursBetween(checkIn?: string, checkOut?: string): number | null {
  if (!checkIn || !checkOut) return null;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms < 0) return null;
  return +(ms / 3_600_000).toFixed(2);
}
