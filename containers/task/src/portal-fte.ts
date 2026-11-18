/**
 * GRS accepts two decimal places. Preserve a positive FTE as at least 0.01
 * rather than representing a small, non-zero workforce as zero. Apply this
 * only to the final aggregate sent to GRS, never to source rows or storage.
 */
export function formatPortalFte(value: number | null | undefined): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("FTE must be a finite, non-negative number");
  }
  if (value === 0) return "0.00";
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Math.max(0.01, rounded).toFixed(2);
}
