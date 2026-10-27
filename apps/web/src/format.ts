export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--';
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}

export function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(3) : '--';
}
