## 0) Doel

De engine krijgt:

- Baseline project state
- Optioneel een scenario (overrides op bestaande entities)
- Horizon in **kalenderdagen**
- Demand als **target good units bij End-step**

En levert:

- **RunBundle**: baseline RunResult + scenario RunResult + comparison

---

## 1) Inputs die de engine gebruikt

### 1.1 Baseline project data

- Flow (lineair): start → steps → end
- Steps: ResourceStep of TimeStep (enabled/disabled)
- Resources library: fysieke assets met performance/availability/yield/startup/departmentId
- Departments: hours per weekday (Mon–Sun)
- StepResourceBinding: baseline koppeling stepId → resourceId is immutable
- (MVP) 1 flow per project, 1 product per flow

### 1.2 Scenario overlay (alleen bij scenario-run)

- Department overrides (hoursByWeekday aanpassingen)
- Resource overrides (partial updates op bestaande resources)
- Resource `parallelUnits` overrides op bestaande resources (>=1)

**Belangrijk:** baseline wordt nooit gemuteerd; scenario wordt “in-memory” toegepast.

### 1.3 Horizon anchor (verplicht)

Scenario-run request bevat verplicht:

- `startDateISO` (ISO datumstring)
- `timezone` (IANA tijdzone)

Effective hours worden berekend vanaf **startDateISO 00:00:00** in de opgegeven timezone.

---

## 2) Output structuur

De engine produceert altijd:

- Baseline RunResult
- Als scenario actief: Scenario RunResult + ComparisonResult

---

## 3) Validatie pipeline (eerst bewijs, dan rekenen)

De engine voert validaties uit vóór en tijdens berekening. Output bevat errors/warnings in `validation`.

### 3.1 Flow-validatie (blocking errors)

- Exact 1 start en 1 end
- Lineair: geen branches, geen cycles
- Alle nodes connected (geen zwevers)
- Minstens 1 step tussen start en end
- Minstens 1 ResourceStep in de flow
- Alle enabled steps vormen een aaneengesloten keten

Als dit faalt:

- `status='error'`
- `summary.feasible=false`
- `steps` mag nog wel gevuld worden met minimale context + issues, maar geen KPI’s die “betrouwbaar” lijken.

### 3.2 Step-validatie

**ResourceStep**

- resourceId bestaat
- resource bestaat (na scenario overlay)
- resource heeft departmentId dat bestaat

**TimeStep**

- durationMinutesPerUnit > 0
- yield is fixed 100% (geen input, geen configuratie)
- TimeStep heeft geen scrap-model

### 3.3 Department schedule validatie

- hoursByWeekday aanwezig voor alle 7 dagen
- openingHours per dag zijn >= 0 en <= 24
- warning als alle dagen 0 uur (department produceert nooit)

### 3.4 Resource parameter validatie

- availabilityPct 0–100
- yieldPct 0–100
- dailyStartupMinutes >= 0
- performance velden > 0 (per type)
- parallelUnits >= 1
- warnings bij “verdachte” waarden

### 3.5 Input validatie (blocking)

- `targetGoodUnits > 0`
- `horizonCalendarDays > 0`
- availability in [0,1] nadat percentages genormaliseerd zijn
- expliciete error codes verplicht

Minimale error codes:

- `ERR_INVALID_TARGET_GOOD_UNITS`
- `ERR_INVALID_HORIZON_DAYS`
- `ERR_INVALID_OPENING_HOURS`
- `ERR_INVALID_AVAILABILITY`
- `ERR_FLOW_NO_RESOURCE_STEP`
- `ERR_TIMESTEP_NO_UPSTREAM_RESOURCE`
- `ERR_HETEROGENEOUS_RATE_MODEL`

---

## 4) Resolutie: “Effective Model” bouwen (per run)

Voor baseline-run: effective model = baseline.

Voor scenario-run:

- Begin met baseline
- Apply department overrides
- Apply resource overrides

Daarna:

- Resolve flow steps naar “run-context steps” met alle benodigde velden:
  - Step label, enabled, type
  - ResourceStep: baseline resource (met eventuele overrides) + department
  - TimeStep: duration + inherited department

**Regel:** scenario resource overlay is geen rebinding en heeft geen auto-allocatie.

---

## 5) TimeStep department inheritance toepassen

Omdat TimeSteps geen eigen department hebben maar wel capaciteit limiteren:

- Voor elke TimeStep:
  - zoek dichtstbijzijnde ResourceStep upstream → erf department
  - als die er niet is: flow invalid (blocking error)

Resultaat:

- elke step heeft `inheritedDepartmentId`
- TimeStep is department-limited

---

## 6) Horizon → scheduled hours per department

Input:

- `horizonCalendarDays`
- `startDateISO`
- `timezone`
- department `hoursByWeekday` (Mon–Sun)

Bereken:

- Voor elke dag in de horizon vanaf startDateISO-middernacht in timezone:
  - bepaal weekday
  - tel departmentHours[weekday] op

Output:

- `summary.totalScheduledHoursByDepartment[deptId]`

---

## 7) Step-level beschikbare uren bepalen

Voor elke step in flow-volgorde:

### 7.1 Scheduled hours per step

- Step erft deptId → `scheduledHours = totalScheduledHoursByDepartment[deptId]`

### 7.2 Startup hours (alleen ResourceSteps)

- dailyStartupMinutes wordt toegepast:
  - per productiedag: dag waarop deptHours[weekday] > 0
  - binnen horizon
- `startupHoursApplied = (dailyStartupMinutes × productionDayCount) / 60`

### 7.3 Available hours after startup

- `availableHoursAfterStartup = max(0, scheduledHours - startupHoursApplied)`

### 7.4 Availability toepassen

- ResourceStep: `effectiveHours = availableHoursAfterStartup × availability`
- TimeStep: `effectiveHours = availableHoursAfterStartup` (availability = 1)

Als `targetGoodUnits > 0` en `effectiveHours = 0`:

- validation error
- `utilizationAtTarget = null`
- `capacityStatus = 'blocked_no_hours'`
- step is infeasible contributor

---

## 8) Step-level rate bepalen (units per uur)

### 8.1 ResourceStep rate met parallel units

Per resource:

- bepaal `baseRate` volgens resourceType
- bepaal `availability` genormaliseerd [0,1]
- gebruik `parallelUnits` (>=1, default 1)

Deterministisch:

- `effectiveRateUnitsPerHour = baseRate * availability * parallelUnits`

Yield blijft step-level.

### 8.2 TimeStep rate

- `effectiveRateUnitsPerHour = 60 / durationMinutesPerUnit`

---

## 9) Throughput-definitie (deterministisch, final good basis)

Bottleneck-basis is **final good units bij End-step**.

### 9.1 Forward yield propagation

Voor step i in flow-volgorde:

- `yield_i = resource.yieldPct/100` voor ResourceStep
- `yield_i = 1` voor TimeStep
- `cumYieldToEnd_i = Π(yield_k)` voor alle steps k van i t/m laatste enabled step

### 9.2 stepMaxGoodUnitsPerHour

Voor step i:

- `stepMaxInputUnitsPerHour_i = effectiveRateUnitsPerHour_i`
- `stepMaxGoodUnitsPerHour_i = stepMaxInputUnitsPerHour_i * cumYieldToEnd_i`

### 9.3 stepMaxGoodUnitsOverHorizon

- `stepMaxGoodUnitsOverHorizon_i = stepMaxGoodUnitsPerHour_i * effectiveHours_i`

### 9.4 systeemthroughput

- `summary.maxThroughputGoodUnits = min_i(stepMaxGoodUnitsOverHorizon_i)` over enabled steps

---

## 10) Capacity & utilization per step bij target

Voor elke enabled step:

### 10.1 Required throughput op final-good basis

- `requiredGoodUnitsPerHourAtStep_i = targetGoodUnits / effectiveHours_i`
- `requiredInputUnitsPerHourAtStep_i = requiredGoodUnitsPerHourAtStep_i / cumYieldToEnd_i`

### 10.2 Required work hours at target

- `requiredWorkHoursAtTarget_i = targetGoodUnits / stepMaxGoodUnitsPerHour_i`

### 10.3 Utilization at target

- als `effectiveHours_i > 0`: `utilizationAtTarget_i = requiredWorkHoursAtTarget_i / effectiveHours_i`
- anders: `utilizationAtTarget_i = null`

---

## 11) Bottleneck selectie (deterministisch)

Alleen enabled steps zijn bottleneck-kandidaten.

Tie-break volgorde:

1. hoogste `utilizationAtTarget`
2. bij tie: laagste `stepMaxGoodUnitsPerHour`
3. bij tie: laagste `stepIndex`
4. bij tie: lexicografisch kleinste `stepId`

Engine vult:

- `summary.bottleneckStepId`, `bottleneckResourceId`, `bottleneckType`
- `summary.bottleneckBasisHours = bottleneckStep.effectiveHours`
- `summary.requiredGoodUnitsPerHourAtBottleneckBasis = targetGoodUnits / bottleneckBasisHours`

---

## 12) Feasibility bepalen

`feasible = true` als:

- geen blocking errors
- en `maxThroughputGoodUnits >= targetGoodUnits`

Warnings blokkeren feasibility niet.

---

## 13) CapacityStatus enum

`capacityStatus` is exact één van:

- `ok`
- `warning`
- `blocked_no_hours`
- `blocked_missing_resource`
- `invalid_input`
- `disabled`

---

## 14) Disabled steps

Disabled steps blijven in `steps` array.

Voor disabled step:

- `utilizationAtTarget = null`
- `capacityStatus = 'disabled'`
- `isBottleneckCandidate = false`

Alleen enabled steps nemen deel aan throughput en bottlenecklogica. Enabled steps moeten contiguous zijn.

---

## 15) ComparisonResult bouwen (baseline vs scenario)

Als scenario-run:

- bereken baseline en scenario results
- maak `comparison` met:
  - `deltaMaxThroughputGoodUnits`
  - `baselineFeasible: boolean`
  - `scenarioFeasible: boolean`
  - `feasibleChanged: boolean`
  - `changedBottleneck`
  - per-step deltas
  - provenance (changed departments/resources, added resources)

---

## 16) Explainability

Elke StepResult krijgt korte “waarom” zinnen.

Voorbeelden:

- “Dept schedule: 18 production days × 8h = 144h”
- “Startup: 15m/day × 18 days = 4.5h”
- “Availability 70% → effective hours 97.65h”
- “Forward yield to end = 0.91, stepMaxGoodUnitsPerHour = 52.3”

---

Add-on B — Engine Boundary Contract

## 1) Engine is pure calculation

De engine is een pure functie:

`run(resolvedInput, request) -> RunBundle`

- deterministisch
- geen side-effects
- geen storage writes

## 2) Run opslag (MVP)

Runs worden niet door de engine opgeslagen.

De applicatie bewaart alleen:

- `latestRunResult: RunBundle | null`

## 3) Baseline + scenario samen runnen

Bij klikken op “Run”:

- baseline wordt gerund
- scenario wordt gerund (als actief)
- dashboard ontvangt beide resultaten in één RunBundle

## 4) Geen run history in MVP

- geen database
- geen run history
- geen versioning
- bij refresh is `latestRunResult` weg
