export function formatTime(seconds: number): string {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export const deg = (x: number, digits = 0): string => `${x.toFixed(digits)}°`;

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
