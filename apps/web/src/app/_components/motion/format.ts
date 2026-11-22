/** Whole numbers with thousands separators; CountUp shows only these, never 3.4999. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en");
}
