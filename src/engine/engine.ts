/**
 * V1 Capacity Engine — Main entry point.
 *
 * Public API:
 *   run(state, requestParams) → RunBundle
 *
 * The engine is a pure function:
 *   - Deterministic
 *   - No side effects
 *   - No storage writes
 *
 * Pipeline:
 *   1. buildEngineInput    — convert ProjectState + scenario overlay → EngineInput
 *   2. validateInput       — blocking request-level errors
 *   3. validateFlowGraph   — blocking graph topology errors
 *   4. linearizeFlow       — ordered EngineFlowStep[]
 *   5. validateStepContent — blocking step/resource reference errors
 *   6. validateDepts       — blocking schedule range errors
 *   7. validateResources   — warnings
 *   8. validateOverrides   — scenario override safety
 *   9. assignInheritedDepartments
 *  10. computeScheduledHours
 *  11. computeStepResults
 *  12. selectBottleneck
 *  13. buildRunResult
 *  14. (if scenario active) repeat for scenario, build comparison
 */

import type {
  RunRequest,
  RunBundle,
  RunResult,
  RunSummary,
  ValidationReport,
  ValidationIssue,
  EngineInput,
  EngineResource,
  EngineDepartment,
  EngineFlowStep,
} from './types';
import type { ProjectState, Scenario } from '../state/types';
import { linearizeFlow, assignInheritedDepartments } from './flow';
import { computeScheduledHours } from './scheduler';
import { computeStepResults } from './calculator';
import { selectBottleneck } from './bottleneck';
import { buildComparison } from './comparison';
import {
  validateInput,
  validateFlowGraph,
  validateStepContent,
  validateDepartmentSchedules,
  validateResourceParams,
  validateResourceDepartmentLinks,
  validateScenarioOverrides,
} from './validators';

const ENGINE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// ID generator (non-crypto, sufficient for run IDs)
// ---------------------------------------------------------------------------

function genRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// State → EngineInput conversion
// ---------------------------------------------------------------------------

/**
 * Converts the application's ProjectState into an EngineInput.
 * If scenarioId is provided, applies scenario overrides in-memory.
 *
 * Returns both the effective EngineInput and any override warnings.
 */
function buildEngineInput(
  state: ProjectState,
  scenarioId: string | null
): { input: EngineInput; overrideWarnings: ValidationIssue[] } {
  // Clone resources: baseline is never mutated.
  // We create new objects to ensure scenario overrides don't affect the original state.
  // resourceClass defaults to 'processing' for legacy resources without the field.
  const resources: EngineResource[] = state.resources.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    departmentId: r.departmentId,
    // v2 class system
    resourceClass: r.resourceClass ?? 'processing',
    processingMode: r.processingMode,
    // Processing fields
    outputPerHour: r.outputPerHour,
    batchSize: r.batchSize,
    cycleTimeMinutes: r.cycleTimeMinutes,
    batchSetupMinutes: r.batchSetupMinutes,
    parallelUnits: r.parallelUnits,
    yieldPct: r.yieldPct,
    availability: r.availability,
    dailyStartupMinutes: r.dailyStartupMinutes,
    // Buffer fields
    slotCapacity: r.slotCapacity,
    slotUnit: r.slotUnit,
    safetyMarginPct: r.safetyMarginPct,
    dwellTimeMinutes: r.dwellTimeMinutes,
    maxHoldMinutes: r.maxHoldMinutes,
    // Transport fields
    transportMode: r.transportMode,
    unitsPerTrip: r.unitsPerTrip,
    tripDurationMinutes: r.tripDurationMinutes,
    // Delay fields
    delayTimeMinutes: r.delayTimeMinutes,
    delayMode: r.delayMode,
  }));

  // Clone departments with deep copy of hoursByWeekday: baseline is never mutated.
  const departments: EngineDepartment[] = state.departments.map(d => ({
    id: d.id,
    name: d.name,
    color: d.color,
    hoursByWeekday: { ...d.hoursByWeekday },  // Deep copy of nested object
  }));

  // Convert flow nodes → EngineFlowStep[]
  // Silently filters out malformed nodes (missing required fields).
  // These will be caught by validateFlowGraph and validateStepContent later.
  const steps: EngineFlowStep[] = state.nodes
    .map((node): EngineFlowStep | null => {
      if (node.nodeType === 'start') return { type: 'start', id: node.id };
      if (node.nodeType === 'end') return { type: 'end', id: node.id };
      if (node.nodeType === 'resourceStep' && node.resourceId) {
        return {
          type: 'resourceStep',
          id: node.id,
          label: node.name,
          resourceId: node.resourceId,
          enabled: node.enabled !== false,
          inputMaterialId: node.inputMaterialId,
          outputMaterialId: node.outputMaterialId,
          conversionRatio: node.conversionRatio,
        };
      }
      if (node.nodeType === 'timeStep' && node.durationMinutesPerUnit !== undefined) {
        return {
          type: 'timeStep',
          id: node.id,
          label: node.name,
          durationMinutesPerUnit: node.durationMinutesPerUnit,
          enabled: node.enabled !== false,
          inputMaterialId: node.inputMaterialId,
          outputMaterialId: node.outputMaterialId,
          conversionRatio: node.conversionRatio,
        };
      }
      return null;
    })
    .filter((s): s is EngineFlowStep => s !== null);

  // Apply scenario overrides if requested
  let overrideWarnings: ValidationIssue[] = [];

  if (scenarioId) {
    const scenario = state.scenarios.find(s => s.id === scenarioId);
    if (scenario) {
      overrideWarnings = validateScenarioOverrides(
        scenario.resourceOverrides as Record<string, unknown> | undefined,
        scenario.departmentScheduleOverrides as Record<string, unknown> | undefined,
        resources,
        departments
      );

      applyScenarioOverrides(scenario, resources, departments);
    }
  }

  return {
    input: { resources, departments, steps },
    overrideWarnings,
  };
}

/**
 * Applies scenario overrides in-place on the mutable copies of resources and departments.
 * Baseline is never mutated — this operates on already-cloned arrays.
 *
 * Strategy: Shallow merge is sufficient because override values are primitives (numbers, strings),
 * never nested objects. Immutable fields (id, departmentId) are explicitly re-locked after merge
 * to prevent accidental override.
 */
function applyScenarioOverrides(
  scenario: Scenario,
  resources: EngineResource[],
  departments: EngineDepartment[]
): void {
  // Resource overrides — shallow merge, immutable fields (id, departmentId) re-locked
  if (scenario.resourceOverrides) {
    const resourceMap = new Map(resources.map((r, i) => [r.id, i]));
    for (const [resId, override] of Object.entries(scenario.resourceOverrides)) {
      const idx = resourceMap.get(resId);
      if (idx === undefined || !override) continue;
      const current = resources[idx];
      resources[idx] = {
        ...current,
        ...override,
        // Always use baseline values for immutable fields
        id: current.id,
        departmentId: current.departmentId,
      };
    }
  }

  // Department schedule overrides — shallow merge of hoursByWeekday
  if (scenario.departmentScheduleOverrides) {
    const deptMap = new Map(departments.map((d, i) => [d.id, i]));
    for (const [deptId, override] of Object.entries(scenario.departmentScheduleOverrides)) {
      const idx = deptMap.get(deptId);
      if (idx === undefined || !override) continue;
      departments[idx] = {
        ...departments[idx],
        hoursByWeekday: {
          ...departments[idx].hoursByWeekday,
          ...override,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Error RunResult builder
// ---------------------------------------------------------------------------

function buildErrorRunResult(
  issues: ValidationIssue[],
  request: RunRequest,
  mode: 'baseline' | 'scenario'
): RunResult {
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return {
    runId: request.runId,
    mode,
    projectId: request.projectId,
    scenarioId: request.scenarioId,
    status: 'error',
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    inputs: request,
    summary: {
      targetGoodUnits: request.targetGoodUnits,
      horizonCalendarDays: request.horizonCalendarDays,
      startDateISO: request.startDateISO,
      timezone: request.timezone,
      totalScheduledHoursByDepartment: {},
      totalEffectiveHoursByStep: {},
      feasible: false,
      maxThroughputGoodUnits: 0,
      bottleneckBasisHours: null,
      requiredGoodUnitsPerHourAtBottleneckBasis: null,
      bottleneckStepId: null,
      bottleneckResourceId: null,
      bottleneckType: null,
    },
    steps: [],
    bottleneck: null,
    validation: {
      flowValid: false,
      resourceLinksValid: false,
      departmentSchedulesValid: false,
      errors,
      warnings,
    },
  };
}

// ---------------------------------------------------------------------------
// Single run (called after flow validation in run())
// ---------------------------------------------------------------------------

/**
 * Executes a single run (baseline or scenario).
 *
 * Preconditions:
 *   - Flow graph has already been validated in run()
 *   - Input steps are already linearised
 */
function runSingle(
  input: EngineInput,
  request: RunRequest,
  mode: 'baseline' | 'scenario',
  extraWarnings: ValidationIssue[] = []
): RunResult {
  const allIssues: ValidationIssue[] = [...extraWarnings];

  // 1. Input validation
  const inputErrors = validateInput(request);
  allIssues.push(...inputErrors);
  if (inputErrors.some(e => e.severity === 'error')) {
    return buildErrorRunResult(allIssues, request, mode);
  }

  // 2. Linearised flow — already validated & ordered in run()
  const orderedSteps = input.steps;

  // 3. Resource→Department link validation
  const resourceDeptErrors = validateResourceDepartmentLinks(input.resources, input.departments);
  allIssues.push(...resourceDeptErrors);

  // 4. Step content validation
  const stepContentErrors = validateStepContent(orderedSteps, input.resources);
  allIssues.push(...stepContentErrors);

  // 5. Department schedule validation
  const deptErrors = validateDepartmentSchedules(input.departments);
  allIssues.push(...deptErrors);

  // 6. Resource parameter validation (warnings)
  const resourceWarnings = validateResourceParams(input.resources);
  allIssues.push(...resourceWarnings);

  const hasBlockingErrors = allIssues.some(i => i.severity === 'error');

  if (hasBlockingErrors) {
    return buildErrorRunResult(allIssues, request, mode);
  }

  // 7. Assign inherited departments
  const stepsWithDepts = assignInheritedDepartments(
    orderedSteps,
    input.resources,
    input.departments
  );

  // 8. Compute scheduled hours
  const { totalScheduledHoursByDepartment, productionDaysByDepartment } =
    computeScheduledHours(
      input.departments,
      request.startDateISO,
      request.timezone,
      request.horizonCalendarDays
    );

  // 9. Compute step results
  const stepResults = computeStepResults(
    stepsWithDepts,
    input.resources,
    input.departments,
    totalScheduledHoursByDepartment,
    productionDaysByDepartment,
    request
  );

  // 10. System throughput
  const enabledStepResults = stepResults.filter(s => s.enabled);
  const maxThroughputGoodUnits =
    enabledStepResults.length > 0
      ? Math.min(...enabledStepResults.map(s => s.stepMaxGoodUnitsOverHorizon))
      : 0;

  // 11. Feasibility
  const feasible = maxThroughputGoodUnits >= request.targetGoodUnits;

  // 12. Bottleneck
  const bottleneckResult = selectBottleneck(stepResults);

  // 13. Total effective hours by step
  const totalEffectiveHoursByStep: Record<string, number> = {};
  for (const s of stepResults) {
    totalEffectiveHoursByStep[s.stepId] = s.effectiveHours;
  }

  // 14. Summary
  const summary: RunSummary = {
    targetGoodUnits: request.targetGoodUnits,
    horizonCalendarDays: request.horizonCalendarDays,
    startDateISO: request.startDateISO,
    timezone: request.timezone,
    totalScheduledHoursByDepartment,
    totalEffectiveHoursByStep,
    feasible,
    maxThroughputGoodUnits: Math.round(maxThroughputGoodUnits * 10000) / 10000,
    bottleneckBasisHours: bottleneckResult?.effectiveHours ?? null,
    requiredGoodUnitsPerHourAtBottleneckBasis:
      bottleneckResult?.effectiveHours && bottleneckResult.effectiveHours > 0
        ? Math.round(
            (request.targetGoodUnits / bottleneckResult.effectiveHours) * 10000
          ) / 10000
        : null,
    bottleneckStepId: bottleneckResult?.stepId ?? null,
    bottleneckResourceId: bottleneckResult?.resourceId ?? null,
    bottleneckType: bottleneckResult?.type ?? null,
  };

  // 15. Determine run status
  const hasWarnings = allIssues.some(i => i.severity === 'warning') || !feasible;
  const status = hasBlockingErrors ? 'error' : hasWarnings ? 'warning' : 'ok';

  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  // Determine validity flags based on error categories
  const validation: ValidationReport = {
    flowValid: !errors.some(e => e.entityType === 'flow' || (e.entityType === 'step' && e.code === 'ERR_TIMESTEP_NO_UPSTREAM_RESOURCE')),
    resourceLinksValid: !errors.some(e => e.entityType === 'resource' || (e.entityType === 'step' && e.code.startsWith('ERR_MISSING'))),
    departmentSchedulesValid: !errors.some(e => e.entityType === 'department'),
    errors,
    warnings,
  };

  return {
    runId: request.runId,
    mode,
    projectId: request.projectId,
    scenarioId: request.scenarioId,
    status,
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    inputs: request,
    summary,
    steps: stepResults,
    bottleneck: bottleneckResult,
    validation,
  };
}

// ---------------------------------------------------------------------------
// Public run() function
// ---------------------------------------------------------------------------

export type RunParams = {
  projectId: string;
  scenarioId: string | null;
  targetGoodUnits: number;
  horizonCalendarDays: number;
  startDateISO: string;
  timezone: string;
};

/**
 * Main engine entry point. Pure function — no side effects.
 *
 * Deterministic calculation, non-deterministic metadata:
 * - Calculations (throughput, feasibility, bottleneck) are deterministic given inputs
 * - IDs and timestamps are unique per run (intentional for traceability)
 *
 * Runs baseline always; if scenarioId is provided and an active scenario with
 * demand params exists, also runs the scenario and builds a ComparisonResult.
 * Scenario demand parameters (target, horizon, startDate, timezone) override baseline.
 *
 * @param state         The current ProjectState (read-only)
 * @param params        Run parameters (demand, horizon, timezone) — used for baseline
 */
export function run(state: ProjectState, params: RunParams): RunBundle {
  const baseRequest: RunRequest = {
    runId: genRunId(),
    projectId: params.projectId,
    scenarioId: null,
    mode: 'baseline',
    requestedAt: new Date().toISOString(),
    horizonCalendarDays: params.horizonCalendarDays,
    targetGoodUnits: params.targetGoodUnits,
    startDateISO: params.startDateISO,
    timezone: params.timezone,
    engineVersion: ENGINE_VERSION,
  };

  // Build baseline input (no scenario overlay)
  const { input: baselineInput, overrideWarnings: _ } = buildEngineInput(state, null);

  // Validate graph topology once for baseline (before linearising)
  const graphIssues = validateFlowGraph(baselineInput.steps, state.edges as import('./types').FlowEdge[]);
  const baselineHasGraphError = graphIssues.some(e => e.severity === 'error');

  let baselineInputLinearised: EngineInput;
  if (baselineHasGraphError) {
    // Return early with error bundle — cannot linearise an invalid graph
    const baselineResult = buildErrorRunResult(
      graphIssues,
      baseRequest,
      'baseline'
    );
    return { baseline: baselineResult, scenario: null, comparison: null };
  } else {
    const linearised = linearizeFlow(baselineInput.steps, state.edges as import('./types').FlowEdge[]);
    baselineInputLinearised = { ...baselineInput, steps: linearised };
  }

  const baselineResult = runSingle(baselineInputLinearised, baseRequest, 'baseline');

  // If no scenario, return baseline-only bundle
  if (!params.scenarioId) {
    return { baseline: baselineResult, scenario: null, comparison: null };
  }

  const scenario = state.scenarios.find(s => s.id === params.scenarioId);
  if (!scenario) {
    return { baseline: baselineResult, scenario: null, comparison: null };
  }

  // Build scenario input (with overlay)
  const { input: scenarioInputRaw, overrideWarnings } = buildEngineInput(state, params.scenarioId);
  const scenarioLinearised = linearizeFlow(scenarioInputRaw.steps, state.edges as import('./types').FlowEdge[]);
  const scenarioInput: EngineInput = { ...scenarioInputRaw, steps: scenarioLinearised };

  // Use scenario demand parameters if defined; otherwise fall back to baseline
  const scenarioDemand = scenario.demand;
  const scenarioRequest: RunRequest = {
    runId: genRunId(),
    projectId: params.projectId,
    scenarioId: params.scenarioId,
    mode: 'scenario',
    requestedAt: new Date().toISOString(),
    horizonCalendarDays: scenarioDemand?.horizonCalendarDays ?? params.horizonCalendarDays,
    targetGoodUnits: scenarioDemand?.targetGoodUnits ?? params.targetGoodUnits,
    startDateISO: scenarioDemand?.startDateISO ?? params.startDateISO,
    timezone: scenarioDemand?.timezone ?? params.timezone,
    engineVersion: ENGINE_VERSION,
  };

  const scenarioResult = runSingle(scenarioInput, scenarioRequest, 'scenario', overrideWarnings);

  const comparison = buildComparison(baselineResult, scenarioResult, scenario);

  return {
    baseline: baselineResult,
    scenario: scenarioResult,
    comparison,
  };
}
