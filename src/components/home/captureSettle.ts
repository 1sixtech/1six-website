/** Ignore rounding noise and the corrective scroll travelling toward its target. */
export function movedAwayFrom(top: number, previousY: number, currentY: number): boolean {
  return Math.abs(currentY - top) > Math.abs(previousY - top) + 0.5;
}
