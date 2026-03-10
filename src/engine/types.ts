/**
 * V1 Capacity Engine — Domain Types
 *
 * Pure TypeScript types. No React or state-layer dependencies.
 * These types are the single source of truth for the engine and the dashboard.
 *
 * Naming conventions:
 *   - Time values in ...Minutes or ...Hours (not mixed)
 *   - Percentages (0–100): ...Pct
 *   - Ratios (0–1): availability, cumYieldToEnd
 *   - Error codes: ERR_<DOMAIN>_<SUBJECT> (UPPER_SNAKE_CASE)
 *   - Warning codes: WARN_<DOMAIN>_<SUBJECT>
 */

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/** @deprecated Use ResourceClass + ProcessingMode instead. Kept for backward compat. */
export type EngineResourceType = 'continuous' | 'batch' | 'manual';

/**
 * Top-level resource classification.
 * Determines which capacity formula applies and which fields are used.
 */
export type ResourceClass = 'processing' | 'buffer' | 'transport' | 'delay';

/** Delay sub-type — only relevant when resourceClass = 'delay'. */
export type DelayMode = 'per_unit' | 'per_batch';

/**
 * Processing sub-type — only relevant when resourceClass = 'processing'.
 * Replaces the legacy EngineResourceType.
 */
export type ProcessingMode = 'continuous' | 'batch' | 'manual';

/**
 * Transport sub-type — only relevant when resourceClass = 'transport'.
 *   continuous: constant-rate conveyors / belts → uses outputPerHour
 *   discrete:   trip-based vehicles (heftruck, AGV) → uses unitsPerTrip + tripDurationMinutes
 */
export type TransportMode = 'continuous' | 'discrete';

export interface EngineResource {
  id: string;
  name: string;
  /** @deprecated use resourceClass + processingMode */
  type: EngineResourceType;
  /**
   * Department binding. Absent for delay resources (no department).
   * All other classes require a department.
   */
  departmentId?: string;

  /**
   * Primary class discriminator (introduced in v2).
   * Absent on legacy resources — calculator defaults to 'processing'.
   */
  resourceClass?: ResourceClass;

  // --- Processing fields (resourceClass = 'processing') ---
  processingMode?: ProcessingMode;
  /** continuous / manual */
  outputPerHour?: number;
  /** batch */
  batchSize?: number;
  cycleTimeMinutes?: number;
  /** Batch mode: setup overhead per batch (minutes). >= 0. Only for batch processing. */
  batchSetupMinutes?: number;
  /** Number of identical parallel units. Integer >= 1. */
  parallelUnits: number;
  /** Quality / scrap factor. (0, 100] — NOT applied for buffer/transport. */
  yieldPct: number;
  /** Machine uptime ratio. (0, 1] */
  availability: number;
  /** Startup overhead per production day. >= 0. Not used for buffer. */
  dailyStartupMinutes: number;

  // --- Buffer fields (resourceClass = 'buffer') ---
  /** Max units held simultaneously (kg / stuks / liter / pallets). */
  slotCapacity?: number;
  /** Human-readable unit label — for display only; engine is unit-agnostic. */
  slotUnit?: string;
  /** Percentage of slotCapacity reserved as safety margin. [0, 50]. */
  safetyMarginPct?: number;
  /**
   * Required for buffer. How long a product stays in the buffer.
   * Determines turnover rate: turnoversPerHour = 60 / dwellTimeMinutes.
   * Must be > 0.
   */
  dwellTimeMinutes?: number;
  /** Optional deadline: downstream step must start within this many minutes. */
  maxHoldMinutes?: number;

  // --- Transport fields (resourceClass = 'transport') ---
  transportMode?: TransportMode;
  /** Discrete transport: units per vehicle trip. */
  unitsPerTrip?: number;
  /** Discrete transport: round-trip duration in minutes. > 0. */
  tripDurationMinutes?: number;
  // Continuous transport reuses outputPerHour + parallelUnits (same as processing continuous).

  // --- Delay fields (resourceClass = 'delay') ---
  /** Required for delay: how long the step holds each unit (minutes). > 0. */
  delayTimeMinutes?: number;
  /**
   * How the delay applies: per individual unit, or per batch.
   * MVP: 'per_batch' uses the same formula as 'per_unit'.
   */
  delayMode?: DelayMode;
}

// ---------------------------------------------------------------------------
// Department
// ---------------------------------------------------------------------------

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type HoursByWeekday = Record<Weekday, number>;

export interface EngineDepartment {
  id: string;
  name: string;
  color: string;
  hoursByWeekday: HoursByWeekday;
}

// ---------------------------------------------------------------------------
// Flow steps — discriminated union
// ---------------------------------------------------------------------------

export type EngineFlowStep =
  | { type: 'start'; id: string }
  | { type: 'end'; id: string }
  | {
      type: 'resourceStep';
      id: string;
      label: string;
      resourceId: string;
      enabled: boolean;
      inputMaterialId?: string;
      outputMaterialId?: string;
      /** Output units produced per input unit. Defaults to 1. */
      conversionRatio?: number;
    }
  | {
      type: 'timeStep';
      id: string;
      label: string;
      durationMinutesPerUnit: number;
      enabled: boolean;
      inputMaterialId?: string;
      outputMaterialId?: string;
      /** Output units produced per input unit. Defaults to 1. */
      conversionRatio?: number;
    };

// Minimal edge type used internally by flow linearisation
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// Run request (traceability input)
// ---------------------------------------------------------------------------

export interface RunRequest {
  runId: string;
  projectId: string;
  scenarioId: string | null;
  mode: 'baseline' | 'scenario';
  requestedAt: string; // ISO timestamp
  horizonCalendarDays: number; // > 0
  targetGoodUnits: number;     // > 0
  startDateISO: string;        // ISO date, e.g. "2026-03-01"
  timezone: string;            // IANA, e.g. "Europe/Amsterdam"
  engineVersion: string;
}

// ---------------------------------------------------------------------------
// Resolved effective model (scenario overlays already applied in-memory)
// ---------------------------------------------------------------------------

export interface EngineInput {
  resources: EngineResource[];
  departments: EngineDepartment[];
  /** Steps in linearised flow order: start → resourceStep/timeStep … → end */
  steps: EngineFlowStep[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning';
export type ValidationEntityType =
  | 'flow'
  | 'step'
  | 'resource'
  | 'department'
  | 'scenario'
  | 'input';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  entityType: ValidationEntityType;
  entityId: string | null;
  suggestedFix: string | null;
}

export interface ValidationReport {
  flowValid: boolean;
  resourceLinksValid: boolean;
  departmentSchedulesValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// Error code constants
export const ERR_INVALID_TARGET_GOOD_UNITS = 'ERR_INVALID_TARGET_GOOD_UNITS';
export const ERR_INVALID_HORIZON_DAYS = 'ERR_INVALID_HORIZON_DAYS';
export const ERR_INVALID_OPENING_HOURS = 'ERR_INVALID_OPENING_HOURS';
export const ERR_INVALID_AVAILABILITY = 'ERR_INVALID_AVAILABILITY';
export const ERR_FLOW_NO_RESOURCE_STEP = 'ERR_FLOW_NO_RESOURCE_STEP';
export const ERR_TIMESTEP_NO_UPSTREAM_RESOURCE = 'ERR_TIMESTEP_NO_UPSTREAM_RESOURCE';
export const ERR_HETEROGENEOUS_RATE_MODEL = 'ERR_HETEROGENEOUS_RATE_MODEL';
export const ERR_OVERRIDE_IMMUTABLE_BINDING = 'ERR_OVERRIDE_IMMUTABLE_BINDING';

export const WARN_OVERRIDE_UNKNOWN_RESOURCE = 'WARN_OVERRIDE_UNKNOWN_RESOURCE';
export const WARN_OVERRIDE_UNKNOWN_DEPARTMENT = 'WARN_OVERRIDE_UNKNOWN_DEPARTMENT';
export const WARN_DEPARTMENT_ALL_ZERO = 'WARN_DEPARTMENT_ALL_ZERO';
export const WARN_SUSPICIOUS_AVAILABILITY = 'WARN_SUSPICIOUS_AVAILABILITY';
export const WARN_SUSPICIOUS_YIELD = 'WARN_SUSPICIOUS_YIELD';

// Buffer-specific
export const ERR_MISSING_SLOT_CAPACITY = 'ERR_MISSING_SLOT_CAPACITY';
export const ERR_MISSING_DWELL_TIME = 'ERR_MISSING_DWELL_TIME';
export const ERR_INVALID_DWELL_TIME = 'ERR_INVALID_DWELL_TIME';
export const ERR_INVALID_SAFETY_MARGIN = 'ERR_INVALID_SAFETY_MARGIN';

// Transport-specific
export const ERR_MISSING_TRANSPORT_RATE = 'ERR_MISSING_TRANSPORT_RATE';
export const ERR_INVALID_TRIP_DURATION = 'ERR_INVALID_TRIP_DURATION';
export const ERR_MISSING_UNITS_PER_TRIP = 'ERR_MISSING_UNITS_PER_TRIP';

// Scenario override class mismatch
export const WARN_OVERRIDE_CLASS_MISMATCH = 'WARN_OVERRIDE_CLASS_MISMATCH';

// Delay-specific
export const ERR_MISSING_DELAY_TIME = 'ERR_MISSING_DELAY_TIME';
export const ERR_INVALID_DELAY_TIME = 'ERR_INVALID_DELAY_TIME';

// ---------------------------------------------------------------------------
// Capacity status
// ---------------------------------------------------------------------------

/**
 * Capacity status per step:
 * - ok: utilization < 1 at target (has headroom)
 * - warning: utilization >= 0.9 but < 1 (near capacity)
 * - blocked_no_hours: effectiveHours = 0 with targetGoodUnits > 0
 * - blocked_missing_resource: resourceId does not resolve
 * - invalid_input: invalid configuration on this step
 * - disabled: step.enabled = false
 */
export type CapacityStatus =
  | 'ok'
  | 'warning'
  | 'blocked_no_hours'
  | 'blocked_missing_resource'
  | 'invalid_input'
  | 'disabled';

// ---------------------------------------------------------------------------
// StepResult (fully typed — no references to contract sections)
// ---------------------------------------------------------------------------

export interface StepResult {
  stepId: string;
  stepIndex: number;
  stepType: 'resourceStep' | 'timeStep';
  label: string;
  enabled: boolean;

  /** isActive = enabled AND step is reachable in linearised flow */
  isActive: boolean;
  isBottleneckCandidate: boolean;
  capacityStatus: CapacityStatus;

  inheritedDepartmentId: string | null;
  inheritedDepartmentName: string | null;

  // --- ResourceStep-only fields (undefined for TimeStep) ---
  resourceBindingIds?: string[];    // MVP: exactly 1
  resourceType?: EngineResourceType;
  /** Resource class — for display (class badge) and UI filtering. */
  resourceClass?: ResourceClass;
  /** Normalised availability ratio 0..1 */
  availability?: number;
  yieldPct?: number;
  dailyStartupMinutes?: number;

  // --- TimeStep-only field (undefined for ResourceStep) ---
  durationMinutesPerUnit?: number;

  // --- Material conversion fields ---
  inputMaterialId?: string;
  outputMaterialId?: string;
  /** Effective conversion ratio applied at this step. 1 when no conversion. */
  conversionRatio?: number;

  // --- Calculated performance fields ---
  scheduledHours: number;
  startupHoursApplied: number;
  availableHoursAfterStartup: number;
  effectiveHours: number;
  effectiveRateUnitsPerHour: number;

  /**
   * Cumulative yield from this step to the last enabled step (inclusive).
   * Disabled steps are skipped in the product — transparent in yield chain.
   * 1.0 for the last enabled step.
   */
  cumYieldToEnd: number;

  /** = effectiveRateUnitsPerHour * cumYieldToEnd */
  stepMaxGoodUnitsPerHour: number;

  /** = stepMaxGoodUnitsPerHour * effectiveHours */
  stepMaxGoodUnitsOverHorizon: number;

  /** null when effectiveHours = 0 or step disabled */
  requiredWorkHoursAtTarget: number | null;

  /** null when effectiveHours = 0 or step disabled */
  utilizationAtTarget: number | null;

  /** Human-readable calculation trace strings */
  explain: string[];
}

// ---------------------------------------------------------------------------
// BottleneckResult
// ---------------------------------------------------------------------------

export interface BottleneckResult {
  stepId: string | null;
  resourceId: string | null;
  type: 'resourceStep' | 'timeStep' | null;
  metric: 'utilizationAtTarget' | null;
  utilizationAtTarget: number | null;
  stepMaxGoodUnitsPerHour: number | null;
  effectiveHours: number | null;
  explanation: string;
  topDrivers: Array<{ name: string; value: number; unit: string }>;
}

// ---------------------------------------------------------------------------
// RunSummary (fully typed dashboard KPIs)
// ---------------------------------------------------------------------------

export interface RunSummary {
  targetGoodUnits: number;
  horizonCalendarDays: number;
  startDateISO: string;
  timezone: string;

  /** Total scheduled hours per departmentId */
  totalScheduledHoursByDepartment: Record<string, number>;

  /** Effective hours (after startup + availability) per stepId */
  totalEffectiveHoursByStep: Record<string, number>;

  feasible: boolean;

  /** min(stepMaxGoodUnitsOverHorizon) over enabled steps */
  maxThroughputGoodUnits: number;

  bottleneckBasisHours: number | null;
  requiredGoodUnitsPerHourAtBottleneckBasis: number | null;
  bottleneckStepId: string | null;
  bottleneckResourceId: string | null;
  bottleneckType: 'resourceStep' | 'timeStep' | null;
}

// ---------------------------------------------------------------------------
// RunResult (top-level output per run)
// ---------------------------------------------------------------------------

export interface RunResult {
  runId: string;
  mode: 'baseline' | 'scenario';
  projectId: string;
  scenarioId: string | null;
  status: 'ok' | 'warning' | 'error';
  generatedAt: string; // ISO timestamp
  engineVersion: string;
  inputs: RunRequest;
  summary: RunSummary;
  /** All steps in flow order, including disabled steps */
  steps: StepResult[];
  bottleneck: BottleneckResult | null;
  validation: ValidationReport;
}

// ---------------------------------------------------------------------------
// ComparisonResult (baseline vs scenario — fully typed)
// ---------------------------------------------------------------------------

export interface StepDelta {
  stepId: string;
  baselineUtilization: number | null;
  scenarioUtilization: number | null;
  /** scenarioUtilization - baselineUtilization; null if either is null */
  deltaUtilization: number | null;
  baselineMaxGoodUnits: number | null;
  scenarioMaxGoodUnits: number | null;
  /** scenarioMaxGoodUnits - baselineMaxGoodUnits; null if either is null */
  deltaMaxGoodUnits: number | null;
}

export interface ComparisonResult {
  baselineRunId: string;
  scenarioRunId: string;
  /** scenario.maxThroughput - baseline.maxThroughput */
  deltaMaxThroughputGoodUnits: number;
  baselineFeasible: boolean;
  scenarioFeasible: boolean;
  feasibleChanged: boolean;
  changedBottleneck: boolean;
  stepDeltas: StepDelta[];
  changedDepartments: Array<{ departmentId: string; fieldsChanged: string[] }>;
  changedResources: Array<{ resourceId: string; fieldsChanged: string[] }>;
}

// ---------------------------------------------------------------------------
// RunBundle (baseline + optional scenario together)
// ---------------------------------------------------------------------------

export interface RunBundle {
  baseline: RunResult;
  scenario: RunResult | null;
  comparison: ComparisonResult | null;
}
