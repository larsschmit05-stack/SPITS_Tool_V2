/**
 * Capacity Calculation Utilities
 *
 * Provides reusable functions for calculating capacity previews across the application.
 * Used by resource creation flows and resource detail views.
 */

import type { Resource } from '../state/types';

export interface CapacityPreview {
  theoreticalRate: number | null;  // units/hour, before availability
  effectiveRate: number | null;    // units/hour, after availability
  warnings: string[];
}

/**
 * Computes a capacity preview for a resource draft.
 *
 * Returns both theoretical (without availability) and effective (with availability) rates,
 * plus any warnings about the capacity parameters.
 *
 * @param draft - Partial resource being created/edited
 * @param avgDeptHoursPerDay - Average working hours per day for the resource's department (for validation)
 * @returns CapacityPreview with rates and warnings
 */
export function computeCapacityPreview(
  draft: Partial<Resource>,
  avgDeptHoursPerDay: number | null
): CapacityPreview {
  const cls = draft.resourceClass ?? 'processing';
  const warnings: string[] = [];

  let theoreticalRate: number | null = null;
  let effectiveRate: number | null = null;
  const avail = draft.availability ?? 1;

  if (cls === 'processing') {
    const mode = draft.processingMode ?? 'continuous';
    const parallel = draft.parallelUnits ?? 1;
    if (mode === 'continuous' || mode === 'manual') {
      const oph = draft.outputPerHour;
      if (oph && oph > 0) {
        theoreticalRate = oph * parallel;
        effectiveRate = theoreticalRate * avail;
      }
    } else if (mode === 'batch') {
      const bs = draft.batchSize;
      const ct = draft.cycleTimeMinutes ?? 0;
      const setup = draft.batchSetupMinutes ?? 0;
      const totalTime = ct + setup;
      if (bs && bs > 0 && totalTime >= 0.1) {
        theoreticalRate = (bs / (totalTime / 60)) * parallel;
        effectiveRate = theoreticalRate * avail;
      }
    }
    // Startup warning
    if (avgDeptHoursPerDay !== null && draft.dailyStartupMinutes) {
      const startupHrs = draft.dailyStartupMinutes / 60;
      if (startupHrs >= avgDeptHoursPerDay * (avail || 1)) {
        warnings.push('Opstarttijd overtreft de beschikbare uren per dag');
      }
    }
  } else if (cls === 'buffer') {
    const cap = draft.slotCapacity;
    const safety = draft.safetyMarginPct ?? 0;
    const dwell = draft.dwellTimeMinutes;
    if (cap && cap > 0 && dwell && dwell >= 1) {
      const effSlots = cap * (1 - safety / 100);
      theoreticalRate = effSlots * (60 / dwell);
      effectiveRate = theoreticalRate * avail;
    }
  } else if (cls === 'transport') {
    const tmode = draft.transportMode ?? 'discrete';
    const parallel = draft.parallelUnits ?? 1;
    if (tmode === 'discrete') {
      const upt = draft.unitsPerTrip;
      const trip = draft.tripDurationMinutes;
      if (upt && upt > 0 && trip && trip >= 1) {
        theoreticalRate = upt * (60 / trip) * parallel;
        effectiveRate = theoreticalRate * avail;
      }
    } else {
      const oph = draft.outputPerHour;
      if (oph && oph > 0) {
        theoreticalRate = oph * parallel;
        effectiveRate = theoreticalRate * avail;
      }
    }
  } else if (cls === 'delay') {
    const dm = draft.delayTimeMinutes;
    if (dm && dm >= 0.1) {
      theoreticalRate = 60 / dm;
      effectiveRate = theoreticalRate; // no availability for delay
    }
  }

  if (effectiveRate !== null && effectiveRate > 10000) {
    warnings.push('Waarde lijkt onrealistisch hoog (> 10.000 eenheden/uur)');
  }

  return { theoreticalRate, effectiveRate, warnings };
}

/**
 * Formats a capacity rate for display (units per hour).
 *
 * @param rate - The rate in units/hour, or null if unable to calculate
 * @returns Formatted string for display
 */
export function formatCapacityRate(rate: number | null): string {
  if (rate === null) return '—';
  if (rate < 0.001) return '< 0,001 /uur';
  if (rate < 1) return `${rate.toFixed(3)} /uur`;
  return `${rate.toFixed(1)} /uur`;
}
