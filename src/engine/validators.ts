/**
 * Validation pipeline for the V1 Capacity Engine.
 *
 * Phases (called in order by engine.ts):
 *   1. validateInput         — request parameters (blocking)
 *   2. validateFlowGraph     — graph topology (blocking)
 *   3. validateStepContent   — step/resource references (blocking + warnings)
 *   4. validateDepartmentSchedules — schedule ranges (blocking + warnings)
 *   5. validateResourceParams — capacity parameter ranges (warnings)
 *   6. validateScenarioOverrides — override merge safety (blocking + warnings)
 */

import type {
  EngineFlowStep,
  EngineResource,
  EngineDepartment,
  RunRequest,
  ValidationIssue,
  ValidationEntityType,
} from './types';
import type { FlowEdge } from './types';
import {
  ERR_INVALID_TARGET_GOOD_UNITS,
  ERR_INVALID_HORIZON_DAYS,
  ERR_INVALID_OPENING_HOURS,
  ERR_INVALID_AVAILABILITY,
  ERR_FLOW_NO_RESOURCE_STEP,
  ERR_TIMESTEP_NO_UPSTREAM_RESOURCE,
  ERR_MISSING_SLOT_CAPACITY,
  ERR_MISSING_DWELL_TIME,
  ERR_INVALID_DWELL_TIME,
  ERR_INVALID_SAFETY_MARGIN,
  ERR_MISSING_TRANSPORT_RATE,
  ERR_INVALID_TRIP_DURATION,
  ERR_MISSING_UNITS_PER_TRIP,
  ERR_MISSING_DELAY_TIME,
  ERR_INVALID_DELAY_TIME,
  WARN_DEPARTMENT_ALL_ZERO,
  WARN_SUSPICIOUS_AVAILABILITY,
  WARN_SUSPICIOUS_YIELD,
} from './types';
import { VALIDATION_CONSTANTS as VC } from './constants';
import type { Department as StateDepartment, ProcessElementCreateDraft, Resource } from '../state/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function issue(
  severity: ValidationIssue['severity'],
  code: string,
  message: string,
  entityType: ValidationEntityType,
  entityId: string | null = null,
  suggestedFix: string | null = null
): ValidationIssue {
  return { code, severity, message, entityType, entityId, suggestedFix };
}

function error(
  code: string,
  message: string,
  entityType: ValidationEntityType,
  entityId?: string | null,
  fix?: string | null
): ValidationIssue {
  return issue('error', code, message, entityType, entityId ?? null, fix ?? null);
}

function warning(
  code: string,
  message: string,
  entityType: ValidationEntityType,
  entityId?: string | null,
  fix?: string | null
): ValidationIssue {
  return issue('warning', code, message, entityType, entityId ?? null, fix ?? null);
}

// ---------------------------------------------------------------------------
// 1. Input validation (blocking)
// ---------------------------------------------------------------------------

export function validateInput(request: RunRequest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Number.isFinite(request.targetGoodUnits) || request.targetGoodUnits <= 0) {
    issues.push(
      error(
        ERR_INVALID_TARGET_GOOD_UNITS,
        `targetGoodUnits must be > 0, got ${request.targetGoodUnits}`,
        'input',
        null,
        'Set targetGoodUnits to a positive number'
      )
    );
  }

  if (
    !Number.isFinite(request.horizonCalendarDays) ||
    !Number.isInteger(request.horizonCalendarDays) ||
    request.horizonCalendarDays <= 0
  ) {
    issues.push(
      error(
        ERR_INVALID_HORIZON_DAYS,
        `horizonCalendarDays must be a positive integer, got ${request.horizonCalendarDays}`,
        'input',
        null,
        'Set horizonCalendarDays to a positive integer'
      )
    );
  }

  if (!request.startDateISO || !/^\d{4}-\d{2}-\d{2}$/.test(request.startDateISO)) {
    issues.push(
      error(
        'ERR_INVALID_START_DATE',
        `startDateISO must be a valid ISO date string (YYYY-MM-DD), got "${request.startDateISO}"`,
        'input',
        null,
        'Set startDateISO to a date in YYYY-MM-DD format'
      )
    );
  }

  if (!request.timezone) {
    issues.push(
      error(
        'ERR_INVALID_TIMEZONE',
        'timezone is required (IANA format, e.g. "Europe/Amsterdam")',
        'input',
        null,
        'Set timezone to a valid IANA timezone string'
      )
    );
  } else {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: request.timezone });
    } catch {
      issues.push(
        error(
          'ERR_INVALID_TIMEZONE',
          `timezone "${request.timezone}" is not a valid IANA timezone`,
          'input',
          null,
          'Use a valid IANA timezone identifier'
        )
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 2. Flow graph validation — topology only, no resource lookups (blocking)
// ---------------------------------------------------------------------------

export function validateFlowGraph(
  steps: EngineFlowStep[],
  edges: FlowEdge[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Count start and end nodes
  const starts = steps.filter(s => s.type === 'start');
  const ends = steps.filter(s => s.type === 'end');

  if (starts.length < 1) {
    issues.push(
      error(
        'ERR_FLOW_INVALID_START',
        `Flow must have at least 1 start node, found ${starts.length}`,
        'flow'
      )
    );
  }
  if (ends.length !== 1) {
    issues.push(
      error(
        'ERR_FLOW_INVALID_END',
        `Flow must have exactly 1 end node, found ${ends.length}`,
        'flow'
      )
    );
  }
  if (steps.length < 2) {
    issues.push(
      error('ERR_FLOW_TOO_SHORT', 'Flow must have at least 1 step between start and end', 'flow')
    );
  }

  // Build adjacency maps
  const nodeIds = new Set(steps.map(s => s.id));
  const outgoing = new Map<string, string[]>(); // id → [target ids]
  const incoming = new Map<string, string[]>(); // id → [source ids]

  for (const s of steps) {
    outgoing.set(s.id, []);
    incoming.set(s.id, []);
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source)) continue;
    if (!nodeIds.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }

  // Check for branches (any node with >1 outgoing edge)
  for (const [id, targets] of outgoing) {
    if (targets.length > 1) {
      issues.push(
        error(
          'ERR_FLOW_BRANCH',
          `Node "${id}" has ${targets.length} outgoing edges — flow must be linear`,
          'flow',
          id
        )
      );
    }
  }

  // Check for merges (any node with >1 incoming edge)
  for (const [id, sources] of incoming) {
    if (sources.length > 1) {
      issues.push(
        error(
          'ERR_FLOW_MERGE',
          `Node "${id}" has ${sources.length} incoming edges — flow must be linear`,
          'flow',
          id
        )
      );
    }
  }

  // Detect cycles via DFS and disconnected nodes
  if (starts.length === 1) {
    const startId = starts[0].id;
    const visited = new Set<string>();
    const inStack = new Set<string>();
    let hasCycle = false;

    const dfs = (id: string): void => {
      if (inStack.has(id)) { hasCycle = true; return; }
      if (visited.has(id)) return;
      visited.add(id);
      inStack.add(id);
      for (const next of outgoing.get(id) ?? []) {
        dfs(next);
      }
      inStack.delete(id);
    };

    dfs(startId);

    if (hasCycle) {
      issues.push(error('ERR_FLOW_CYCLE', 'Flow contains a cycle — must be a DAG', 'flow'));
    }

    // Disconnected nodes (not reachable from start)
    for (const s of steps) {
      if (!visited.has(s.id)) {
        issues.push(
          error(
            'ERR_FLOW_DISCONNECTED',
            `Node "${s.id}" is not reachable from the start node`,
            'flow',
            s.id
          )
        );
      }
    }
  }

  // Must have at least 1 resource step
  const hasResourceStep = steps.some(s => s.type === 'resourceStep');
  if (!hasResourceStep) {
    issues.push(
      error(
        ERR_FLOW_NO_RESOURCE_STEP,
        'Flow must contain at least 1 ResourceStep',
        'flow',
        null,
        'Add a ResourceStep linked to a resource'
      )
    );
  }

  // Contiguous enabled steps check (no gaps of disabled steps between enabled ones)
  const middleSteps = steps.filter(s => s.type === 'resourceStep' || s.type === 'timeStep');
  const enabledFlags = middleSteps.map(s => {
    if (s.type === 'resourceStep' || s.type === 'timeStep') {
      return s.enabled !== false;
    }
    return true;
  });
  const firstEnabled = enabledFlags.indexOf(true);
  const lastEnabled = enabledFlags.lastIndexOf(true);
  if (firstEnabled !== -1) {
    for (let i = firstEnabled; i <= lastEnabled; i++) {
      if (!enabledFlags[i]) {
        issues.push(
          error(
            'ERR_FLOW_NONCONTIGUOUS_ENABLED',
            'Disabled steps must not appear between enabled steps — enabled steps must form a contiguous chain',
            'flow',
            middleSteps[i].id
          )
        );
        break; // Report once
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 3. Step content validation — after linearisation, uses resource context (blocking)
// ---------------------------------------------------------------------------

export function validateStepContent(
  orderedSteps: EngineFlowStep[],
  resources: EngineResource[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const resourceMap = new Map(resources.map(r => [r.id, r]));

  let lastResourceStepDeptId: string | null = null;

  for (const step of orderedSteps) {
    if (step.type === 'start' || step.type === 'end') continue;

    if (step.type === 'resourceStep') {
      const resource = resourceMap.get(step.resourceId);
      if (!resource) {
        issues.push(
          error(
            'ERR_MISSING_RESOURCE',
            `ResourceStep "${step.id}" references unknown resourceId "${step.resourceId}"`,
            'step',
            step.id,
            'Link the step to an existing resource'
          )
        );
      } else {
        lastResourceStepDeptId = resource.departmentId;
      }
    }

    if (step.type === 'timeStep') {
      if (
        !Number.isFinite(step.durationMinutesPerUnit) ||
        step.durationMinutesPerUnit <= 0
      ) {
        issues.push(
          error(
            'ERR_TIMESTEP_INVALID_DURATION',
            `TimeStep "${step.id}" must have durationMinutesPerUnit > 0, got ${step.durationMinutesPerUnit}`,
            'step',
            step.id,
            'Set durationMinutesPerUnit to a positive number'
          )
        );
      }
      if (lastResourceStepDeptId === null) {
        issues.push(
          error(
            ERR_TIMESTEP_NO_UPSTREAM_RESOURCE,
            `TimeStep "${step.id}" has no upstream ResourceStep to inherit a department from`,
            'step',
            step.id,
            'Add a ResourceStep before this TimeStep'
          )
        );
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 4. Department schedule validation
// ---------------------------------------------------------------------------

export function validateDepartmentSchedules(
  departments: EngineDepartment[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

  for (const dept of departments) {
    let allZero = true;
    for (const day of days) {
      const h = dept.hoursByWeekday[day];
      if (!Number.isFinite(h) || h < 0 || h > 24) {
        issues.push(
          error(
            ERR_INVALID_OPENING_HOURS,
            `Department "${dept.name}" (${dept.id}): hours for "${day}" must be in [0, 24], got ${h}`,
            'department',
            dept.id,
            `Set ${day} hours to a value between 0 and 24`
          )
        );
      }
      if (h > 0) allZero = false;
    }
    if (allZero) {
      issues.push(
        warning(
          WARN_DEPARTMENT_ALL_ZERO,
          `Department "${dept.name}" (${dept.id}) has 0 hours on all weekdays — no production possible`,
          'department',
          dept.id,
          'Set at least one day to > 0 hours'
        )
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 5. Resource parameter validation (mostly warnings)
// ---------------------------------------------------------------------------

export function validateResourceParams(resources: EngineResource[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const r of resources) {
    const resourceClass = r.resourceClass ?? 'processing';

    // --- Availability: applies to all classes ---
    if (!Number.isFinite(r.availability) || r.availability < VC.availability.min || r.availability > VC.availability.max) {
      issues.push(
        error(
          ERR_INVALID_AVAILABILITY,
          `Resource "${r.name}" (${r.id}): availability must be in [${VC.availability.min}, ${VC.availability.max}], got ${r.availability}`,
          'resource',
          r.id,
          `Set availability to a value between ${VC.availability.min} and ${VC.availability.max}`
        )
      );
    } else if (r.availability < VC.availability.warnBelow) {
      issues.push(
        warning(
          WARN_SUSPICIOUS_AVAILABILITY,
          `Resource "${r.name}" (${r.id}): availability ${r.availability} is unusually low (< ${VC.availability.warnBelow * 100}%)`,
          'resource',
          r.id
        )
      );
    }

    // --- Class-specific validation ---

    if (resourceClass === 'processing') {
      // yieldPct
      if (!Number.isFinite(r.yieldPct) || r.yieldPct < VC.yieldPct.min || r.yieldPct > VC.yieldPct.max) {
        issues.push(
          error(
            'ERR_INVALID_YIELD',
            `Resource "${r.name}" (${r.id}): yieldPct must be in [${VC.yieldPct.min}, ${VC.yieldPct.max}], got ${r.yieldPct}`,
            'resource',
            r.id
          )
        );
      } else if (r.yieldPct < VC.yieldPct.warnBelow) {
        issues.push(
          warning(
            WARN_SUSPICIOUS_YIELD,
            `Resource "${r.name}" (${r.id}): yieldPct ${r.yieldPct}% is unusually low (< ${VC.yieldPct.warnBelow}%)`,
            'resource',
            r.id
          )
        );
      }

      // parallelUnits
      if (!Number.isFinite(r.parallelUnits) || r.parallelUnits < VC.parallelUnits.min || !Number.isInteger(r.parallelUnits)) {
        issues.push(
          error(
            'ERR_INVALID_PARALLEL_UNITS',
            `Resource "${r.name}" (${r.id}): parallelUnits must be an integer >= ${VC.parallelUnits.min}, got ${r.parallelUnits}`,
            'resource',
            r.id
          )
        );
      }

      // dailyStartupMinutes
      if (!Number.isFinite(r.dailyStartupMinutes) || r.dailyStartupMinutes < VC.dailyStartupMinutes.min) {
        issues.push(
          error(
            'ERR_INVALID_STARTUP_MINUTES',
            `Resource "${r.name}" (${r.id}): dailyStartupMinutes must be >= ${VC.dailyStartupMinutes.min}, got ${r.dailyStartupMinutes}`,
            'resource',
            r.id
          )
        );
      }

      const processingMode = r.processingMode ?? r.type;
      if (processingMode === 'continuous' || processingMode === 'manual') {
        if (!Number.isFinite(r.outputPerHour) || (r.outputPerHour ?? 0) < VC.outputPerHour.min) {
          issues.push(
            error(
              'ERR_INVALID_OUTPUT_PER_HOUR',
              `Resource "${r.name}" (${r.id}): outputPerHour must be > 0 for mode "${processingMode}", got ${r.outputPerHour}`,
              'resource',
              r.id
            )
          );
        }
      }

      if (processingMode === 'batch') {
        if (!Number.isFinite(r.batchSize) || (r.batchSize ?? 0) < VC.batchSize.min) {
          issues.push(
            error(
              'ERR_INVALID_BATCH_SIZE',
              `Resource "${r.name}" (${r.id}): batchSize must be > 0 for mode "batch", got ${r.batchSize}`,
              'resource',
              r.id
            )
          );
        }
        if (!Number.isFinite(r.cycleTimeMinutes) || (r.cycleTimeMinutes ?? 0) < VC.cycleTimeMinutes.min) {
          issues.push(
            error(
              'ERR_INVALID_CYCLE_TIME',
              `Resource "${r.name}" (${r.id}): cycleTimeMinutes must be >= ${VC.cycleTimeMinutes.min} for mode "batch", got ${r.cycleTimeMinutes}`,
              'resource',
              r.id
            )
          );
        }
      }
    }

    if (resourceClass === 'buffer') {
      if (!Number.isFinite(r.slotCapacity) || (r.slotCapacity ?? 0) <= 0) {
        issues.push(
          error(
            ERR_MISSING_SLOT_CAPACITY,
            `Buffer "${r.name}" (${r.id}): slotCapacity is required and must be > 0`,
            'resource',
            r.id,
            'Set slotCapacity to the maximum number of units the buffer can hold'
          )
        );
      }

      if (r.dwellTimeMinutes === undefined || r.dwellTimeMinutes === null) {
        issues.push(
          error(
            ERR_MISSING_DWELL_TIME,
            `Buffer "${r.name}" (${r.id}): dwellTimeMinutes is required — set how long a product stays in this buffer`,
            'resource',
            r.id,
            'Set dwellTimeMinutes to the average product residence time in minutes'
          )
        );
      } else if (!Number.isFinite(r.dwellTimeMinutes) || r.dwellTimeMinutes < VC.dwellTimeMinutes.min || r.dwellTimeMinutes > VC.dwellTimeMinutes.max) {
        issues.push(
          error(
            ERR_INVALID_DWELL_TIME,
            `Buffer "${r.name}" (${r.id}): dwellTimeMinutes must be in [${VC.dwellTimeMinutes.min}, ${VC.dwellTimeMinutes.max}], got ${r.dwellTimeMinutes}`,
            'resource',
            r.id
          )
        );
      }

      const safetyMarginPct = r.safetyMarginPct ?? 0;
      if (!Number.isFinite(safetyMarginPct) || safetyMarginPct < VC.safetyMarginPct.min || safetyMarginPct > VC.safetyMarginPct.max) {
        issues.push(
          error(
            ERR_INVALID_SAFETY_MARGIN,
            `Buffer "${r.name}" (${r.id}): safetyMarginPct must be in [${VC.safetyMarginPct.min}, ${VC.safetyMarginPct.max}], got ${safetyMarginPct}`,
            'resource',
            r.id,
            `Set safetyMarginPct between ${VC.safetyMarginPct.min} and ${VC.safetyMarginPct.max}`
          )
        );
      }
    }

    if (resourceClass === 'delay') {
      if (r.delayTimeMinutes === undefined || r.delayTimeMinutes === null) {
        issues.push(
          error(
            ERR_MISSING_DELAY_TIME,
            `Delay "${r.name}" (${r.id}): delayTimeMinutes is required — set the technical wait time in minutes`,
            'resource',
            r.id,
            'Set delayTimeMinutes to the required wait duration (e.g. cooling, drying, curing)'
          )
        );
      } else if (!Number.isFinite(r.delayTimeMinutes) || r.delayTimeMinutes < 0.1 || r.delayTimeMinutes > 10080) {
        issues.push(
          error(
            ERR_INVALID_DELAY_TIME,
            `Delay "${r.name}" (${r.id}): delayTimeMinutes must be in [0.1, 10080], got ${r.delayTimeMinutes}`,
            'resource',
            r.id,
            'Set delayTimeMinutes to a value between 0.1 and 10080 (7 days)'
          )
        );
      }
      // Other class-specific checks (processing/buffer/transport) below are guarded by
      // their own resourceClass conditions and will not run for 'delay'.
    }

    if (resourceClass === 'transport') {
      // parallelUnits
      if (!Number.isFinite(r.parallelUnits) || r.parallelUnits < VC.parallelUnits.min || !Number.isInteger(r.parallelUnits)) {
        issues.push(
          error(
            'ERR_INVALID_PARALLEL_UNITS',
            `Transport "${r.name}" (${r.id}): parallelUnits must be an integer >= ${VC.parallelUnits.min}, got ${r.parallelUnits}`,
            'resource',
            r.id
          )
        );
      }

      if (r.transportMode === 'discrete') {
        if (!Number.isFinite(r.unitsPerTrip) || (r.unitsPerTrip ?? 0) < VC.unitsPerTrip.min) {
          issues.push(
            error(
              ERR_MISSING_UNITS_PER_TRIP,
              `Transport "${r.name}" (${r.id}): unitsPerTrip must be > 0 for discrete transport, got ${r.unitsPerTrip}`,
              'resource',
              r.id,
              'Set unitsPerTrip to the load capacity per vehicle trip'
            )
          );
        }
        if (!Number.isFinite(r.tripDurationMinutes) || (r.tripDurationMinutes ?? 0) < VC.tripDurationMinutes.min) {
          issues.push(
            error(
              ERR_INVALID_TRIP_DURATION,
              `Transport "${r.name}" (${r.id}): tripDurationMinutes must be >= ${VC.tripDurationMinutes.min} for discrete transport, got ${r.tripDurationMinutes}`,
              'resource',
              r.id
            )
          );
        }
      } else {
        // continuous transport: needs outputPerHour
        if (!Number.isFinite(r.outputPerHour) || (r.outputPerHour ?? 0) < VC.outputPerHour.min) {
          issues.push(
            error(
              ERR_MISSING_TRANSPORT_RATE,
              `Transport "${r.name}" (${r.id}): outputPerHour must be > 0 for continuous transport, got ${r.outputPerHour}`,
              'resource',
              r.id,
              'Set outputPerHour to the conveyor/belt throughput in units per hour'
            )
          );
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 5b. Resource→Department link validation
// ---------------------------------------------------------------------------

export function validateResourceDepartmentLinks(
  resources: EngineResource[],
  departments: EngineDepartment[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const deptIds = new Set(departments.map(d => d.id));

  for (const r of resources) {
    // Delay resources have no department — skip department link validation.
    if ((r.resourceClass ?? 'processing') === 'delay') continue;

    if (!r.departmentId || !deptIds.has(r.departmentId)) {
      issues.push(
        error(
          'ERR_RESOURCE_INVALID_DEPARTMENT',
          `Resource "${r.name}" (${r.id}) references unknown or missing departmentId "${r.departmentId}"`,
          'resource',
          r.id,
          `Link resource "${r.name}" to an existing department`
        )
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 6. Scenario override validation
// ---------------------------------------------------------------------------

export function validateScenarioOverrides(
  resourceOverrides: Record<string, unknown> | undefined,
  departmentOverrides: Record<string, unknown> | undefined,
  resources: EngineResource[],
  departments: EngineDepartment[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (resourceOverrides) {
    const resourceIds = new Set(resources.map(r => r.id));
    for (const rid of Object.keys(resourceOverrides)) {
      if (!resourceIds.has(rid)) {
        issues.push(
          warning(
            'WARN_OVERRIDE_UNKNOWN_RESOURCE',
            `Scenario override references unknown resourceId "${rid}" — override will be ignored`,
            'scenario',
            rid
          )
        );
      }
      const override = resourceOverrides[rid] as Record<string, unknown>;
      // id and departmentId are immutable
      if (override && 'id' in override) {
        issues.push(
          error(
            'ERR_OVERRIDE_IMMUTABLE_ID',
            `Scenario override for resource "${rid}" attempts to change id — this field is immutable`,
            'scenario',
            rid,
            'Remove id from the resource override'
          )
        );
      }
      if (override && 'departmentId' in override) {
        issues.push(
          error(
            'ERR_OVERRIDE_IMMUTABLE_BINDING',
            `Scenario override for resource "${rid}" attempts to change departmentId — this binding is immutable`,
            'scenario',
            rid,
            'Remove departmentId from the resource override'
          )
        );
      }
    }
  }

  if (departmentOverrides) {
    const deptIds = new Set(departments.map(d => d.id));
    for (const did of Object.keys(departmentOverrides)) {
      if (!deptIds.has(did)) {
        issues.push(
          warning(
            'WARN_OVERRIDE_UNKNOWN_DEPARTMENT',
            `Scenario override references unknown departmentId "${did}" — override will be ignored`,
            'scenario',
            did
          )
        );
      }
      // Validate override hour values
      const override = departmentOverrides[did] as Record<string, unknown> | null;
      if (override) {
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        for (const day of days) {
          if (day in override) {
            const h = override[day] as number;
            if (!Number.isFinite(h) || h < 0 || h > 24) {
              issues.push(
                error(
                  ERR_INVALID_OPENING_HOURS,
                  `Department override for "${did}": hours for "${day}" must be in [0, 24], got ${h}`,
                  'scenario',
                  did
                )
              );
            }
          }
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 7. Department draft validation (UI form validation)
// ---------------------------------------------------------------------------

/** Helper: Calculate total hours from hoursByWeekday */
export function sumHoursByWeekday(hoursByWeekday: Record<string, number>): number {
  return (
    (hoursByWeekday.mon ?? 0) +
    (hoursByWeekday.tue ?? 0) +
    (hoursByWeekday.wed ?? 0) +
    (hoursByWeekday.thu ?? 0) +
    (hoursByWeekday.fri ?? 0) +
    (hoursByWeekday.sat ?? 0) +
    (hoursByWeekday.sun ?? 0)
  );
}

/** Validate department draft in UI forms. Returns field error map. */
export function validateDepartmentDraft(
  draft: Record<string, unknown>,
  existingDepartments: Record<string, unknown>[] = []
): Record<string, string> {
  const errors: Record<string, string> = {};

  // Name validation
  if (!draft.name || String(draft.name).trim() === '') {
    errors.name = 'Naam is verplicht';
  } else if (String(draft.name).trim().length < 2) {
    errors.name = 'Naam moet minstens 2 tekens zijn';
  } else {
    const duplicate = existingDepartments.find(
      d => String(d.id) !== String(draft.id) &&
           String(d.name ?? '').toLowerCase() === String(draft.name ?? '').toLowerCase()
    );
    if (duplicate) {
      errors.name = 'Een afdeling met deze naam bestaat al';
    }
  }

  // Color validation
  if (!draft.color || String(draft.color).trim() === '') {
    errors.color = 'Kleur is verplicht';
  }

  // Daily hours validation (each day must be >= 0)
  const hoursByWeekday = draft.hoursByWeekday as Record<string, number> | undefined;
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

  if (hoursByWeekday) {
    for (const day of days) {
      const hours = hoursByWeekday[day];
      if (hours === undefined || hours === null) {
        errors[`hoursByWeekday.${day}`] = 'Uren zijn verplicht';
      } else if (Number(hours) < 0) {
        errors[`hoursByWeekday.${day}`] = 'Uren kunnen niet negatief zijn';
      } else if (!Number.isFinite(Number(hours))) {
        errors[`hoursByWeekday.${day}`] = 'Uren moeten een getal zijn';
      }
    }
  }

  // Total weekly hours validation
  const weeklyTotal = hoursByWeekday ? sumHoursByWeekday(hoursByWeekday) : 0;

  if (weeklyTotal <= 0) {
    errors.hoursByWeekday = 'Totaal uren per week moet groter dan 0 zijn';
  } else if (weeklyTotal > 168) {
    errors.hoursByWeekday = 'Totaal uren per week kan niet meer dan 168 zijn (24 × 7)';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 8. Resource creation flow validation (UI form validation during creation modal)
// ---------------------------------------------------------------------------

/**
 * Validates a resource draft during the creation flow modal.
 * This is a lighter validation used during creation (before engine validation).
 * Returns field-level errors for the creation form.
 *
 * Note: This validation is intentionally permissive to allow users to progress through
 * the creation wizard. Full validation happens when the resource is saved to the engine.
 */
export function validateResourceForCreation(
  draft: Record<string, unknown>,
  deptIds: string[] = []
): Record<string, string> {
  const errors: Record<string, string> = {};
  const cls = (draft.resourceClass as string) ?? 'processing';

  // Name validation
  if (!draft.name || String(draft.name).trim() === '') {
    errors.name = 'Naam is verplicht';
  } else if (String(draft.name).trim().length < 2) {
    errors.name = 'Naam moet minstens 2 tekens zijn';
  }

  // Department required for everything except delay
  if (cls !== 'delay') {
    if (!draft.departmentId || !deptIds.includes(String(draft.departmentId))) {
      errors.departmentId = 'Selecteer een afdeling';
    }
  }

  // Class-specific validation
  if (cls === 'processing') {
    const mode = (draft.processingMode as string) ?? 'continuous';
    if (mode === 'continuous' || mode === 'manual') {
      if (!draft.outputPerHour || Number(draft.outputPerHour) <= 0) {
        errors.outputPerHour = mode === 'manual'
          ? 'Cyclustijd is vereist en moet groter dan 0 zijn'
          : 'Vereist en moet groter dan 0 zijn';
      }
    }
    if (mode === 'batch') {
      if (!draft.batchSize || Number(draft.batchSize) <= 0) {
        errors.batchSize = 'Vereist en moet groter dan 0 zijn';
      }
      if (!draft.cycleTimeMinutes || Number(draft.cycleTimeMinutes) < 0.1) {
        errors.cycleTimeMinutes = 'Vereist en moet ≥ 0.1 min zijn';
      }
    }
  }

  if (cls === 'buffer') {
    if (!draft.slotCapacity || Number(draft.slotCapacity) <= 0) {
      errors.slotCapacity = 'Buffergrootte is vereist en moet groter dan 0 zijn';
    }
    if (!draft.dwellTimeMinutes || Number(draft.dwellTimeMinutes) < 1) {
      errors.dwellTimeMinutes = 'Verblijftijd is vereist (min. 1 minuut)';
    }
  }

  if (cls === 'transport') {
    const tmode = (draft.transportMode as string) ?? 'discrete';
    if (tmode === 'discrete') {
      if (!draft.unitsPerTrip || Number(draft.unitsPerTrip) <= 0) {
        errors.unitsPerTrip = 'Laadvermogen is vereist en moet groter dan 0 zijn';
      }
      if (!draft.tripDurationMinutes || Number(draft.tripDurationMinutes) < 1) {
        errors.tripDurationMinutes = 'Rondrittijd is vereist (min. 1 minuut)';
      }
    } else {
      if (!draft.outputPerHour || Number(draft.outputPerHour) <= 0) {
        errors.outputPerHour = 'Vereist en moet groter dan 0 zijn';
      }
    }
  }

  if (cls === 'delay') {
    if (!draft.delayTimeMinutes || Number(draft.delayTimeMinutes) < 0.1) {
      errors.delayTimeMinutes = 'Wachttijd is vereist (min. 0.1 minuut)';
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 9. Process element creation flow validation (discriminated union validation)
// ---------------------------------------------------------------------------

/**
 * Validates a ProcessElementCreateDraft for use in the creation wizard.
 * This is the primary validator for the 4-step creation flow.
 *
 * Per LIBRARY_MVP_CONTRACT Section 15.5:
 * - Presence validation on all required fields per type
 * - Enum validation on Type and Delay mode
 * - Numeric fields > 0, except startup_loss >= 0
 * - Department must reference existing department ID (when applicable)
 * - Payload must not contain fields irrelevant to chosen type
 */
export function validateProcessElementCreateDraft(
  draft: ProcessElementCreateDraft,
  departments: StateDepartment[]
): Record<string, string> {
  const errors: Record<string, string> = {};
  const deptIds = new Set(departments.map(d => d.id));

  // === Common fields (all types) ===
  if (!draft.name || draft.name.trim() === '') {
    errors.name = 'Name is required';
  }

  if (typeof draft.availability !== 'number' || draft.availability <= 0 || draft.availability > 1) {
    errors.availability = 'Availability must be between 0 (exclusive) and 1 (inclusive)';
  }

  if (typeof draft.yieldPct !== 'number' || draft.yieldPct <= 0 || draft.yieldPct > 100) {
    errors.yieldPct = 'Yield must be between 0 (exclusive) and 100 (inclusive)';
  }

  if (typeof draft.dailyStartupMinutes !== 'number' || draft.dailyStartupMinutes < 0) {
    errors.dailyStartupMinutes = 'Startup loss must be 0 or greater';
  }

  // === Conditional Department Validation (Section 15.3) ===
  const cls = draft.resourceClass;
  if (cls === 'delay') {
    // Delay MUST NOT have department (Section 15.3)
    // No department validation needed for delay
  } else {
    // All other types REQUIRE department (Section 15.2)
    if (!draft.departmentId || !deptIds.has(draft.departmentId)) {
      errors.departmentId = 'Department must be selected';
    }
  }

  // === Type-specific validation ===

  if (cls === 'processing') {
    const d = draft as any; // Type guard: ProcessingCreateDraft

    if (!d.processingMode || !['continuous', 'batch', 'manual'].includes(d.processingMode)) {
      errors.processingMode = 'Processing mode is required';
    }

    if (typeof d.parallelUnits !== 'number' || d.parallelUnits < 1 || !Number.isInteger(d.parallelUnits)) {
      errors.parallelUnits = 'Parallel units must be an integer >= 1';
    }

    const mode = d.processingMode;
    if (mode === 'continuous') {
      if (typeof d.outputPerHour !== 'number' || d.outputPerHour <= 0) {
        errors.outputPerHour = 'Output per hour must be greater than 0';
      }
    } else if (mode === 'batch') {
      if (typeof d.batchSize !== 'number' || d.batchSize <= 0) {
        errors.batchSize = 'Batch size must be greater than 0';
      }
      if (typeof d.cycleTimeMinutes !== 'number' || d.cycleTimeMinutes <= 0) {
        errors.cycleTimeMinutes = 'Cycle time must be greater than 0';
      }
    } else if (mode === 'manual') {
      if (typeof d.cycleTimeMinutes !== 'number' || d.cycleTimeMinutes <= 0) {
        errors.cycleTimeMinutes = 'Cycle time must be greater than 0';
      }
    }
  }

  if (cls === 'buffer') {
    const d = draft as any; // Type guard: BufferCreateDraft

    if (typeof d.slotCapacity !== 'number' || d.slotCapacity <= 0) {
      errors.slotCapacity = 'Slot capacity must be greater than 0';
    }

    if (typeof d.dwellTimeMinutes !== 'number' || d.dwellTimeMinutes <= 0) {
      errors.dwellTimeMinutes = 'Dwell time must be greater than 0';
    }

    if (d.safetyMarginPct !== undefined) {
      if (typeof d.safetyMarginPct !== 'number' || d.safetyMarginPct < 0 || d.safetyMarginPct > 100) {
        errors.safetyMarginPct = 'Safety margin must be between 0 and 100';
      }
    }
  }

  if (cls === 'transport') {
    const d = draft as any; // Type guard: TransportCreateDraft

    if (!d.transportMode || !['continuous', 'discrete'].includes(d.transportMode)) {
      errors.transportMode = 'Transport mode is required';
    }

    if (typeof d.parallelUnits !== 'number' || d.parallelUnits < 1 || !Number.isInteger(d.parallelUnits)) {
      errors.parallelUnits = 'Parallel units must be an integer >= 1';
    }

    const mode = d.transportMode;
    if (mode === 'continuous') {
      if (typeof d.outputPerHour !== 'number' || d.outputPerHour <= 0) {
        errors.outputPerHour = 'Output per hour must be greater than 0';
      }
    } else if (mode === 'discrete') {
      if (typeof d.unitsPerTrip !== 'number' || d.unitsPerTrip <= 0) {
        errors.unitsPerTrip = 'Units per trip must be greater than 0';
      }
      if (typeof d.tripDurationMinutes !== 'number' || d.tripDurationMinutes <= 0) {
        errors.tripDurationMinutes = 'Trip duration must be greater than 0';
      }
    }
  }

  if (cls === 'delay') {
    const d = draft as any; // Type guard: DelayCreateDraft

    if (!d.delayMode || !['per_unit', 'per_batch'].includes(d.delayMode)) {
      errors.delayMode = 'Delay mode is required (per_unit or per_batch)';
    }

    if (typeof d.delayTimeMinutes !== 'number' || d.delayTimeMinutes <= 0) {
      errors.delayTimeMinutes = 'Delay time must be greater than 0';
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 10. Sanitize draft by type (remove irrelevant fields)
// ---------------------------------------------------------------------------

/**
 * Removes fields that don't belong to the resource class type.
 * Per LIBRARY_MVP_CONTRACT Section 15.3: "If type changes, irrelevant type-specific
 * fields must be removed or ignored before validation and storage."
 *
 * This ensures clean payloads before validation and creation.
 */
export function sanitizeDraftByType(draft: ProcessElementCreateDraft): ProcessElementCreateDraft {
  const cls = draft.resourceClass;

  if (cls === 'processing') {
    const d = draft as any;
    const mode = d.processingMode;

    if (mode === 'continuous') {
      // Keep outputPerHour, discard batchSize/cycleTimeMinutes
      return {
        resourceClass: 'processing',
        name: d.name,
        description: d.description,
        departmentId: d.departmentId,
        availability: d.availability,
        yieldPct: d.yieldPct,
        dailyStartupMinutes: d.dailyStartupMinutes,
        processingMode: d.processingMode,
        outputPerHour: d.outputPerHour,
        parallelUnits: d.parallelUnits,
      } as any;
    } else if (mode === 'batch') {
      // Keep batchSize/cycleTimeMinutes/batchSetupMinutes, discard outputPerHour
      return {
        resourceClass: 'processing',
        name: d.name,
        description: d.description,
        departmentId: d.departmentId,
        availability: d.availability,
        yieldPct: d.yieldPct,
        dailyStartupMinutes: d.dailyStartupMinutes,
        processingMode: d.processingMode,
        batchSize: d.batchSize,
        cycleTimeMinutes: d.cycleTimeMinutes,
        batchSetupMinutes: d.batchSetupMinutes,
        parallelUnits: d.parallelUnits,
      } as any;
    } else if (mode === 'manual') {
      // Keep cycleTimeMinutes, discard batchSize/outputPerHour
      return {
        resourceClass: 'processing',
        name: d.name,
        description: d.description,
        departmentId: d.departmentId,
        availability: d.availability,
        yieldPct: d.yieldPct,
        dailyStartupMinutes: d.dailyStartupMinutes,
        processingMode: d.processingMode,
        cycleTimeMinutes: d.cycleTimeMinutes,
        parallelUnits: d.parallelUnits,
      } as any;
    }
  }

  if (cls === 'buffer') {
    const d = draft as any;
    return {
      resourceClass: 'buffer',
      name: d.name,
      description: d.description,
      departmentId: d.departmentId,
      availability: d.availability,
      yieldPct: d.yieldPct,
      dailyStartupMinutes: d.dailyStartupMinutes,
      slotCapacity: d.slotCapacity,
      dwellTimeMinutes: d.dwellTimeMinutes,
      safetyMarginPct: d.safetyMarginPct,
    } as any;
  }

  if (cls === 'transport') {
    const d = draft as any;
    const mode = d.transportMode;

    if (mode === 'continuous') {
      // Keep outputPerHour, discard unitsPerTrip/tripDurationMinutes
      return {
        resourceClass: 'transport',
        name: d.name,
        description: d.description,
        departmentId: d.departmentId,
        availability: d.availability,
        yieldPct: d.yieldPct,
        dailyStartupMinutes: d.dailyStartupMinutes,
        transportMode: d.transportMode,
        outputPerHour: d.outputPerHour,
        parallelUnits: d.parallelUnits,
      } as any;
    } else if (mode === 'discrete') {
      // Keep unitsPerTrip/tripDurationMinutes, discard outputPerHour
      return {
        resourceClass: 'transport',
        name: d.name,
        description: d.description,
        departmentId: d.departmentId,
        availability: d.availability,
        yieldPct: d.yieldPct,
        dailyStartupMinutes: d.dailyStartupMinutes,
        transportMode: d.transportMode,
        unitsPerTrip: d.unitsPerTrip,
        tripDurationMinutes: d.tripDurationMinutes,
        parallelUnits: d.parallelUnits,
      } as any;
    }
  }

  if (cls === 'delay') {
    const d = draft as any;
    return {
      resourceClass: 'delay',
      name: d.name,
      description: d.description,
      availability: d.availability,
      yieldPct: d.yieldPct,
      dailyStartupMinutes: d.dailyStartupMinutes,
      delayMode: d.delayMode,
      delayTimeMinutes: d.delayTimeMinutes,
      // Explicitly exclude departmentId for delay (Section 15.3)
    } as any;
  }

  return draft;
}

// ---------------------------------------------------------------------------
// 11. Normalize create draft to resource (transformation for engine)
// ---------------------------------------------------------------------------

/**
 * Transforms a ProcessElementCreateDraft into a Resource object.
 * Per LIBRARY_MVP_CONTRACT Section 15.6: "After successful creation, the stored object
 * must be directly usable for engine calculation without additional transformation."
 */
export function normalizeCreateDraftToResource(draft: ProcessElementCreateDraft): Omit<Resource, 'id'> {
  const cls = draft.resourceClass;

  // Common fields for all types
  const common = {
    name: draft.name,
    description: draft.description,
    availability: draft.availability,
    yieldPct: draft.yieldPct,
    dailyStartupMinutes: draft.dailyStartupMinutes,
    resourceClass: cls,
    type: cls === 'delay' ? 'continuous' : 'continuous' as any, // Legacy compatibility
  };

  if (cls === 'processing') {
    const d = draft as any;
    return {
      ...common,
      type: 'continuous',
      departmentId: d.departmentId,
      processingMode: d.processingMode,
      parallelUnits: d.parallelUnits,
      ...(d.processingMode === 'continuous' && { outputPerHour: d.outputPerHour }),
      ...(d.processingMode === 'batch' && { batchSize: d.batchSize, cycleTimeMinutes: d.cycleTimeMinutes, batchSetupMinutes: d.batchSetupMinutes }),
      ...(d.processingMode === 'manual' && { cycleTimeMinutes: d.cycleTimeMinutes }),
    } as Omit<Resource, 'id'>;
  }

  if (cls === 'buffer') {
    const d = draft as any;
    return {
      ...common,
      type: 'continuous',
      departmentId: d.departmentId,
      slotCapacity: d.slotCapacity,
      dwellTimeMinutes: d.dwellTimeMinutes,
      safetyMarginPct: d.safetyMarginPct,
    } as Omit<Resource, 'id'>;
  }

  if (cls === 'transport') {
    const d = draft as any;
    return {
      ...common,
      type: 'continuous',
      departmentId: d.departmentId,
      transportMode: d.transportMode,
      parallelUnits: d.parallelUnits,
      ...(d.transportMode === 'continuous' && { outputPerHour: d.outputPerHour }),
      ...(d.transportMode === 'discrete' && { unitsPerTrip: d.unitsPerTrip, tripDurationMinutes: d.tripDurationMinutes }),
    } as Omit<Resource, 'id'>;
  }

  if (cls === 'delay') {
    const d = draft as any;
    return {
      ...common,
      type: 'continuous',
      // Explicitly NO departmentId for delay (Section 15.3)
      delayMode: d.delayMode,
      delayTimeMinutes: d.delayTimeMinutes,
    } as Omit<Resource, 'id'>;
  }

  // Fallback (should never reach here if draft is valid)
  return {
    ...common,
    type: 'continuous',
    parallelUnits: 1,
  } as Omit<Resource, 'id'>;
}
