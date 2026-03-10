/**
 * ComparisonResult builder — baseline vs scenario.
 *
 * Computes per-step deltas and high-level feasibility/bottleneck change flags.
 */

import type { RunResult, ComparisonResult, StepDelta } from './types';
import type { Scenario } from '../state/types';

export function buildComparison(
  baseline: RunResult,
  scenario: RunResult,
  scenarioDef?: Scenario
): ComparisonResult {
  const deltaMaxThroughput =
    scenario.summary.maxThroughputGoodUnits - baseline.summary.maxThroughputGoodUnits;

  const baselineFeasible = baseline.summary.feasible;
  const scenarioFeasible = scenario.summary.feasible;
  const feasibleChanged = baselineFeasible !== scenarioFeasible;
  const changedBottleneck =
    baseline.summary.bottleneckStepId !== scenario.summary.bottleneckStepId;

  // Step deltas: aligned by stepId
  const scenarioStepMap = new Map(scenario.steps.map(s => [s.stepId, s]));

  const stepDeltas: StepDelta[] = baseline.steps.map(baseStep => {
    const scenStep = scenarioStepMap.get(baseStep.stepId);
    const baseUtil = baseStep.utilizationAtTarget;
    const scenUtil = scenStep?.utilizationAtTarget ?? null;
    const baseGood = baseStep.stepMaxGoodUnitsOverHorizon;
    const scenGood = scenStep?.stepMaxGoodUnitsOverHorizon ?? null;

    return {
      stepId: baseStep.stepId,
      baselineUtilization: baseUtil,
      scenarioUtilization: scenUtil,
      deltaUtilization:
        baseUtil !== null && scenUtil !== null ? scenUtil - baseUtil : null,
      baselineMaxGoodUnits: baseGood,
      scenarioMaxGoodUnits: scenGood,
      deltaMaxGoodUnits:
        baseGood !== null && scenGood !== null ? scenGood - baseGood : null,
    };
  });

  // Determine which departments and resources changed via scenario overrides
  const changedDepartments: Array<{ departmentId: string; fieldsChanged: string[] }> = [];
  const changedResources: Array<{ resourceId: string; fieldsChanged: string[] }> = [];

  if (scenarioDef) {
    const deptOverrides = scenarioDef.departmentScheduleOverrides ?? {};
    for (const [deptId, override] of Object.entries(deptOverrides)) {
      changedDepartments.push({
        departmentId: deptId,
        fieldsChanged: Object.keys(override ?? {}),
      });
    }

    const resOverrides = scenarioDef.resourceOverrides ?? {};
    for (const [resId, override] of Object.entries(resOverrides)) {
      changedResources.push({
        resourceId: resId,
        fieldsChanged: Object.keys(override ?? {}),
      });
    }
  }

  return {
    baselineRunId: baseline.runId,
    scenarioRunId: scenario.runId,
    deltaMaxThroughputGoodUnits: Math.round(deltaMaxThroughput * 10000) / 10000,
    baselineFeasible,
    scenarioFeasible,
    feasibleChanged,
    changedBottleneck,
    stepDeltas,
    changedDepartments,
    changedResources,
  };
}
