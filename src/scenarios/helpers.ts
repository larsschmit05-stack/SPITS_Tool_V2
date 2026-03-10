/**
 * Scenario editor helper utilities.
 * Pure functions — no React dependencies.
 */

import type { Scenario, Department } from '../state/types';

/**
 * Count how many overrides are currently active in a scenario.
 */
export function countActiveOverrides(scenario: Scenario): {
  demand: number;
  departments: number;
  resources: number;
  total: number;
} {
  const demand = scenario.demand ? 1 : 0;
  const departments = Object.keys(scenario.departmentScheduleOverrides ?? {}).length;
  const resources = Object.keys(scenario.resourceOverrides ?? {}).length;
  return { demand, departments, resources, total: demand + departments + resources };
}

/**
 * Calculate absolute and percentage delta between a baseline and an override value.
 */
export function computeDelta(
  baseline: number,
  override: number
): { absolute: number; pct: number } {
  const absolute = override - baseline;
  const pct = baseline !== 0 ? (absolute / baseline) * 100 : 0;
  return { absolute, pct };
}

/**
 * Sum all hours in an hoursByWeekday record.
 */
export function totalHoursPerWeek(hours: Department['hoursByWeekday']): number {
  return (
    hours.mon + hours.tue + hours.wed + hours.thu + hours.fri + hours.sat + hours.sun
  );
}

/**
 * Merge a department's baseline hoursByWeekday with a partial scenario override.
 */
export function resolvedDeptHours(
  dept: Department,
  override?: Partial<Department['hoursByWeekday']>
): Department['hoursByWeekday'] {
  if (!override) return dept.hoursByWeekday;
  return { ...dept.hoursByWeekday, ...override };
}
