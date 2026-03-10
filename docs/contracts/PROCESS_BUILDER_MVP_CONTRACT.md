# Process Builder — MVP Domeincontract (agreed)

## 0) Doel en rol

De Process Builder definieert de lineaire volgorde waarin stappen worden uitgevoerd om één product te produceren.

Het is de structurele laag tussen:

- Resources (capaciteitsdefinitie)
- Departments (tijd)
- Scenario’s (variatie)

In MVP geldt:

- Eén flow per project
- Eén product per flow
- Lineair proces (geen splits/loops)

---

## 1) Flow-structuur (MVP)

### 1.1 Node types

MVP ondersteunt exact vier node types:

- `start`
- `end`
- `resourceStep`
- `timeStep`

Flow is strikt lineair.

### 1.2 Lineariteit-regel

In MVP moet de flow:

- exact 1 start node bevatten
- exact 1 end node bevatten
- een aaneengesloten pad vormen van start → end
- geen cycli bevatten
- geen vertakkingen bevatten
- geen zwevende nodes bevatten

Alle nodes moeten connected zijn.

---

## 2) Step types (instance-level)

Elke stap in de flow is óf ResourceStep óf TimeStep.

### 2.1 ResourceStep

Vereist:

- `resourceId` (verplicht)

Eigenschappen:

- `resourceId`
- `label` (optioneel)
- `notes` (optioneel)
- `enabled` (default true)

Belangrijk:

- geen performance overrides op step-niveau
- geen yield overrides
- geen availability overrides
- geen department overrides

### 2.2 TimeStep

Vereist:

- `durationMinutesPerUnit` (> 0)

Eigenschappen:

- `durationMinutesPerUnit`
- `label`
- `notes`
- `enabled`

TimeStep-regels:

- heeft geen `resourceId`
- yield is vast `100%` (niet instelbaar)
- heeft geen scrap-configuratie
- heeft geen eigen `departmentId`, maar erft department van dichtstbijzijnde upstream ResourceStep
- is department-limited

Als geen upstream ResourceStep bestaat voor een TimeStep: flow invalid.

---

## 3) Resource vs Step — Strikte scheiding

### 3.1 Resource (library-level)

Resource bevat:

- type (`batch` / `continuous` / `manual`)
- performance parameters
- availability
- yield
- dailyStartupMinutes
- departmentId
- requiredOperators
- parallelUnits (>=1, default 1)

### 3.2 Step (instance-level)

Step bevat alleen proces-context:

- resourceId (bij ResourceStep)
- durationMinutesPerUnit (bij TimeStep)
- label
- notes
- enabled

Step mag nooit:

- capaciteit wijzigen
- resource-parameters overriden
- department wijzigen

---

## 4) Actieve en enabled steps

- Disabled steps blijven onderdeel van de flow-definitie.
- Enabled steps moeten een contiguous keten vormen tussen start en end.
- Alleen enabled steps tellen mee voor throughput en bottleneck.

---

## 5) Resource-hergebruik in flow

In MVP mag dezelfde baseline resource maximaal één keer in een flow voorkomen.

Parallelle capaciteit wordt bepaald door `resource.parallelUnits` op de gekoppelde resource.

---

## 6) Validatie-regels (MVP)

Een flow is runnable als:

- exact 1 start node
- exact 1 end node
- minstens 1 step tussen start en end
- minstens 1 ResourceStep in de flow
- alle nodes verbonden
- geen cycli
- geen vertakkingen
- elke ResourceStep heeft geldige `resourceId`
- elke TimeStep heeft `durationMinutesPerUnit > 0`
- elke gebruikte resource bestaat in library
- enabled steps vormen contiguous chain

---

## 7) UX-regel voor toevoegen van steps

MVP toevoegproces:

1. User kiest ResourceStep of TimeStep.
2. Bij ResourceStep:
   - resource picker opent
   - optie om nieuwe resource aan te maken via “+”
   - na aanmaken direct selecteerbaar
3. Bij TimeStep:
   - user vult `durationMinutesPerUnit` in

---

## 8) Engine-implicaties

Engine behandelt:

- ResourceStep:
  - capaciteit via resource parameters
  - department bepaalt beschikbare tijd
  - dailyStartupMinutes toepassen
  - availability meenemen
  - yield op step-niveau toepassen
  - capaciteit vermenigvuldigen met `resource.parallelUnits`
- TimeStep:
  - vaste tijdsduur per unit
  - yield = 100%
  - geen startup
  - geen availability-configuratie
  - department-limited via inheritance
