## 0) Doel

Deze conventies zorgen dat termen in UI, domeinmodel, engine en documentatie hetzelfde betekenen.

Principes:

- één term = één betekenis
- Engels in UI en in code
- expliciet onderscheid tussen baseline en scenario

---

## 1) Taalgebruik per laag

### 1.1 UI-teksten

- Primair Engels, kort en operationeel.
- Gebruik herkenbare productietermen (bijv. “Bottleneck”, “Capacity”, “Department”).

### 1.2 Code & datavelden

- Engels voor identifiers en object keys.
- `camelCase` voor variabelen/velden/functies.
- `PascalCase` voor componenten en types.
- `UPPER_SNAKE_CASE` voor foutcodes en constanten.

### 1.3 Documentatie

- Domeinbeschrijving mag Nederlands.
- Datavelden en enums altijd exact zoals in code (Engels) noteren.

---

## 2) Entity naming (domein)

Gebruik consequent deze hoofdentiteiten:

- `Resource`
- `Department`
- `ProcessStep`
- `TimeStep`
- `Scenario`
- `RunResult`

Vermijd synoniemen door elkaar (zoals station/machine/capaciteitsdrager in modelnamen).

Regel:

- **Resource** is de generieke technische entiteit
- subtypering gebeurt via `type` (`continuous | batch | manual`)

---

## 3) ID-conventies

- Altijd suffix `Id` voor verwijzingen: `resourceId`, `departmentId`, `scenarioId`, `stepId`.
- Primair string IDs.
- Geen betekenisvolle parsing uit ID’s afdwingen in businesslogica.

Aanbevolen patronen (niet verplicht):

- `res_<slug>`
- `dep_<slug>`
- `step_<slug>`
- `scn_<slug>`

---

## 4) Kwantiteit, eenheden en suffixen

Gebruik expliciete eenheden in veldnamen om ambiguïteit te voorkomen.

### 4.1 Tijd

- minuten: `...Minutes`
- uren: `...Hours`
- dagen: `...Days`

Voorbeelden:

- `cycleTimeMinutes`
- `dailyStartupMinutes`
- `scheduledHours`
- `horizonDays`

### 4.2 Snelheid en volume

- per uur-rates: `...PerHour`
- aantallen: `...Units`
- capaciteit over horizon: `...OverHorizon`

Voorbeelden:

- `outputPerHour`
- `maxThroughputGoodUnits`
- `parallelUnits`

### 4.3 Percentages en ratios

- percentages 0..100: `...Pct` (bijv. `yieldPct`)
- ratio/fractie 0..1: `...Ratio` of domeinspecifiek `availability`

Regel:

- gebruik niet door elkaar `yield` en `yieldPct`; kies **`yieldPct`**.

---

## 5) Baseline vs scenario conventies

- Baseline-velden krijgen geen prefix.
- Scenario-aanpassingen krijgen suffix/pad `Override` of zitten in `...Overrides`-object.

Voorbeelden:

- `resourceOverrides`
- `departmentScheduleOverride`
- `effectiveAvailability` (na overlay-resolutie)

Terminologie:

- “baseline” = persistente bronwaarde
- “override” = tijdelijke scenario-waarde
- “effective” = door engine berekende eindwaarde na toepassen van regels

---

## 6) Step naming in Process Builder

- Gebruik `resourceStep` en `timeStep` als technische types.
- UI-labels mogen vrij zijn, maar type-keys niet vertalen.

Aanbevolen labelstijl in UI:

- verb + object (e.g. “Fill”, “Seal”, “Transport to Cooling”).

---

## 7) Validatie- en foutcodeconventies

Foutcodes:

- formaat `ERR_<DOMEIN>_<ONDERWERP>` of bestaande afgesproken codes
- altijd `UPPER_SNAKE_CASE`

Voorbeelden:

- `ERR_INVALID_TARGET_GOOD_UNITS`
- `ERR_TIMESTEP_NO_UPSTREAM_RESOURCE`
- `ERR_RESOURCE_DEPARTMENT_REQUIRED`

Warnings:

- `WARN_<DOMEIN>_<ONDERWERP>`

Menselijke foutboodschap:

- kort, direct, met herstelactie waar mogelijk.

---

## 8) Bestands- en componentnamen

In dit project:

- React componenten: `PascalCase.tsx` (bijv. `ProcessBuilder.tsx`)
- utility/modules: `camelCase.ts` of domeinbestand in hoofdletters als contractdocument
- contractdocs: `UPPER_SNAKE_CASE.md`

Belangrijk:

- houd nieuwe bestandsnamen consistent met bestaande mapconventies per domein.

---

## 9) Verboden/te vermijden naamgeving

- Vage namen als `value`, `data`, `item`, `thing` zonder context.
- Afkortingen die niet gangbaar zijn in team/domein.
- Gemixte taal binnen één identifier (bijv. `afdelingHoursPerWeek`).
- Meervoud/singular door elkaar voor hetzelfde concept.

---

## 10) Definition of done

Naming-conventies zijn voldoende toegepast als:

- dezelfde domeintermen in UI, docs en code consistent zijn
- alle velden met tijd/percentage/rate expliciete suffixen gebruiken
- baseline/override/effective semantiek overal eenduidig is
- validatiecodes in vast patroon staan
- nieuwe entiteiten zonder synoniemen of taal-mix zijn benoemd
