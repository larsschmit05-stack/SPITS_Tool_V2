## 0) Doel en positie in het systeem

Een Scenario is een alternatief toekomstbeeld van hetzelfde project en dezelfde flow.

Doel:

- capaciteit testen onder gewijzigde aannames
- zonder baseline-structuur permanent te wijzigen

Scenario is een overlay op baseline.

---

## 1) Scope van een scenario in MVP

Scenario mag alleen:

1. Demand/horizon/anchor invullen
2. Department schedule overriden
3. Resource parameters overriden
4. Resource `parallelUnits` overriden

Scenario mag niet:

- flow-structuur wijzigen
- baseline step→resource binding rebinden
- auto-allocatie uitvoeren

---

## 2) Scenario requestvelden (verplicht)

- `targetGoodUnits` (> 0)
- `horizonCalendarDays` (> 0)
- `startDateISO` (ISO datum)
- `timezone` (IANA)

Horizonberekening start op `startDateISO` middernacht in `timezone`.

---

## 3) Department schedule overrides

- `departmentScheduleOverrides: Map<departmentId, ScheduleOverride>`
- Baseline department schedules blijven immutable.
- Override werkt alleen in-memory tijdens scenario-run.

Validatie:

- `openingHours` per weekday moet in [0,24] liggen.

---

## 4) Resource overrides

- `resourceOverrides: Map<resourceId, Partial<Resource>>`

Toegestane velden in MVP:

- availability
- yield
- performancevelden
- dailyStartupMinutes
- parallelUnits (>=1)

Baseline resource blijft immutable.

---

## 5) Wat scenario expliciet NIET doet in MVP

- geen nieuwe resources toevoegen

- geen flow-editing
- geen node-toevoeging/verwijdering
- geen multi-product mix
- geen allocatie tussen meerdere flows
- geen multi-scenario tegelijk
- geen baseline mutatie

---

## 6) Engine-resolutie-regel

Bij scenario-run:

1. start vanuit baseline
2. pas in-memory toe:
   - departmentScheduleOverrides
   - resourceOverrides
3. run berekening
4. produceer scenario RunResult + comparison

Baseline blijft ongewijzigd.

---

## 7) Comparison-semantiek

Scenariovergelijking gebruikt:

- `baselineFeasible: boolean`
- `scenarioFeasible: boolean`
- `feasibleChanged: boolean`

`deltaFeasible` bestaat niet in het contract.

---

## 8) MVP aannames

- één product per flow
- één actief scenario tegelijk
- demand als totaal over horizon
- geen ROI/kostenmodel

---

## 9) Minimale datavorm

- `id, name`
- `demand: { targetGoodUnits, horizonCalendarDays, startDateISO, timezone }`
- `departmentScheduleOverrides: Map<departmentId, ScheduleOverride>`
- `resourceOverrides: Map<resourceId, Partial<Resource>>`
