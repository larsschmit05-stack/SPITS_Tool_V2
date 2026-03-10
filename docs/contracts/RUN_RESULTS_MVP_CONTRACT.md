# RUN_RESULTS_MVP_CONTRACT

## 0) Doel

Een RunResult is het enige object dat het dashboard nodig heeft om:

- Feasible (haalbaar ja/nee)
- Max throughput over horizon
- Bottleneck (waar + waarom)
- Utilization per step/resource
- Warnings/errors
- Baseline vs Scenario diff

Principe: dashboard rekent niet; engine levert volledig interpreteerbare output.

## 1) RunRequest (traceability input)

### 1.1 Velden

- `runId: string`
- `projectId: string`
- `scenarioId: string | null`
- `mode: 'baseline' | 'scenario'`
- `requestedAt: ISO string`
- `horizonCalendarDays: number` (moet > 0)
- `targetGoodUnits: number` (moet > 0)
- `startDateISO: string` (ISO datum, verplicht)
- `timezone: string` (IANA, verplicht)
- `projectStateHash?: string`
- `engineVersion?: string`

## 2) RunBundle (MVP: baseline + scenario samen)

- `baseline: RunResult`
- `scenario: RunResult | null`
- `comparison: ComparisonResult | null`

## 3) RunResult (top-level)

- `runId: string`
- `mode: 'baseline' | 'scenario'`
- `projectId: string`
- `scenarioId: string | null`
- `status: 'ok' | 'warning' | 'error'`
- `generatedAt: ISO string`
- `engineVersion: string`
- `inputs: RunRequest`
- `summary: RunSummary`
- `steps: StepResult[]` (in flow-volgorde, inclusief disabled steps)
- `bottleneck: BottleneckResult | null`
- `validation: ValidationReport`

## 4) RunSummary (dashboard KPI’s)

- `targetGoodUnits: number`
- `horizonCalendarDays: number`
- `startDateISO: string`
- `timezone: string`
- `totalScheduledHoursByDepartment: Record<departmentId, number>`
- `totalEffectiveHoursByStep: Record<stepId, number>`
- `feasible: boolean`
- `maxThroughputGoodUnits: number`
- `bottleneckBasisHours: number | null`
- `requiredGoodUnitsPerHourAtBottleneckBasis: number | null`
- `bottleneckStepId: string | null`
- `bottleneckResourceId: string | null`
- `bottleneckType: 'resourceStep' | 'timeStep' | null`

## 5) StepResult (per step in de flow)

### 5.1 Common fields

- `stepId: string`
- `stepIndex: number`
- `stepType: 'resourceStep' | 'timeStep'`
- `label: string`
- `enabled: boolean`
- `isActive: boolean`
- `isBottleneckCandidate: boolean`
- `capacityStatus: CapacityStatus`
- `inheritedDepartmentId: string | null`
- `inheritedDepartmentName: string | null`

### 5.2 ResourceStep-specific fields

- `resourceBindingIds: string[]` (MVP: exact 1 baseline binding per ResourceStep)
- `resourceType: 'batch' | 'continuous' | 'manual'`
- `availability: number` (0..1, step-level effective availability)
- `yieldPct: number`
- `dailyStartupMinutes: number`

### 5.3 TimeStep-specific fields

- `durationMinutesPerUnit: number`
- `yieldPct: 100`

TimeStep heeft geen yield-configuratie en geen scrap-configuratie.

### 5.4 Calculated performance & capacity fields

- `scheduledHours: number`
- `startupHoursApplied: number`
- `availableHoursAfterStartup: number`
- `effectiveHours: number`
- `effectiveRateUnitsPerHour: number`
- `cumYieldToEnd: number`
- `stepMaxGoodUnitsPerHour: number`
- `stepMaxGoodUnitsOverHorizon: number`
- `requiredWorkHoursAtTarget: number | null`
- `utilizationAtTarget: number | null`

### 5.5 Explainability

- `explain: string[]`

## 6) TimeStep department inheritance

Deterministische regel:

- Een TimeStep erft department van de dichtstbijzijnde ResourceStep upstream.
- Als geen upstream ResourceStep bestaat: flow invalid (`ERR_TIMESTEP_NO_UPSTREAM_RESOURCE`).
- TimeStep is department-limited.

## 7) Throughput en bottleneck-basis

- Bottleneck-basis = final good units bij End-step.
- `cumYieldToEnd_i = Π(yield_k)` van step i tot en met laatste enabled step.
- `stepMaxGoodUnitsPerHour_i = effectiveRateUnitsPerHour_i * cumYieldToEnd_i`.
- `stepMaxGoodUnitsOverHorizon_i = stepMaxGoodUnitsPerHour_i * effectiveHours_i`.
- `summary.maxThroughputGoodUnits = min(stepMaxGoodUnitsOverHorizon_i)` over enabled steps.

## 8) BottleneckResult

- `stepId: string | null`
- `resourceId: string | null`
- `type: 'resourceStep' | 'timeStep' | null`
- `metric: 'utilizationAtTarget' | null`
- `utilizationAtTarget: number | null`
- `stepMaxGoodUnitsPerHour: number | null`
- `effectiveHours: number | null`
- `explanation: string`
- `topDrivers: Array<{ name: string; value: number; unit: string }>`

Tie-break policy:

1. hoogste `utilizationAtTarget`
2. bij tie: laagste `stepMaxGoodUnitsPerHour`
3. bij tie: laagste `stepIndex`
4. bij tie: lexicografisch kleinste `stepId`

## 9) CapacityStatus enum

`type CapacityStatus =`

- `'ok'`
- `'warning'`
- `'blocked_no_hours'`
- `'blocked_missing_resource'`
- `'invalid_input'`
- `'disabled'`

Regel bij `effectiveHours = 0` en `targetGoodUnits > 0`:

- validation error + infeasible
- `utilizationAtTarget = null`
- `capacityStatus = 'blocked_no_hours'`

Regel voor disabled step:

- aanwezig in `steps`
- `utilizationAtTarget = null`
- `capacityStatus = 'disabled'`
- `isBottleneckCandidate = false`

## 10) ValidationReport

- `flowValid: boolean`
- `resourceLinksValid: boolean`
- `departmentSchedulesValid: boolean`
- `errors: ValidationIssue[]`
- `warnings: ValidationIssue[]`

`ValidationIssue`:

- `code: string`
- `severity: 'error' | 'warning'`
- `message: string`
- `entityType: 'flow' | 'step' | 'resource' | 'department' | 'scenario' | 'input'`
- `entityId: string | null`
- `suggestedFix: string | null`

Verplichte input-validaties met expliciete codes:

- `ERR_INVALID_TARGET_GOOD_UNITS`
- `ERR_INVALID_HORIZON_DAYS`
- `ERR_INVALID_OPENING_HOURS`
- `ERR_INVALID_AVAILABILITY`

## 11) Scenario overlay semantiek

- Baseline `StepResourceBinding` blijft immutable.
- Scenario wijzigt alleen bestaande resources via `resourceOverrides`.
- `parallelUnits` is overridable via `resourceOverrides` en blijft `>=1`.
- Scenario voegt geen nieuwe resources toe.
- Effective rate op ResourceStep gebruikt resource-level parallel capacity: `effectiveRate = baseRate * availability * parallelUnits`.
- Yield is step-level.

## 12) ComparisonResult (baseline vs scenario)

- `baselineRunId: string`
- `scenarioRunId: string`
- `deltaMaxThroughputGoodUnits: number`
- `baselineFeasible: boolean`
- `scenarioFeasible: boolean`
- `feasibleChanged: boolean`
- `changedBottleneck: boolean`
- `stepDeltas: Array<{
    stepId: string
    baselineUtilization: number | null
    scenarioUtilization: number | null
    deltaUtilization: number | null
    baselineMaxGoodUnits: number | null
    scenarioMaxGoodUnits: number | null
    deltaMaxGoodUnits: number | null
  }>`
- `changedDepartments: Array<{ departmentId: string; fieldsChanged: string[] }>`
- `changedResources: Array<{ resourceId: string; fieldsChanged: string[] }>`

## 13) Definition of Done

Dit contract is MVP-ready als:

- Engine altijd een RunBundle levert (baseline + optioneel scenario)
- Een geldige flow minstens één ResourceStep bevat
- TimeStep yield hard 100% is zonder configuratie
- Dashboard zonder aanvullende berekeningen feasible/throughput/bottleneck/validation/comparison kan tonen
