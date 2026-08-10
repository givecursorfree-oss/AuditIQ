/** Cross-surface stopwatch sync (Dynamic Island ↔ Time Tracker). */
export const STOPWATCH_CHANGED = 'auditiq:stopwatch-changed';

export function notifyStopwatchChanged() {
  window.dispatchEvent(new CustomEvent(STOPWATCH_CHANGED));
}
