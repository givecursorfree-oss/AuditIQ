export function hoursBetween(checkIn?: string, checkOut?: string): number | null {
  if (!checkIn || !checkOut) return null;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms < 0) return null;
  return +(ms / 3_600_000).toFixed(2);
}
