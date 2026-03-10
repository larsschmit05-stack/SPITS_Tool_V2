/**
 * State domain types for Capaciteitstool
 *
 * These types drive both the UI state and serve as source data for the engine.
 * The engine layer (src/engine/) has its own resolved types (EngineResource, etc.)
 * that are built from these state types via buildEngineInput().
 */

import type { RunBundle } from '../engine/types';

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

export interface Material {
  id: string;
  name: string;
  /** Human-readable unit label, e.g. "box", "jar", "sachet" */
  unit: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * One entry in the product mix of a source (start) node.
 * Describes what material type flows from this source and how many units.
 */
export interface ProductMixEntry {
  id: string;
  /** Display label, e.g. "Type A" */
  label: string;
  materialId: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/** @deprecated use ResourceClass + ProcessingMode. Kept for backward compat. */
export type ResourceType = 'continuous' | 'batch' | 'manual';

/**
 * Top-level resource classification — the primary discriminator in v2.
 * Determines which fields are active and which capacity formula applies.
 */
export type ResourceClass = 'processing' | 'buffer' | 'transport' | 'delay';

/** Delay sub-type — only used when resourceClass = 'delay'. */
export type DelayMode = 'per_unit' | 'per_batch';

/** Processing sub-type — only used when resourceClass = 'processing'. */
export type ProcessingMode = 'continuous' | 'batch' | 'manual';

/** Transport sub-type — only used when resourceClass = 'transport'. */
export type TransportMode = 'continuous' | 'discrete';

export interface Resource {
  id: string;
  name: string;
  /** @deprecated use resourceClass + processingMode */
  type: ResourceType;
  /**
   * Every resource must belong to exactly 1 department. Immutable after creation.
   * Optional for resourceClass = 'delay' (delay has no department).
   */
  departmentId?: string;

  /**
   * v2 primary discriminator.
   * Absent on legacy resources — treated as 'processing' everywhere.
   * Cannot be changed after resource creation (integrity rule).
   */
  resourceClass?: ResourceClass;

  // --- Processing fields (resourceClass = 'processing') ---
  processingMode?: ProcessingMode;
  outputPerHour?: number;
  batchSize?: number;
  cycleTimeMinutes?: number;
  /** Batch mode: setup overhead per batch (minutes). >= 0. Only for batch processing. */
  batchSetupMinutes?: number;
  /** Number of identical parallel units. Integer >= 1. */
  parallelUnits: number;
  /** Quality / scrap factor. (0, 100]. Not used for buffer/transport. */
  yieldPct: number;
  /** Machine uptime ratio. (0, 1]. Applied to hours, not to rate. */
  availability: number;
  /** Startup overhead per production day. >= 0. Not used for buffer. */
  dailyStartupMinutes: number;

  // --- Buffer fields (resourceClass = 'buffer') ---
  /** Max simultaneous units in buffer (kg / stuks / liter / pallets). */
  slotCapacity?: number;
  /** Human-readable unit label — display only; engine is unit-agnostic. */
  slotUnit?: string;
  /** Safety reserve as percentage of slotCapacity. [0, 50]. Default 0. */
  safetyMarginPct?: number;
  /**
   * Required for buffer. Average time a product stays in the buffer (minutes).
   * Determines turnover rate: turnoversPerHour = 60 / dwellTimeMinutes.
   * Must be explicitly set — no implicit defaults.
   */
  dwellTimeMinutes?: number;
  /** Optional: downstream step must start within this many minutes. */
  maxHoldMinutes?: number;

  // --- Transport fields (resourceClass = 'transport') ---
  transportMode?: TransportMode;
  /** Discrete transport: load per vehicle trip. */
  unitsPerTrip?: number;
  /** Discrete transport: round-trip duration (minutes). > 0. */
  tripDurationMinutes?: number;
  // Continuous transport reuses outputPerHour + parallelUnits.

  // --- Delay fields (resourceClass = 'delay') ---
  /**
   * Required for delay: duration per unit or per batch (minutes). > 0.
   * delay resources have no department — they constrain throughput rate, not hours.
   */
  delayTimeMinutes?: number;
  /**
   * How the delay applies: per individual unit, or once per batch.
   * Defaults to 'per_unit'. 'per_batch' formula deferred to post-MVP.
   */
  delayMode?: DelayMode;

  // --- Library metadata ---
  /**
   * @deprecated use ResourceTemplate in templates[].
   * Kept for migration: existing isTemplate=true resources are converted on load.
   */
  isTemplate?: boolean;
  /** If instantiated from a template, holds the source ResourceTemplate.id. */
  templateSourceId?: string;
  /** Free-form string tags for organisation. */
  tags?: string[];
  /** Optional description / notes. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Resource Template (separate entity — source of truth for templates)
// ---------------------------------------------------------------------------

/**
 * A reusable resource configuration blueprint.
 * Templates are stored in templates[], NOT in resources[].
 * Resources are always autonomous instances — changing a template
 * does NOT affect existing resources derived from it.
 */
export interface ResourceTemplate {
  id: string;
  name: string;
  resourceClass: ResourceClass;
  processingMode?: ProcessingMode;
  transportMode?: TransportMode;
  /** Industry category for grouping in the template picker. */
  industry?: 'food' | 'discrete' | 'process' | null;
  /** Pre-filled default values. Applied when creating a resource from this template. */
  defaultConfig: Partial<Omit<Resource, 'id' | 'name' | 'departmentId' | 'resourceClass' | 'isTemplate' | 'templateSourceId' | 'tags' | 'description'>>;
  /** System templates are provided by the platform; user templates are created by the team. */
  isSystemTemplate: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Type-safe scenario resource overrides (discriminated union per class)
// ---------------------------------------------------------------------------

/**
 * Fields that can be overridden in a scenario for a Processing resource.
 * immutable fields (id, departmentId, resourceClass, processingMode) are excluded.
 */
export interface ProcessingOverride {
  resourceClass: 'processing';
  parallelUnits?: number;
  availability?: number;
  outputPerHour?: number;
  batchSize?: number;
  cycleTimeMinutes?: number;
  yieldPct?: number;
  dailyStartupMinutes?: number;
}

export interface BufferOverride {
  resourceClass: 'buffer';
  slotCapacity?: number;
  safetyMarginPct?: number;
  dwellTimeMinutes?: number;
  availability?: number;
  maxHoldMinutes?: number;
}

export interface TransportOverride {
  resourceClass: 'transport';
  parallelUnits?: number;
  availability?: number;
  outputPerHour?: number;
  unitsPerTrip?: number;
  tripDurationMinutes?: number;
}

export interface DelayOverride {
  resourceClass: 'delay';
  delayTimeMinutes?: number;
  delayMode?: DelayMode;
}

/** Union type for all resource overrides. Always includes resourceClass for discrimination. */
export type ResourceOverride = ProcessingOverride | BufferOverride | TransportOverride | DelayOverride;

// ---------------------------------------------------------------------------
// Process element creation flow draft (wizard-only, ephemeral)
// ---------------------------------------------------------------------------

export type CreateActionIntent = 'create' | 'createAndAddToFlow';

interface CreateDraftBase {
  name: string;
  description?: string;
  availability: number;
  yieldPct: number;
  dailyStartupMinutes: number;
}

export interface ProcessingCreateDraft extends CreateDraftBase {
  resourceClass: 'processing';
  departmentId?: string;
  processingMode: ProcessingMode;
  outputPerHour?: number;
  batchSize?: number;
  cycleTimeMinutes?: number;
  batchSetupMinutes?: number;
  parallelUnits: number;
}

export interface BufferCreateDraft extends CreateDraftBase {
  resourceClass: 'buffer';
  departmentId?: string;
  slotCapacity?: number;
  dwellTimeMinutes?: number;
  safetyMarginPct?: number;
}

export interface TransportCreateDraft extends CreateDraftBase {
  resourceClass: 'transport';
  departmentId?: string;
  transportMode: TransportMode;
  outputPerHour?: number;
  unitsPerTrip?: number;
  tripDurationMinutes?: number;
  parallelUnits: number;
}

export interface DelayCreateDraft extends CreateDraftBase {
  resourceClass: 'delay';
  delayMode: DelayMode;
  delayTimeMinutes?: number;
}

export type ProcessElementCreateDraft =
  | ProcessingCreateDraft
  | BufferCreateDraft
  | TransportCreateDraft
  | DelayCreateDraft;

// ---------------------------------------------------------------------------
// Department
// ---------------------------------------------------------------------------

export interface Department {
  id: string;
  name: string;
  color: string;
  /** Available hours per weekday (0–24 each). Week-pattern, not calendar. */
  hoursByWeekday: {
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
    sun: number;
  };
  /** Derived field: sum of hoursByWeekday. Automatically computed, never edited directly. */
  availableHoursPerWeek: number;
}

// ---------------------------------------------------------------------------
// Process steps (simplified — linked to flow nodes via FlowNode.id)
// ---------------------------------------------------------------------------

export interface ProcessStep {
  id: string;
  name: string;
  resourceId: string;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export interface ScenarioDemand {
  targetGoodUnits: number;      // > 0
  horizonCalendarDays: number;  // > 0
  startDateISO: string;         // ISO date, e.g. "2026-03-01"
  timezone: string;             // IANA, e.g. "Europe/Amsterdam"
}

export interface Scenario {
  id: string;
  name: string;
  /** Creation timestamp (milliseconds since epoch). Immutable. */
  createdAt: number;
  /** Optional description / user notes */
  description?: string;
  /** Scenario tags for organization (max 5, normalized: trimmed, deduplicated, filtered empty). */
  tags?: string[];
  /** Run parameters. If absent, the dashboard prompts the user before running. */
  demand?: ScenarioDemand;
  /**
   * In-memory overrides applied to department schedules during a scenario run.
   * Keys are departmentIds; values are partial hoursByWeekday overrides.
   * Baseline departments are never mutated.
   */
  departmentScheduleOverrides?: Record<
    string,
    Partial<Department['hoursByWeekday']>
  >;
  /**
   * In-memory overrides applied to resources during a scenario run.
   * Keys are resourceIds; values are type-safe per resource class.
   * Baseline resources are never mutated.
   * Immutable fields (id, departmentId, resourceClass) cannot be overridden.
   *
   * Legacy overrides without resourceClass are still accepted at runtime
   * for backward compatibility — see engine.ts applyScenarioOverrides().
   */
  resourceOverrides?: Record<string, ResourceOverride | Partial<Omit<Resource, 'id' | 'departmentId'>>>;
}

/**
 * Type-safe patch for updating a scenario without mutation of immutable fields (id, createdAt).
 * Prevents accidental override of immutable fields at the type level.
 */
export type ScenarioPatch = Partial<Omit<Scenario, 'id' | 'createdAt'>>;

/**
 * Constraint violation for scenario management.
 */
export interface ScenarioConstraintViolation {
  type: 'MAX_SCENARIOS_EXCEEDED' | 'ACTIVE_SCENARIO_NOT_FOUND' | 'DUPLICATE_SCENARIO_ID';
  message: string;
}

// ---------------------------------------------------------------------------
// Flow graph nodes & edges
// ---------------------------------------------------------------------------

export interface FlowNode {
  id: string;
  /**
   * Node role in the flow — single source of truth for node behaviour.
   * - start: exactly 1 per flow; material entry point
   * - end: exactly 1 per flow; process exit
   * - resourceStep: linked to a resource via resourceId; capacity-bearing
   * - timeStep: pure delay, no capacity, uses durationMinutesPerUnit
   */
  nodeType: 'start' | 'resourceStep' | 'timeStep' | 'end';
  name: string;
  position: {
    x: number;
    y: number;
  };
  /** Required when nodeType = 'resourceStep'. Ref to Resource.id */
  resourceId?: string;
  /** Required when nodeType = 'timeStep'. Minutes per unit. > 0 */
  durationMinutesPerUnit?: number;
  /** When false, step is excluded from throughput/bottleneck but stays in flow */
  enabled?: boolean;
  updatedAt?: number;

  // --- Material system ---
  /** start node only: which materials/types flow from this source */
  productMix?: ProductMixEntry[];
  /** resourceStep / timeStep: which material enters this step */
  inputMaterialId?: string;
  /** resourceStep / timeStep: which material exits this step */
  outputMaterialId?: string;
  /**
   * Output units produced per input unit consumed at this step.
   * E.g. 57.14 sachets per jar. Defaults to 1 (no conversion).
   * Only meaningful when inputMaterialId ≠ outputMaterialId.
   */
  conversionRatio?: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// Project state
// ---------------------------------------------------------------------------

export interface ProjectState {
  materials: Material[];
  resources: Resource[];
  /**
   * Resource template library.
   * Source of truth for all templates — resources[] contains only instances.
   */
  templates: ResourceTemplate[];
  departments: Department[];
  steps: ProcessStep[];
  scenarios: Scenario[];
  activeScenarioId: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  lastUsedDepartmentId?: string | null;
  isDirty: boolean;
  /**
   * Latest engine run result. Runtime-only — NOT persisted to localStorage.
   * Cleared on page refresh.
   */
  latestRunResult?: RunBundle | null;
}
