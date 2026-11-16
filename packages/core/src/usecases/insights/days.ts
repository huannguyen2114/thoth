/**
 * Local-day arithmetic on "YYYY-MM-DD" strings (ADR-0023: days are the owner's local calendar
 * days). Everything works on UTC-anchored dates so daylight saving never shifts a day.
 */

/** The local calendar day of an instant. `tzOffsetMin` is `Date#getTimezoneOffset()`. */
export function localDay(at: Date, tzOffsetMin: number): string {
  return new Date(at.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

const parse = (day: string): Date => new Date(`${day}T00:00:00Z`);

export function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(day: string): number {
  return parse(day).getUTCDay();
}

/** The Sunday on or before `day` (the heatmap's weeks start on Sunday, like GitHub's). */
export function weekStart(day: string): string {
  return addDays(day, -weekdayOf(day));
}
