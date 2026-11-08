/** The next 84% is a continuous journey from the top to the contact section. */
export function crossingProgress(scroll: number, start: number, end: number): number {
  if (end <= start) return 100;
  const progress = Math.min(1, Math.max(0, (scroll - start) / (end - start)));
  return 16 + progress * 84;
}
