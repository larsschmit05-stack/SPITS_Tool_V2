/**
 * Scenario editor UI-level form validation.
 * These are soft validations for real-time feedback; they don't block form submission.
 */

import type { Scenario, ScenarioPatch, Department } from '../state/types';

export interface ValidationErrors {
  [field: string]: string | undefined;
}

export interface ValidationResult {
  errors: ValidationErrors;
  warnings: ValidationErrors;
}

/**
 * Validate demand form fields.
 * Returns blocking errors (red) and soft warnings (orange).
 */
export function validateDemandForm(demand: {
  targetGoodUnits?: number | string;
  horizonCalendarDays?: number | string;
  startDateISO?: string;
  timezone?: string;
}): ValidationResult {
  const errors: ValidationErrors = {};
  const warnings: ValidationErrors = {};

  // targetGoodUnits
  const units = demand.targetGoodUnits;
  if (units !== undefined && units !== '') {
    const parsed = typeof units === 'string' ? parseFloat(units) : units;
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      errors.targetGoodUnits = 'Must be a positive integer';
    }
  }

  // horizonCalendarDays
  const days = demand.horizonCalendarDays;
  if (days !== undefined && days !== '') {
    const parsed = typeof days === 'string' ? parseFloat(days) : days;
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      errors.horizonCalendarDays = 'Must be a positive integer';
    }
  }

  // startDateISO
  if (demand.startDateISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(demand.startDateISO)) {
      errors.startDateISO = 'Must be YYYY-MM-DD format';
    } else {
      const date = new Date(demand.startDateISO);
      if (isNaN(date.getTime())) {
        errors.startDateISO = 'Invalid date';
      }
    }
  }

  // timezone (basic check — just ensure it's not empty if provided)
  if (demand.timezone && demand.timezone.trim() === '') {
    errors.timezone = 'Timezone cannot be empty';
  }

  return { errors, warnings };
}

/**
 * Validate department schedule override hours.
 */
export function validateScheduleOverride(override: {
  [day: string]: number | string | undefined;
}): ValidationErrors {
  const errors: ValidationErrors = {};
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  for (const day of days) {
    const hours = override[day];
    if (hours !== undefined && hours !== '') {
      const parsed = typeof hours === 'string' ? parseFloat(hours) : hours;
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
        errors[day] = 'Must be between 0 and 24';
      }
    }
  }

  return errors;
}

/**
 * Validate resource efficiency override fields.
 */
export function validateResourceOverride(override: {
  parallelUnits?: number | string;
  yieldPct?: number | string;
  availability?: number | string;
  outputPerHour?: number | string;
  [key: string]: any;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  // parallelUnits
  if (override.parallelUnits !== undefined && override.parallelUnits !== '') {
    const parsed = typeof override.parallelUnits === 'string' ? parseFloat(override.parallelUnits) : override.parallelUnits;
    if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
      errors.parallelUnits = 'Must be an integer >= 1';
    }
  }

  // yieldPct (0-100)
  if (override.yieldPct !== undefined && override.yieldPct !== '') {
    const parsed = typeof override.yieldPct === 'string' ? parseFloat(override.yieldPct) : override.yieldPct;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      errors.yieldPct = 'Must be between 0 and 100';
    }
  }

  // availability (0-1)
  if (override.availability !== undefined && override.availability !== '') {
    const parsed = typeof override.availability === 'string' ? parseFloat(override.availability) : override.availability;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      errors.availability = 'Must be between 0 and 1';
    }
  }

  // outputPerHour (> 0)
  if (override.outputPerHour !== undefined && override.outputPerHour !== '') {
    const parsed = typeof override.outputPerHour === 'string' ? parseFloat(override.outputPerHour) : override.outputPerHour;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.outputPerHour = 'Must be greater than 0';
    }
  }

  return errors;
}

/**
 * Derive the overall completeness / readiness of a scenario.
 * Used by the Overview tab status badge and to gate the Run button.
 *
 * - 'Ready'      → demand is fully configured and valid
 * - 'Incomplete' → demand is missing or has empty required fields
 * - 'Invalid'    → demand fields fail validation rules
 */
export function validateScenarioCompleteness(
  scenario: import('../state/types').Scenario
): 'Ready' | 'Incomplete' | 'Invalid' {
  const d = scenario.demand;
  if (!d) return 'Incomplete';
  if (!d.targetGoodUnits || !d.horizonCalendarDays || !d.startDateISO || !d.timezone) {
    return 'Incomplete';
  }
  const { errors } = validateDemandForm(d);
  if (Object.keys(errors).length > 0) return 'Invalid';
  return 'Ready';
}

/**
 * Normalize scenario tags: trim, deduplicate, remove empty, limit to 5.
 */
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return Array.from(
    new Set(
      tags
        .map(t => t.trim())
        .filter(t => t.length > 0)
    )
  ).slice(0, 5);
}
