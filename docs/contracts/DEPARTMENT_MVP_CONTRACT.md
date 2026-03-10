## 0) Doel en rol 

De **Departments-tab** is de plek waar je vastlegt **wanneer er gewerkt wordt**.

Kort:

- **Department bepaalt tijd** (beschikbare productie-uren).
- **Resource bepaalt snelheid** (output/uur of batch-cyclus).
- Engine combineert deze om throughput te berekenen.

---

## 1) Conceptuele definitie

Een **Department** is in MVP een **organisatorische eenheid** (bijv. Assemblage, QA, Voorraadverwerking) die een gedeeld **werktijd-regime** definieert voor alle resources die eraan gekoppeld zijn.

Departments zijn dus:

- herkenbaar voor MKB (“waar horen machines organisatorisch bij?”)
- de bron van openingstijden/roosterlogica

---

## 2) Relatie tussen Resources en Departments

In MVP geldt:

- Elke **Resource** is gekoppeld aan **exact 1 Department**.
- Een **Department** kan **meerdere Resources** bevatten.

**Geen** multi-department resources in MVP.

Motief:

- voorkomt tijdsplitsing/allocatiecomplexiteit
- houdt engine-resolutie deterministisch

---

## 3) Department scheduling model (MVP)

### 3.1 Basisprincipe

Een department heeft een **week-rooster** met **uren per dag**, waarbij dagen onderling mogen verschillen.

MVP ondersteunt:

- **variabele uren per dag** (bijv. Ma–Do 8 uur, Vr 6 uur)
- weekpatroon als primaire unit

MVP ondersteunt (nog) niet:

- maand-/jaar-kalenders met uitzonderingen (feestdagen, onderhoudsdagen)
- multiple shifts als apart entiteit-model (kan later)

### 3.2 Representatie (conceptueel)

Department schedule is een mapping:

- `hoursByWeekday` (0..24), per weekdag

Voorbeeld:

- Mon: 8
- Tue: 8
- Wed: 8
- Thu: 8
- Fri: 6
- Sat: 0
- Sun: 0

Belangrijk:

- Openingstijden als clock-times (08:00–16:00) zijn **niet nodig** voor MVP-engine (want we rekenen in uren).
- UI mag het alsnog tonen, maar engine-input is uren.

---

## 4) Engine tijdseenheid

De engine rekent in **uren**.

Departments leveren:

- beschikbare uren per dag/week binnen de gekozen horizon

Resources gebruiken:

- rate per uur of batch-cyclus om throughput te berekenen

---

## 5) Scenario integratie (department overrides)

Scenario’s mogen department roosters aanpassen via **override-velden**.

MVP-regel:

- Baseline department blijft intact
- Scenario bevat overrides die baseline overschrijven tijdens een run

### 5.1 Override gedrag

- Scenario override is “in-memory overlay” (net als resource overrides)
- Geen permanente mutatie van baseline department state

### 5.2 Wat mag overriden

- `hoursByWeekday` (hele mapping of deels per dag)

---

## 6) Daily startup relatie (koppeling met Resources contract)

De definitie van “productiedag” is:

> Een dag waarop het department volgens zijn rooster **> 0 uren** draait.
> 

Dit is relevant voor `dailyStartupMinutes` van resources:

- startup wordt alleen afgetrokken op productiedagen van het gekoppelde department
- en alleen voor resources die actief produceren in de flow-run (reachability-regel)

---

## 7) MVP aannames en expliciete beperkingen

- Weekpatroon is de enige schedule-vorm in MVP
- Geen holiday calendar / uitzonderingsdagen
- Geen shift-entiteiten (aantal shifts kan later toegevoegd worden als uitbreiding op schedule)
- Eén resource hoort bij één department

---

## 8) “Definition of done” voor Departments contract

Departments zijn MVP-ready als:

- CRUD voor departments werkt
- Resources kunnen aan precies één department gekoppeld worden
- Schedule is week-based met uren per weekdag (variabel per dag)
- Scenario kan schedule overriden zonder baseline mutatie
