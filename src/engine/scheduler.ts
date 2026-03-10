/**
 * Horizon → Scheduled Hours per Department.
 *
 * DST-proof: iterates on calendar days (date arithmetic), not milliseconds.
 * Uses Intl.DateTimeFormat to determine the weekday in the given timezone,
 * so a DST transition day (23h or 25h long) is still counted as one calendar day.
 */

import type { EngineDepartment, Weekday } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Maps Intl weekday short names (en-US) to our Weekday type */
const SHORT_DAY_MAP: Record<string, Weekday> = {
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
};

/**
 * Returns the Weekday for a given calendar-day offset from startDateISO,
 * evaluated in the specified IANA timezone.
 *
 * Robust approach: parse the ISO date string, add the offset as calendar days,
 * then ask Intl what the weekday is in the target timezone. This avoids
 * UTC/local timezone ambiguity that can cause off-by-one errors.
 */
function getWeekdayForOffset(
  startDateISO: string,
  dayOffset: number,
  timezone: string,
  formatter: Intl.DateTimeFormat
): Weekday {
  // Parse ISO date: ensure we interpret it as a calendar date, not UTC
  const [year, month, day] = startDateISO.split('-').map(Number);

  // Create a date object using UTC to avoid local timezone interpretation,
  // then request its weekday in the target timezone via Intl.
  // This ensures the weekday is correct regardless of host timezone.
  const dateUTC = new Date(Date.UTC(year, month - 1, day + dayOffset));

  const short = formatter.format(dateUTC);
  return SHORT_DAY_MAP[short] ?? 'mon';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SchedulerResult {
  /** Total scheduled hours per departmentId over the full horizon */
  totalScheduledHoursByDepartment: Record<string, number>;
  /** Number of production days (days with > 0 scheduled hours) per departmentId */
  productionDaysByDepartment: Record<string, number>;
}

/**
 * Computes scheduled hours and production day counts for all departments
 * over the specified horizon.
 *
 * @param departments   All departments in the effective model
 * @param startDateISO  ISO date string (YYYY-MM-DD) for the first horizon day
 * @param timezone      IANA timezone (e.g. "Europe/Amsterdam")
 * @param horizonCalendarDays  Number of calendar days to iterate (> 0)
 */
export function computeScheduledHours(
  departments: EngineDepartment[],
  startDateISO: string,
  timezone: string,
  horizonCalendarDays: number
): SchedulerResult {
  // Initialise result maps
  const totalScheduledHours: Record<string, number> = {};
  const productionDays: Record<string, number> = {};

  for (const dept of departments) {
    totalScheduledHours[dept.id] = 0;
    productionDays[dept.id] = 0;
  }

  if (departments.length === 0 || horizonCalendarDays <= 0) {
    return {
      totalScheduledHoursByDepartment: totalScheduledHours,
      productionDaysByDepartment: productionDays,
    };
  }

  // Single Intl formatter instance (reused across all days for performance)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });

  for (let d = 0; d < horizonCalendarDays; d++) {
    const weekday = getWeekdayForOffset(startDateISO, d, timezone, formatter);

    for (const dept of departments) {
      const hours = dept.hoursByWeekday[weekday] ?? 0;
      totalScheduledHours[dept.id] += hours;
      if (hours > 0) {
        productionDays[dept.id] += 1;
      }
    }
  }

  return {
    totalScheduledHoursByDepartment: totalScheduledHours,
    productionDaysByDepartment: productionDays,
  };
}
