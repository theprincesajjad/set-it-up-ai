/** The birthday picker's rules: month and day only (we never ask for the year). No React Native imports (unit-tested in Node). */
export interface Birthday {
  month: number | null;
  day: number | null;
}

/** February has 29 days at most, April 30. */
export function daysInMonth(month: number | null): number {
  return month === 2 ? 29 : month && [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Picking a month drops a day that month does not have ("February 31" can never be saved). */
export function withMonth(b: Birthday, month: number): Birthday {
  return { month, day: b.day && b.day > daysInMonth(month) ? null : b.day };
}

/** "MM-DD" for the API when both are chosen, else nothing. */
export function birthdayValue(b: Birthday): string | undefined {
  return b.month && b.day ? `${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}` : undefined;
}

/** "11-26" (or a legacy "2000-11-26") → { month: 11, day: 26 }. */
export function parseBirthday(iso: string | null | undefined): Birthday {
  const [m, d] = (iso ?? "").slice(-5).split("-").map(Number);
  return m && d ? { month: m, day: d } : { month: null, day: null };
}
