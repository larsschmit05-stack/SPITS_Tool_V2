/**
 * Deterministic bottleneck selection.
 *
 * Tie-break order (contract §11):
 *   1. Highest utilizationAtTarget
 *   2. Lowest stepMaxGoodUnitsPerHour (at equal utilization)
 *   3. Lowest stepIndex
 *   4. Lexicographically smallest stepId
 *
 * Only steps that are bottleneck candidates (isBottleneckCandidate = true) participate.
 */

import type { StepResult, BottleneckResult } from './types';

export function selectBottleneck(stepResults: StepResult[]): BottleneckResult | null {
  const candidates = stepResults.filter(s => s.isBottleneckCandidate && s.utilizationAtTarget !== null);

  if (candidates.length === 0) return null;

  // Sort deterministically
  candidates.sort((a, b) => {
    const uA = a.utilizationAtTarget!;
    const uB = b.utilizationAtTarget!;

    // 1. Highest utilization first
    if (uA !== uB) return uB - uA;

    // 2. Lowest stepMaxGoodUnitsPerHour
    if (a.stepMaxGoodUnitsPerHour !== b.stepMaxGoodUnitsPerHour) {
      return a.stepMaxGoodUnitsPerHour - b.stepMaxGoodUnitsPerHour;
    }

    // 3. Lowest stepIndex
    if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;

    // 4. Lexicographic stepId
    return a.stepId.localeCompare(b.stepId);
  });

  const bn = candidates[0];

  const resourceId =
    bn.stepType === 'resourceStep' && bn.resourceBindingIds && bn.resourceBindingIds.length > 0
      ? bn.resourceBindingIds[0]
      : null;

  const topDrivers = buildTopDrivers(bn);

  const explanation = buildExplanation(bn);

  return {
    stepId: bn.stepId,
    resourceId,
    type: bn.stepType,
    metric: 'utilizationAtTarget',
    utilizationAtTarget: bn.utilizationAtTarget,
    stepMaxGoodUnitsPerHour: bn.stepMaxGoodUnitsPerHour,
    effectiveHours: bn.effectiveHours,
    explanation,
    topDrivers,
  };
}

function buildTopDrivers(
  bn: StepResult
): Array<{ name: string; value: number; unit: string }> {
  const drivers: Array<{ name: string; value: number; unit: string }> = [];

  drivers.push({
    name: 'Utilization at target',
    value: Math.round((bn.utilizationAtTarget ?? 0) * 1000) / 10,
    unit: '%',
  });

  drivers.push({
    name: 'Max good units / hr',
    value: Math.round(bn.stepMaxGoodUnitsPerHour * 100) / 100,
    unit: 'u/hr',
  });

  drivers.push({
    name: 'Effective hours',
    value: Math.round(bn.effectiveHours * 100) / 100,
    unit: 'hr',
  });

  if (bn.stepType === 'resourceStep' && bn.availability !== undefined) {
    drivers.push({
      name: 'Availability',
      value: Math.round(bn.availability * 1000) / 10,
      unit: '%',
    });
  }

  if (bn.stepType === 'resourceStep' && bn.yieldPct !== undefined) {
    drivers.push({
      name: 'Yield',
      value: bn.yieldPct,
      unit: '%',
    });
  }

  return drivers;
}

function buildExplanation(bn: StepResult): string {
  const utilPct = Math.round((bn.utilizationAtTarget ?? 0) * 1000) / 10;
  const status = utilPct >= 100 ? 'over capacity' : utilPct >= 90 ? 'near capacity' : 'bottleneck';
  return (
    `"${bn.label}" is the bottleneck step (${status}, utilization ${utilPct}%). ` +
    `Max output ${Math.round(bn.stepMaxGoodUnitsOverHorizon)} good units over the horizon. ` +
    `Effective hours: ${bn.effectiveHours}h.`
  );
}
