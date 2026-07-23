export function formatCountdown(remainingSeconds: number): string {
  const seconds = Math.max(0, Math.floor(remainingSeconds));
  if (seconds <= 59) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}