## 0) Doel en rol

De **Resource Library** is de plek waar je productiecapaciteit vastlegt in concrete, herkenbare bouwstenen.

Doel van de library in MVP:

- genoeg vastleggen om **betrouwbare capaciteitsberekeningen** te doen
- niet vervallen in een technisch machinepaspoort of ERP-detailniveau
- snel invoerbaar houden voor MKB-gebruikers

Kort:

- **Department bepaalt tijd** (wanneer gewerkt wordt)
- **Resource bepaalt snelheid** (hoeveel output mogelijk is)

---

## 1) Definitie van een Resource (MVP)

Een **Resource** vertegenwoordigt één capaciteitsdrager in het proces.

Voorbeelden binnen scope:

- machine
- werkstation
- handmatige bewerking
- verpakkingslijn

Buiten scope in MVP:

- grondstoffen als losse resources
- tooling als aparte capaciteitsentiteit
- onderhoudsobjecten

Motivatie: grondstoffen als resource trekt direct richting MRP-logica en valt buiten het MVP-doel.

---

## 2) Resource types

MVP ondersteunt drie operationele types:

- `continuous`
- `batch`
- `manual`

### 2.1 Continuous

Capaciteit wordt primair afgeleid uit:

- `outputPerHour`

### 2.2 Batch

Capaciteit wordt primair afgeleid uit:

- `batchSize`
- `cycleTimeMinutes`

### 2.3 Manual

Functioneert qua berekening als continue rate-logica, maar semantisch voor menselijke handelingen/stations.

---

## 3) Verplichte basisvariabelen per Resource

Elke resource bevat in MVP minimaal:

- `id`
- `name`
- `type` (`continuous | batch | manual`)
- performance-logica:
  - ofwel `outputPerHour` (continuous/manual)
  - ofwel `batchSize` + `cycleTimeMinutes` (batch)
- `parallelUnits` (>= 1)
- `yieldPct` (0..100]
- `availability` (0..1]
- `departmentId` (exact 1)
- `dailyStartupMinutes` (>= 0, relevant voor batch/continue en waar nodig manual)

Bewust niet in MVP:

- onderhoudsgegevens
- kostenstructuren
- technische machine-specificaties
- voorraad- of materiaallogica

---

## 4) Continu versus batch — rekensemantiek

Het onderscheid moet zichtbaar zijn in UI en expliciet in engine.

### 4.1 Continuous/manual rate

Indicatieve basisrate:

- `baseRateUnitsPerHour = outputPerHour`

### 4.2 Batch rate

Indicatieve basisrate:

- `baseRateUnitsPerHour = batchSize / (cycleTimeMinutes / 60)`

### 4.3 Effectieve rate

Na toepassing van resourcefactoren:

- `effectiveRate = baseRateUnitsPerHour * availability * parallelUnits`

Yield wordt meegenomen op step/outputniveau conform enginecontract.

---

## 5) Parallelle capaciteit

MVP ondersteunt parallelle capaciteit op resource-niveau met één veld:

- `parallelUnits` (integer, >= 1)

Voorbeelden:

- 2 identieke ovens
- 3 operators op hetzelfde station

Doel:

- geen duplicatie van nagenoeg identieke resources
- scenario’s kunnen tijdelijk opschalen via overrides
- baseline blijft schoon en herbruikbaar

---

## 6) Koppeling aan Departments

Regels in MVP:

- elke resource moet gekoppeld zijn aan **exact 1** department
- resource zonder `departmentId` is invalid

Interpretatie:

- department levert de beschikbare tijd
- resource levert de verwerkingssnelheid

Geen tijdscontext = geen geldige capaciteitsberekening.

---

## 7) Startup/setuptijd

Resources mogen een dagelijkse opstartcomponent hebben:

- `dailyStartupMinutes`

Regel:

- startup wordt alleen toegepast op productiedagen van het gekoppelde department
- startup reduceert beschikbare tijd vóór throughput-berekening

Belangrijk voor realisme bij o.a. batch- en lijnprocessen.

---

## 8) CRUD en UX-eisen voor de Resource Library

De Resource Library moet aanvoelen als een praktische werkvloerlijst:

- overzichtelijke tabel/lijst
- eenvoudige zoekfunctie
- snel resource kunnen aanmaken
- resource kunnen dupliceren

Dupliceren is essentieel omdat veel assets op elkaar lijken en initiële invoer anders te traag wordt.

---

## 9) Wat de Resource Library expliciet niet doet (MVP)

Niet in scope:

- voorraadbeheer
- financiële parameters
- multi-product routing op resource-niveau
- onderhoudsplanning
- personeelsroosters
- productafhankelijke complexe beperkingen per resource

De library is voor **capaciteitsmodellering**, niet voor volledige operations-administratie.

---

## 10) Validatieregels (MVP)

Minimale validatie:

- `name` verplicht, niet leeg
- `type` verplicht en geldig enum-lid
- `parallelUnits >= 1`
- `availability > 0 && availability <= 1`
- `yieldPct > 0 && yieldPct <= 100`
- `dailyStartupMinutes >= 0`
- `departmentId` moet verwijzen naar bestaand department
- continuous/manual: `outputPerHour > 0`
- batch: `batchSize > 0` en `cycleTimeMinutes > 0`

Bij invalid input:

- duidelijke foutmelding op veldniveau
- resource mag niet als actief in berekening worden meegenomen

---

## 11) Definition of done

Resource-contract is MVP-ready als:

- resources als machine/station/manual stap beheerd kunnen worden via CRUD
- continuous en batch logica beide ondersteund zijn
- parallelUnits correct doorwerkt in capaciteit
- elke resource exact één department-koppeling heeft
- dailyStartupMinutes doorwerkt op effectieve capaciteit
- dupliceren + zoeken beschikbaar is in de library-UX
- uitgesloten domeinen (MRP/financieel/onderhoud) niet in datamodel afdwingend aanwezig zijn
