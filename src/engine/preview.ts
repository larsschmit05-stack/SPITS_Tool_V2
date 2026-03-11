/**
 * Live capacity preview — shared formula layer.
 *
 * Uses the SAME formulas as calculator.ts so that the UI preview
 * always matches the engine's simulation output.
 *
 * Key guarantee:
 *   computeEffectiveCapacityPreview(resource, scheduledHoursPerDay)
 *   produces values that are consistent with computeStepResults()
 *   given the same inputs.
 *
 * This module has no React dependencies and can be imported anywhere.
 */

import type { ResourceClass, TransportMode } from './types';
import { VALIDATION_CONSTANTS as VC } from './constants';
import type { ProcessElementCreateDraft } from '../state/types';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Minimal resource shape accepted by the preview function.
 * Matches the subset of fields used in calculations — no full Resource required.
 */
export interface PreviewResource {
  resourceClass?: ResourceClass;
  // Processing
  processingMode?: 'continuous' | 'batch' | 'manual';
  outputPerHour?: number;
  batchSize?: number;
  cycleTimeMinutes?: number;
  batchSetupMinutes?: number;
  parallelUnits?: number;
  yieldPct?: number;
  availability?: number;
  dailyStartupMinutes?: number;
  // Buffer
  slotCapacity?: number;
  slotUnit?: string;
  safetyMarginPct?: number;
  dwellTimeMinutes?: number;
  // Transport
  transportMode?: TransportMode;
  unitsPerTrip?: number;
  tripDurationMinutes?: number;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface PreviewBreakdownStep {
  label: string;
  value: number;
  unit: string;
  /** Optional delta string, e.g. "−4.2 u/hr" */
  delta?: string;
}

export interface PreviewResult {
  /** Gross output rate before any losses (units/hr) */
  grossRatePerHour: number;
  /** After yield loss — processing only; equals grossRate for buffer/transport */
  afterYieldPerHour: number;
  /** Scheduled hours per day from the linked department */
  scheduledHoursPerDay: number;
  /** Hours deducted for startup — 0 for buffer/transport */
  setupLossHoursPerDay: number;
  /**
   * Effective hours per day:
   *   (scheduledHoursPerDay − setupLossHoursPerDay) × availability
   * Mirrors calculator.ts: availability is applied to hours, NOT to rate.
   */
  effectiveHoursPerDay: number;
  /** afterYieldPerHour × effectiveHoursPerDay */
  effectiveCapacityPerDay: number;
  /** Step-by-step breakdown for display in the UI */
  breakdown: PreviewBreakdownStep[];
  /** true when all required fields are present and within valid ranges */
  isValid: boolean;
  /** Human-readable validation errors (empty when isValid = true) */
  validationErrors: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers (mirror calculator.ts helpers)
// ---------------------------------------------------------------------------

function computeBaseRate(resource: PreviewResource): number {
  const resourceClass: ResourceClass = resource.resourceClass ?? 'processing';

  if (resourceClass === 'buffer') {
    const safetyMarginPct = resource.safetyMarginPct ?? 0;
    const effectiveSlots = (resource.slotCapacity ?? 0) * (1 - safetyMarginPct / 100);
    const dwellTimeMinutes = resource.dwellTimeMinutes ?? 0;
    if (dwellTimeMinutes <= 0) return 0;
    return effectiveSlots * (60 / dwellTimeMinutes);
  }

  if (resourceClass === 'transport') {
    if (resource.transportMode === 'discrete') {
      const tripDuration = resource.tripDurationMinutes ?? 0;
      if (tripDuration <= 0) return 0;
      return (resource.unitsPerTrip ?? 0) * (60 / tripDuration);
    }
    return resource.outputPerHour ?? 0;
  }

  // processing
  const processingMode = resource.processingMode ?? 'continuous';
  if (processingMode === 'batch') {
    const batchSize = resource.batchSize ?? 0;
    const totalTimeMinutes = (resource.cycleTimeMinutes ?? 0) + (resource.batchSetupMinutes ?? 0);
    const totalTimeHours = totalTimeMinutes / 60;
    if (totalTimeHours <= 0) return 0;
    return batchSize / totalTimeHours;
  }
  return resource.outputPerHour ?? 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validatePreviewResource(resource: PreviewResource): string[] {
  const errors: string[] = [];
  const resourceClass: ResourceClass = resource.resourceClass ?? 'processing';

  const avail = resource.availability ?? 1;
  if (!Number.isFinite(avail) || avail < VC.availability.min || avail > VC.availability.max) {
    errors.push(`Availability must be between ${VC.availability.min * 100}% and 100%`);
  }

  if (resourceClass === 'processing') {
    const processingMode = resource.processingMode ?? 'continuous';
    if (processingMode === 'continuous' || processingMode === 'manual') {
      const oph = resource.outputPerHour ?? 0;
      if (!Number.isFinite(oph) || oph < VC.outputPerHour.min) {
        errors.push('Output per hour must be greater than 0');
      }
    }
    if (processingMode === 'batch') {
      const bs = resource.batchSize ?? 0;
      if (!Number.isFinite(bs) || bs < VC.batchSize.min) {
        errors.push('Batch size must be greater than 0');
      }
      const ct = resource.cycleTimeMinutes ?? 0;
      if (!Number.isFinite(ct) || ct < VC.cycleTimeMinutes.min) {
        errors.push('Cycle time must be greater than 0 minutes');
      }
    }
    const yp = resource.yieldPct ?? 100;
    if (!Number.isFinite(yp) || yp < VC.yieldPct.min || yp > VC.yieldPct.max) {
      errors.push(`Yield % must be between ${VC.yieldPct.min} and ${VC.yieldPct.max}`);
    }
    const pu = resource.parallelUnits ?? 1;
    if (!Number.isFinite(pu) || pu < VC.parallelUnits.min || !Number.isInteger(pu)) {
      errors.push(`Parallel units must be an integer >= ${VC.parallelUnits.min}`);
    }
    const su = resource.dailyStartupMinutes ?? 0;
    if (!Number.isFinite(su) || su < VC.dailyStartupMinutes.min) {
      errors.push('Daily startup minutes must be >= 0');
    }
  }

  if (resourceClass === 'buffer') {
    const sc = resource.slotCapacity ?? 0;
    if (!Number.isFinite(sc) || sc <= 0) {
      errors.push('Slot capacity is required and must be greater than 0');
    }
    const dt = resource.dwellTimeMinutes;
    if (dt === undefined || dt === null || !Number.isFinite(dt) || dt < VC.dwellTimeMinutes.min) {
      errors.push(`Dwell time is required and must be >= ${VC.dwellTimeMinutes.min} minute`);
    }
    const sm = resource.safetyMarginPct ?? 0;
    if (!Number.isFinite(sm) || sm < VC.safetyMarginPct.min || sm > VC.safetyMarginPct.max) {
      errors.push(`Safety margin must be between ${VC.safetyMarginPct.min} and ${VC.safetyMarginPct.max}%`);
    }
  }

  if (resourceClass === 'transport') {
    const pu = resource.parallelUnits ?? 1;
    if (!Number.isFinite(pu) || pu < VC.parallelUnits.min || !Number.isInteger(pu)) {
      errors.push(`Parallel units must be an integer >= ${VC.parallelUnits.min}`);
    }
    if (resource.transportMode === 'discrete') {
      const upt = resource.unitsPerTrip ?? 0;
      if (!Number.isFinite(upt) || upt < VC.unitsPerTrip.min) {
        errors.push('Units per trip must be greater than 0');
      }
      const td = resource.tripDurationMinutes ?? 0;
      if (!Number.isFinite(td) || td < VC.tripDurationMinutes.min) {
        errors.push(`Trip duration must be >= ${VC.tripDurationMinutes.min} minute`);
      }
    } else {
      const oph = resource.outputPerHour ?? 0;
      if (!Number.isFinite(oph) || oph < VC.outputPerHour.min) {
        errors.push('Output per hour must be greater than 0 (continuous transport)');
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes a live capacity preview for a resource.
 *
 * @param resource           Resource fields (partial — may be incomplete during editing)
 * @param scheduledHoursPerDay  Planned hours/day from the linked department
 * @returns PreviewResult with breakdown and validity flag
 */
export function computeEffectiveCapacityPreview(
  resource: PreviewResource,
  scheduledHoursPerDay: number
): PreviewResult {
  const validationErrors = validatePreviewResource(resource);
  const isValid = validationErrors.length === 0 && scheduledHoursPerDay > 0;

  const resourceClass: ResourceClass = resource.resourceClass ?? 'processing';
  const availability = resource.availability ?? 1;
  const parallelUnits = resource.parallelUnits ?? 1;

  const baseRate = computeBaseRate(resource);
  const parallelFactor = resourceClass === 'buffer' ? 1 : parallelUnits;
  const grossRatePerHour = baseRate * parallelFactor;

  // Yield: only for processing
  const yieldFactor = resourceClass === 'processing' ? (resource.yieldPct ?? 100) / 100 : 1.0;
  const afterYieldPerHour = grossRatePerHour * yieldFactor;

  // Effective hours per day
  // CANONICAL FORMULA: availability on hours, never on rate (mirrors calculator.ts)
  const dailyStartupMinutes = resourceClass === 'processing' ? (resource.dailyStartupMinutes ?? 0) : 0;
  const setupLossHoursPerDay = dailyStartupMinutes / 60;
  const netHoursPerDay = Math.max(0, scheduledHoursPerDay - setupLossHoursPerDay);
  const effectiveHoursPerDay = netHoursPerDay * availability;

  const effectiveCapacityPerDay = afterYieldPerHour * effectiveHoursPerDay;

  // Build breakdown
  const breakdown: PreviewBreakdownStep[] = [];

  if (resourceClass === 'processing') {
    breakdown.push({ label: 'Gross output', value: round2(grossRatePerHour / parallelUnits), unit: 'units/hour (1 unit)' });
    if (parallelUnits > 1) {
      breakdown.push({ label: `× ${parallelUnits} parallel units`, value: round2(grossRatePerHour), unit: 'units/hour' });
    }
    if (yieldFactor < 1) {
      breakdown.push({
        label: `After yield (${resource.yieldPct ?? 100}%)`,
        value: round2(afterYieldPerHour),
        unit: 'units/hour',
        delta: `−${round2(grossRatePerHour - afterYieldPerHour)} units/hour`,
      });
    }
    breakdown.push({ label: 'Scheduled hours/day', value: round2(scheduledHoursPerDay), unit: 'hours/day' });
    if (setupLossHoursPerDay > 0) {
      breakdown.push({
        label: `Startup deduction (${dailyStartupMinutes} min)`,
        value: round2(netHoursPerDay),
        unit: 'hours/day available',
        delta: `−${round2(setupLossHoursPerDay)} h`,
      });
    }
    breakdown.push({
      label: `After availability (${Math.round(availability * 100)}%)`,
      value: round2(effectiveHoursPerDay),
      unit: 'effective hours/day',
      delta: `−${round2(netHoursPerDay - effectiveHoursPerDay)} h`,
    });
  } else if (resourceClass === 'buffer') {
    const safetyMarginPct = resource.safetyMarginPct ?? 0;
    const effectiveSlots = (resource.slotCapacity ?? 0) * (1 - safetyMarginPct / 100);
    breakdown.push({ label: 'Slot capacity', value: resource.slotCapacity ?? 0, unit: resource.slotUnit ?? 'units' });
    if (safetyMarginPct > 0) {
      breakdown.push({
        label: `After safety margin (${safetyMarginPct}%)`,
        value: round2(effectiveSlots),
        unit: resource.slotUnit ?? 'units',
        delta: `−${round2((resource.slotCapacity ?? 0) - effectiveSlots)}`,
      });
    }
    breakdown.push({
      label: `Dwell time (${resource.dwellTimeMinutes ?? '?'} min)`,
      value: round2(60 / (resource.dwellTimeMinutes ?? 1)),
      unit: 'turnovers/hour',
    });
    breakdown.push({ label: 'Buffer throughput', value: round2(grossRatePerHour), unit: 'units/hour' });
    breakdown.push({ label: 'Scheduled hours/day', value: round2(scheduledHoursPerDay), unit: 'hours/day' });
    breakdown.push({
      label: `After availability (${Math.round(availability * 100)}%)`,
      value: round2(effectiveHoursPerDay),
      unit: 'effective hours/day',
    });
  } else {
    // transport
    breakdown.push({ label: 'Throughput per vehicle', value: round2(baseRate), unit: 'units/hour' });
    if (parallelUnits > 1) {
      breakdown.push({ label: `× ${parallelUnits} vehicle(s)`, value: round2(grossRatePerHour), unit: 'units/hour' });
    }
    breakdown.push({ label: 'Scheduled hours/day', value: round2(scheduledHoursPerDay), unit: 'hours/day' });
    breakdown.push({
      label: `After availability (${Math.round(availability * 100)}%)`,
      value: round2(effectiveHoursPerDay),
      unit: 'effective hours/day',
    });
  }

  breakdown.push({
    label: 'Effective capacity/day',
    value: round2(effectiveCapacityPerDay),
    unit: 'units/day',
  });

  return {
    grossRatePerHour: round2(grossRatePerHour),
    afterYieldPerHour: round2(afterYieldPerHour),
    scheduledHoursPerDay: round2(scheduledHoursPerDay),
    setupLossHoursPerDay: round2(setupLossHoursPerDay),
    effectiveHoursPerDay: round2(effectiveHoursPerDay),
    effectiveCapacityPerDay: round2(effectiveCapacityPerDay),
    breakdown,
    isValid,
    validationErrors,
  };
}


export function mapCreateDraftToPreviewResource(draft: ProcessElementCreateDraft): PreviewResource {
  if (draft.resourceClass === 'processing') {
    return {
      resourceClass: 'processing',
      processingMode: draft.processingMode,
      outputPerHour: draft.outputPerHour,
      batchSize: draft.batchSize,
      cycleTimeMinutes: draft.cycleTimeMinutes,
      parallelUnits: draft.parallelUnits,
      availability: draft.availability,
      yieldPct: draft.yieldPct,
      dailyStartupMinutes: draft.dailyStartupMinutes,
    };
  }
  if (draft.resourceClass === 'buffer') {
    return {
      resourceClass: 'buffer',
      slotCapacity: draft.slotCapacity,
      dwellTimeMinutes: draft.dwellTimeMinutes,
      safetyMarginPct: draft.safetyMarginPct,
      availability: draft.availability,
    };
  }
  if (draft.resourceClass === 'transport') {
    return {
      resourceClass: 'transport',
      transportMode: draft.transportMode,
      outputPerHour: draft.outputPerHour,
      unitsPerTrip: draft.unitsPerTrip,
      tripDurationMinutes: draft.tripDurationMinutes,
      parallelUnits: draft.parallelUnits,
      availability: draft.availability,
    };
  }

  // Delay has no dedicated preview formula in the shared preview engine; expose as pseudo-processing throughput.
  return {
    resourceClass: 'processing',
    processingMode: 'continuous',
    outputPerHour: draft.delayTimeMinutes && draft.delayTimeMinutes > 0 ? 60 / draft.delayTimeMinutes : undefined,
    parallelUnits: 1,
    availability: 1,
    yieldPct: 100,
    dailyStartupMinutes: 0,
  };
}
