/**
 * Step-level capacity calculations.
 *
 * Computation pipeline per enabled step (in flow order):
 *   1. scheduledHours          ← from scheduler, via inheritedDepartmentId
 *   2. startupHoursApplied     ← dailyStartupMinutes × productionDays / 60 (ResourceStep only)
 *   3. availableHoursAfterStartup ← max(0, scheduledHours − startupHoursApplied)
 *   4. effectiveHours          ← × availability (ResourceStep) or × 1 (TimeStep)
 *   5. baseRate                ← outputPerHour OR batchSize / ((cycleTimeMinutes + batchSetupMinutes) / 60)
 *   6. effectiveRateUnitsPerHour ← baseRate × availability × parallelUnits (ResourceStep)
 *                                  OR 60 / durationMinutesPerUnit (TimeStep)
 *   7. cumYieldToEnd           ← backward product of yield_k, disabled steps transparent
 *   8. stepMaxGoodUnitsPerHour ← effectiveRate × cumYieldToEnd
 *   9. stepMaxGoodUnitsOverHorizon ← stepMaxGoodUnitsPerHour × effectiveHours
 *  10. requiredWorkHoursAtTarget, utilizationAtTarget
 *  11. capacityStatus
 *  12. explain[]
 *
 * Disabled steps receive default zero values and capacityStatus='disabled'.
 */

import type {
  EngineResource,
  EngineDepartment,
  RunRequest,
  StepResult,
  CapacityStatus,
  ResourceClass,
} from './types';
import type { StepWithDepartment } from './flow';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Returns the base throughput rate in units/hour for a single resource unit.
 *
 * For Processing: raw output rate (availability and parallelUnits applied later).
 * For Buffer:     effective slot turnover rate (effectiveSlots × turnoversPerHour).
 *                 parallelUnits is not applicable to buffers.
 * For Transport:  throughput per vehicle (parallelUnits applied later).
 */
function computeBaseRate(resource: EngineResource): number {
  const resourceClass: ResourceClass = resource.resourceClass ?? 'processing';

  if (resourceClass === 'buffer') {
    const safetyMarginPct = resource.safetyMarginPct ?? 0;
    const effectiveSlots = (resource.slotCapacity ?? 0) * (1 - safetyMarginPct / 100);
    const dwellTimeMinutes = resource.dwellTimeMinutes ?? 0;
    if (dwellTimeMinutes <= 0) return 0;
    return effectiveSlots * (60 / dwellTimeMinutes); // units/hour
  }

  if (resourceClass === 'transport') {
    if (resource.transportMode === 'discrete') {
      const tripDuration = resource.tripDurationMinutes ?? 0;
      if (tripDuration <= 0) return 0;
      return (resource.unitsPerTrip ?? 0) * (60 / tripDuration); // units/hour per vehicle
    }
    // continuous transport: same formula as continuous processing
    return resource.outputPerHour ?? 0;
  }

  if (resourceClass === 'delay') {
    // Rate = 60 / delayTimeMinutes (units/hour throughput cap).
    // per_batch mode uses the same formula at MVP (full batch-factor deferred post-MVP).
    const delayMins = resource.delayTimeMinutes ?? 0;
    if (delayMins <= 0) return 0;
    return 60 / delayMins;
  }

  // processing (default)
  const processingMode = resource.processingMode ?? resource.type;
  if (processingMode === 'batch') {
    const batchSize = resource.batchSize ?? 0;
    const totalTimeMinutes = (resource.cycleTimeMinutes ?? 0) + (resource.batchSetupMinutes ?? 0);
    const totalTimeHours = totalTimeMinutes / 60;
    if (totalTimeHours <= 0) return 0;
    return batchSize / totalTimeHours;
  }
  return resource.outputPerHour ?? 0;
}

function computeCapacityStatus(
  enabled: boolean,
  effectiveHours: number,
  utilizationAtTarget: number | null,
  resourceMissing: boolean,
  targetGoodUnits: number
): CapacityStatus {
  if (!enabled) return 'disabled';
  if (resourceMissing) return 'blocked_missing_resource';
  if (effectiveHours <= 0 && targetGoodUnits > 0) return 'blocked_no_hours';
  if (utilizationAtTarget === null) return 'invalid_input';
  if (utilizationAtTarget >= 1) return 'warning'; // over capacity
  if (utilizationAtTarget >= 0.9) return 'warning'; // near capacity
  return 'ok';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes all StepResult objects for the linearised, department-annotated steps.
 *
 * Steps of type 'start' and 'end' are skipped — they do not appear in StepResult[].
 */
export function computeStepResults(
  orderedSteps: StepWithDepartment[],
  resources: EngineResource[],
  departments: EngineDepartment[],
  scheduledHoursByDept: Record<string, number>,
  productionDaysByDept: Record<string, number>,
  request: RunRequest
): StepResult[] {
  const { targetGoodUnits } = request;
  const resourceMap = new Map<string, EngineResource>(resources.map(r => [r.id, r]));
  const deptMap = new Map<string, EngineDepartment>(departments.map(d => [d.id, d]));

  // Filter to actual process steps (exclude start/end)
  const processSteps = orderedSteps.filter(
    s => s.type === 'resourceStep' || s.type === 'timeStep'
  );

  // ---------------------------------------------------------------------------
  // Pass 1: compute per-step values (forward pass)
  // ---------------------------------------------------------------------------

  interface StepIntermediate {
    stepId: string;
    stepIndex: number;
    step: StepWithDepartment;
    resource: EngineResource | null;
    enabled: boolean;
    scheduledHours: number;
    startupHoursApplied: number;
    availableHoursAfterStartup: number;
    effectiveHours: number;
    baseRate: number;
    effectiveRateUnitsPerHour: number;
    yieldFactor: number; // 0..1, for this step only
    /** Output units produced per input unit at this step. Defaults to 1. */
    conversionRatio: number;
    dept: EngineDepartment | null;
    // Pass 4 — material flow fields
    inflowUnitsPerHour?: number | null;
    outflowUnitsPerHour?: number | null;
    actualThroughputUnitsPerHour?: number | null;
  }

  const intermediates: StepIntermediate[] = processSteps.map((step, idx) => {
    const enabled =
      step.type === 'resourceStep' || step.type === 'timeStep'
        ? step.enabled !== false
        : true;

    if (!enabled) {
      return {
        stepId: step.id,
        stepIndex: idx,
        step,
        resource: null,
        enabled: false,
        scheduledHours: 0,
        startupHoursApplied: 0,
        availableHoursAfterStartup: 0,
        effectiveHours: 0,
        baseRate: 0,
        effectiveRateUnitsPerHour: 0,
        yieldFactor: 1,
        conversionRatio: 1,
        dept: null,
      };
    }

    const deptId = step.inheritedDepartmentId;
    const dept = deptId ? (deptMap.get(deptId) ?? null) : null;

    if (step.type === 'resourceStep') {
      const resource = resourceMap.get(step.resourceId) ?? null;
      const resourceClass: ResourceClass = resource?.resourceClass ?? 'processing';

      // Delay resources have no department — they constrain throughput rate only.
      // Use full calendar hours so they are never artificially blocked on time.
      const isDelay = resourceClass === 'delay';
      const scheduledHours = isDelay
        ? request.horizonCalendarDays * 24
        : (deptId ? (scheduledHoursByDept[deptId] ?? 0) : 0);
      const productionDays = isDelay
        ? 0
        : (deptId ? (productionDaysByDept[deptId] ?? 0) : 0);

      if (!resource) {
        return {
          stepId: step.id,
          stepIndex: idx,
          step,
          resource: null,
          enabled: true,
          scheduledHours,
          startupHoursApplied: 0,
          availableHoursAfterStartup: scheduledHours,
          effectiveHours: 0,
          baseRate: 0,
          effectiveRateUnitsPerHour: 0,
          yieldFactor: 1,
          conversionRatio: 1,
          dept,
        };
      }

      const baseRate = computeBaseRate(resource);

      // --- Effective hours: availability applied to time, never to rate ---
      //
      // CANONICAL FORMULA:
      //   effectiveHours = (scheduledHours - startupHours) × availability
      //   effectiveRate  = baseRate × parallelUnits  (NO second availability factor)
      //
      // Buffer: no startup overhead.
      // Transport: no startup overhead (MVP).
      // Delay: no startup, no availability factor (always available; it's a wait).
      let startupHoursApplied = 0;
      let availableHoursAfterStartup = scheduledHours;

      if (resourceClass === 'processing') {
        startupHoursApplied = (resource.dailyStartupMinutes * productionDays) / 60;
        availableHoursAfterStartup = Math.max(0, scheduledHours - startupHoursApplied);
      }

      const effectiveHours = isDelay
        ? availableHoursAfterStartup  // delay: no availability factor
        : availableHoursAfterStartup * resource.availability;

      // --- Effective rate: availability is already reflected in effectiveHours ---
      //
      // Buffer: parallelUnits not applicable — rate already captures effectiveSlots.
      // Transport: parallelUnits = number of vehicles.
      // Processing: parallelUnits = number of identical machines.
      // Delay: parallelUnits not used (delay is a pure rate constraint per unit).
      const parallelFactor = (resourceClass === 'buffer' || resourceClass === 'delay') ? 1 : resource.parallelUnits;
      const effectiveRateUnitsPerHour = baseRate * parallelFactor;

      // --- Yield factor ---
      // Buffer, transport, and delay do NOT lose product — yield is implicitly 1.
      // Only processing applies the user-defined yieldPct.
      const yieldFactor = resourceClass === 'processing' ? resource.yieldPct / 100 : 1.0;

      const rawRatio = step.type === 'resourceStep' ? step.conversionRatio : undefined;
      const stepConversionRatio = (rawRatio !== undefined && rawRatio > 0) ? rawRatio : 1;

      return {
        stepId: step.id,
        stepIndex: idx,
        step,
        resource,
        enabled: true,
        scheduledHours,
        startupHoursApplied,
        availableHoursAfterStartup,
        effectiveHours,
        baseRate,
        effectiveRateUnitsPerHour,
        yieldFactor,
        conversionRatio: stepConversionRatio,
        dept,
      };
    }

    const scheduledHours = deptId ? (scheduledHoursByDept[deptId] ?? 0) : 0;

    // timeStep: no startup, no availability factor, yield = 1
    const effectiveRateUnitsPerHour =
      step.durationMinutesPerUnit > 0 ? 60 / step.durationMinutesPerUnit : 0;

    const rawTimeRatio = step.type === 'timeStep' ? step.conversionRatio : undefined;
    const timeConversionRatio = (rawTimeRatio !== undefined && rawTimeRatio > 0) ? rawTimeRatio : 1;

    return {
      stepId: step.id,
      stepIndex: idx,
      step,
      resource: null,
      enabled: true,
      scheduledHours,
      startupHoursApplied: 0,
      availableHoursAfterStartup: scheduledHours,
      effectiveHours: scheduledHours, // availability = 1 for TimeStep
      baseRate: effectiveRateUnitsPerHour,
      effectiveRateUnitsPerHour,
      yieldFactor: 1,
      conversionRatio: timeConversionRatio,
      dept,
    };
  });

  // ---------------------------------------------------------------------------
  // Pass 2: backward pass — compute cumYieldToEnd (only enabled steps)
  // ---------------------------------------------------------------------------

  // cumYieldToEnd[i] = yieldFactor[i] * conversionRatio[i] * acc_before_this_step
  // where acc = product of (yieldFactor * conversionRatio) for all enabled steps downstream.
  // This gives the number of final-material good units produced per 1 input unit of step i.
  const cumYieldToEnd: number[] = new Array(intermediates.length).fill(0);

  {
    let acc = 1;
    for (let i = intermediates.length - 1; i >= 0; i--) {
      const im = intermediates[i];
      if (!im.enabled) continue;
      cumYieldToEnd[i] = im.yieldFactor * im.conversionRatio * acc;
      acc = im.yieldFactor * im.conversionRatio * acc;
    }

    // Assign disabled step cumYields: they get the cumYield of the next enabled step downstream
    // (or 1 if none). This value is not used in disabled step output.
    let nextEnabledCumYield = 1;
    for (let i = intermediates.length - 1; i >= 0; i--) {
      if (intermediates[i].enabled) {
        nextEnabledCumYield = cumYieldToEnd[i];
      } else {
        cumYieldToEnd[i] = nextEnabledCumYield;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pass 3 (material flow): forward propagation — inflow / outflow per step
  // ---------------------------------------------------------------------------

  {
    const startStep = orderedSteps.find(s => s.type === 'start');
    let prevOutflow: number | null =
      startStep?.type === 'start' && startStep.supplyMode === 'fixed' && startStep.maxUnitsPerHour != null
        ? startStep.maxUnitsPerHour
        : null; // null = unconstrained

    for (const im of intermediates) {
      im.inflowUnitsPerHour = prevOutflow;

      if (!im.enabled) {
        // Disabled steps are transparent — pass inflow through unchanged
        im.actualThroughputUnitsPerHour = prevOutflow;
        im.outflowUnitsPerHour = prevOutflow;
      } else if (im.step.type === 'resourceStep') {
        const effectiveRate = im.effectiveRateUnitsPerHour;
        const actualThroughput =
          prevOutflow === null ? effectiveRate : Math.min(prevOutflow, effectiveRate);
        im.actualThroughputUnitsPerHour = round4(actualThroughput);
        im.outflowUnitsPerHour = round4(actualThroughput * im.yieldFactor * im.conversionRatio);
      } else {
        // timeStep: pass-through rate, apply conversionRatio only
        im.actualThroughputUnitsPerHour = prevOutflow;
        im.outflowUnitsPerHour = prevOutflow === null ? null : round4(prevOutflow * im.conversionRatio);
      }

      prevOutflow = im.outflowUnitsPerHour ?? null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pass 4: assemble StepResult[]
  // ---------------------------------------------------------------------------

  const processStepResults = intermediates.map((im, i): StepResult => {
    const cY = cumYieldToEnd[i];
    const stepMaxGoodUnitsPerHour = im.effectiveRateUnitsPerHour * cY;
    const stepMaxGoodUnitsOverHorizon = stepMaxGoodUnitsPerHour * im.effectiveHours;

    let requiredWorkHoursAtTarget: number | null = null;
    let utilizationAtTarget: number | null = null;

    if (im.enabled && im.effectiveHours > 0 && stepMaxGoodUnitsPerHour > 0) {
      requiredWorkHoursAtTarget = targetGoodUnits / stepMaxGoodUnitsPerHour;
      utilizationAtTarget = requiredWorkHoursAtTarget / im.effectiveHours;
    }

    const resourceMissing =
      im.step.type === 'resourceStep' && im.resource === null;

    const capacityStatus = computeCapacityStatus(
      im.enabled,
      im.effectiveHours,
      utilizationAtTarget,
      resourceMissing,
      targetGoodUnits
    );

    const explain = buildExplain(im, cY, stepMaxGoodUnitsPerHour, utilizationAtTarget, targetGoodUnits);

    const base: StepResult = {
      stepId: im.stepId,
      stepIndex: im.stepIndex,
      stepType: im.step.type === 'resourceStep' ? 'resourceStep' : 'timeStep',
      label:
        im.step.type === 'resourceStep' || im.step.type === 'timeStep'
          ? im.step.label
          : im.stepId,
      enabled: im.enabled,
      isActive: im.enabled,
      isBottleneckCandidate: im.enabled && utilizationAtTarget !== null,
      capacityStatus,
      inheritedDepartmentId: im.step.inheritedDepartmentId,
      inheritedDepartmentName: im.step.inheritedDepartmentName,
      scheduledHours: round4(im.scheduledHours),
      startupHoursApplied: round4(im.startupHoursApplied),
      availableHoursAfterStartup: round4(im.availableHoursAfterStartup),
      effectiveHours: round4(im.effectiveHours),
      effectiveRateUnitsPerHour: round4(im.effectiveRateUnitsPerHour),
      cumYieldToEnd: round4(cY),
      stepMaxGoodUnitsPerHour: round4(stepMaxGoodUnitsPerHour),
      stepMaxGoodUnitsOverHorizon: round4(stepMaxGoodUnitsOverHorizon),
      requiredWorkHoursAtTarget:
        requiredWorkHoursAtTarget !== null ? round4(requiredWorkHoursAtTarget) : null,
      utilizationAtTarget:
        utilizationAtTarget !== null ? round4(utilizationAtTarget) : null,
      explain,
    };

    // ResourceStep-specific fields
    if (im.step.type === 'resourceStep' && im.resource) {
      base.resourceBindingIds = [im.step.resourceId];
      base.resourceType = im.resource.type;
      base.resourceClass = im.resource.resourceClass ?? 'processing';
      base.availability = im.resource.availability;
      base.yieldPct = im.resource.yieldPct;
      base.dailyStartupMinutes = im.resource.dailyStartupMinutes;
    }

    // TimeStep-specific field
    if (im.step.type === 'timeStep') {
      base.durationMinutesPerUnit = im.step.durationMinutesPerUnit;
    }

    // Material conversion fields (for both resourceStep and timeStep)
    if (im.step.type === 'resourceStep' || im.step.type === 'timeStep') {
      base.inputMaterialId = im.step.inputMaterialId;
      base.outputMaterialId = im.step.outputMaterialId;
      if (im.conversionRatio !== 1) {
        base.conversionRatio = im.conversionRatio;
      }
    }

    // Material flow fields (Pass 3 forward propagation)
    base.inflowUnitsPerHour = im.inflowUnitsPerHour;
    base.outflowUnitsPerHour = im.outflowUnitsPerHour;
    base.actualThroughputUnitsPerHour = im.actualThroughputUnitsPerHour;

    return base;
  });

  // ---------------------------------------------------------------------------
  // Synthetic StepResult entries for fixed-supply source nodes
  // Prepended so they appear first in the results and can become the bottleneck.
  // ---------------------------------------------------------------------------
  const sourceResults: StepResult[] = orderedSteps
    .filter(s => s.type === 'start' && s.supplyMode === 'fixed' && s.maxUnitsPerHour != null)
    .map((s, idx) => {
      if (s.type !== 'start' || s.maxUnitsPerHour == null) return null as unknown as StepResult;
      const effectiveHours = request.horizonCalendarDays * 24; // calendar hours, supply is always-on
      const maxUph = s.maxUnitsPerHour;
      const maxOverHorizon = round4(maxUph * effectiveHours);
      const utilization = effectiveHours > 0 ? round4(targetGoodUnits / maxOverHorizon) : null;
      const capacityStatus: CapacityStatus =
        utilization === null ? 'invalid_input'
        : utilization >= 1 ? 'warning'
        : utilization >= 0.9 ? 'warning'
        : 'ok';
      return {
        outflowUnitsPerHour: round4(maxUph),
        stepId: s.id,
        stepIndex: -(orderedSteps.filter(x => x.type === 'start').length - idx),
        stepType: 'source' as const,
        label: s.label,
        enabled: true,
        isActive: true,
        isBottleneckCandidate: true,
        capacityStatus,
        inheritedDepartmentId: null,
        inheritedDepartmentName: null,
        scheduledHours: effectiveHours,
        startupHoursApplied: 0,
        availableHoursAfterStartup: effectiveHours,
        effectiveHours: round4(effectiveHours),
        effectiveRateUnitsPerHour: round4(maxUph),
        cumYieldToEnd: 1,
        stepMaxGoodUnitsPerHour: round4(maxUph),
        stepMaxGoodUnitsOverHorizon: maxOverHorizon,
        requiredWorkHoursAtTarget: utilization !== null ? round4(targetGoodUnits / maxUph) : null,
        utilizationAtTarget: utilization,
        explain: [
          `Fixed inflow: ${maxUph.toFixed(4)} e/h (${s.label})`,
          `Calendar horizon: ${effectiveHours}h (${request.horizonCalendarDays} days × 24h)`,
          `Max inflow over horizon: ${maxOverHorizon} units`,
          utilization !== null
            ? `Utilization at target (${targetGoodUnits} e): ${(utilization * 100).toFixed(1)}%`
            : 'Invalid: effective hours = 0',
        ],
      } satisfies StepResult;
    });

  return [...sourceResults, ...processStepResults];
}

// ---------------------------------------------------------------------------
// Explainability strings
// ---------------------------------------------------------------------------

function buildExplain(
  im: {
    step: StepWithDepartment;
    resource: EngineResource | null;
    enabled: boolean;
    scheduledHours: number;
    startupHoursApplied: number;
    availableHoursAfterStartup: number;
    effectiveHours: number;
    effectiveRateUnitsPerHour: number;
    baseRate: number;
    conversionRatio: number;
  },
  cumYieldToEnd: number,
  stepMaxGoodUnitsPerHour: number,
  utilizationAtTarget: number | null,
  targetGoodUnits: number
): string[] {
  if (!im.enabled) return ['Step is disabled — excluded from capacity calculation'];

  const lines: string[] = [];
  const deptName = im.step.inheritedDepartmentName ?? im.step.inheritedDepartmentId ?? 'unknown dept';

  lines.push(`Dept "${deptName}": ${round4(im.scheduledHours)}h scheduled`);

  if (im.step.type === 'resourceStep' && im.resource) {
    const r = im.resource;
    const resourceClass = r.resourceClass ?? 'processing';

    if (resourceClass === 'buffer') {
      const safetyPct = r.safetyMarginPct ?? 0;
      const effectiveSlots = (r.slotCapacity ?? 0) * (1 - safetyPct / 100);
      lines.push(
        `Buffer: ${r.slotCapacity} slots × (1 − ${safetyPct}% margin) = ${round4(effectiveSlots)} effective slots`
      );
      lines.push(
        `Dwell time ${r.dwellTimeMinutes}min → ${round4(60 / (r.dwellTimeMinutes ?? 1))} turnovers/hr`
      );
      lines.push(
        `Base rate: ${round4(effectiveSlots)} × ${round4(60 / (r.dwellTimeMinutes ?? 1))} = ${round4(im.baseRate)} units/hr`
      );
      lines.push(
        `Availability ${(r.availability * 100).toFixed(0)}% → effective hours ${round4(im.effectiveHours)}h`
      );
    } else if (resourceClass === 'transport') {
      if (r.transportMode === 'discrete') {
        lines.push(
          `Transport (discrete): ${r.unitsPerTrip} units/trip, ${r.tripDurationMinutes}min/trip → ${round4(im.baseRate)} u/hr per vehicle`
        );
      } else {
        lines.push(`Transport (continuous): ${r.outputPerHour} u/hr per unit`);
      }
      lines.push(
        `× ${r.parallelUnits} vehicle(s) = ${round4(im.effectiveRateUnitsPerHour)} u/hr`
      );
      lines.push(
        `Availability ${(r.availability * 100).toFixed(0)}% → effective hours ${round4(im.effectiveHours)}h`
      );
    } else if (resourceClass === 'delay') {
      const delayMins = r.delayTimeMinutes ?? 0;
      lines.push(
        `Technical delay: ${delayMins}min → max throughput ${round4(im.baseRate)} u/hr`
      );
      lines.push(`No department — full calendar time available (${round4(im.scheduledHours)}h)`);
      lines.push(`No availability discount or yield loss (delay does not consume capacity)`);
    } else {
      // processing
      const processingMode = r.processingMode ?? r.type;
      lines.push(
        `Startup: ${r.dailyStartupMinutes}min/day → ${round4(im.startupHoursApplied)}h deducted`
      );
      lines.push(
        `Availability ${(r.availability * 100).toFixed(0)}% → effective hours ${round4(im.effectiveHours)}h`
      );
      if (processingMode === 'batch') {
        lines.push(
          `Base rate: ${r.batchSize} units / (${r.cycleTimeMinutes}min / 60) = ${round4(im.baseRate)} u/hr`
        );
      } else {
        lines.push(`Base rate: ${r.outputPerHour} u/hr (${processingMode})`);
      }
      lines.push(
        `Effective rate: ${round4(im.baseRate)} × ${r.parallelUnits} unit(s) = ${round4(im.effectiveRateUnitsPerHour)} u/hr`
        + ` [availability factored into hours, not rate]`
      );
    }
  }

  if (im.step.type === 'timeStep') {
    const d = (im.step as { durationMinutesPerUnit: number }).durationMinutesPerUnit;
    lines.push(`Rate: 60 / ${d}min = ${round4(im.effectiveRateUnitsPerHour)} u/hr`);
    lines.push(`Effective hours = scheduled hours (no availability factor for TimeStep)`);
  }

  if (im.conversionRatio !== 1) {
    lines.push(`Conversion ratio: ${round4(im.conversionRatio)} output units per input unit`);
  }
  lines.push(
    `Cumulative factor to end = ${round4(cumYieldToEnd)} → stepMaxGoodUnitsPerHour = ${round4(stepMaxGoodUnitsPerHour)}`
  );

  if (utilizationAtTarget !== null) {
    lines.push(
      `Utilization at target (${targetGoodUnits} units): ${(utilizationAtTarget * 100).toFixed(1)}%`
    );
  }

  return lines;
}
