/** Indian business hours: Mon–Fri 09:00–18:00 IST */
export function isIndianBusinessHours(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);

  if (weekday === 'Sun' || weekday === 'Sat') return false;
  return hour >= 9 && hour < 18;
}

export const AFTER_HOURS_AUTO_REPLY =
  'Thank you for your message. Our team will respond by the next business day.';
