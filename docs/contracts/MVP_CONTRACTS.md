## MVP Concept & Feature Overview

## Positionering

Een webbased capaciteits- en scenario-simulatie tool voor MKB productiebedrijven.

De tool is gepositioneerd tussen Excel en ERP-systemen:

- Excel is foutgevoelig en moeilijk schaalbaar
- ERP is vaak zwaar, duur en overgedimensioneerd voor dit doel

De tool doet één ding uitstekend:

> Binnen enkele minuten inzicht geven in productiecapaciteit, bottlenecks en scenario-impact.

---

## Kernbelofte

Binnen 10 minuten antwoord op drie kernvragen:

- Is mijn productieplan haalbaar?
- Waar zit mijn bottleneck?
- Wat gebeurt er als ik iets verander?

De commerciële waarde zit in duidelijke, onderbouwde besluitvorming.

---

## 1) Resource Library

De library bevat alle capaciteitsdragers in het proces.

Een resource representeert een machine, werkstation of handmatige bewerking.

Per resource configureer je in MVP:

- output per uur of cyclustijd/batchlogica
- batch of continu type
- aantal parallelle units
- efficiëntie/yield
- koppeling aan precies één department

Niet in scope:

- financiële data
- onderhoudsdata
- voorraadlogica

Doel: alleen informatie die nodig is om capaciteit te berekenen.

---

## 2) Process Builder

De Process Builder is een visueel canvas voor lineaire procesopbouw.

MVP ondersteunt:

- één product
- één lineaire flow
- één startpunt
- één eindpunt

Step-types:

- `resourceStep` (gekoppeld aan resource)
- `timeStep` (wachttijd, transport, etc.)
- `start`
- `end`

Niet in scope:

- parallelle routing
- alternatieve routes
- meerdere producten

De builder bepaalt de volgorde van berekening.
De library bepaalt de capaciteitsparameters.

---

## 3) Departments

Een department representeert een fysieke afdeling met structurele werktijd.

Per department stel je in:

- naam
- beschikbare uren per week (eventueel verdeeld per weekdag)

Regels:

- elke resource hoort bij exact één department
- departments modelleren tijd, niet performance

Niet in scope:

- gedetailleerde ploegenplanning
- vakantie- en feestdagkalenders
- dag-tot-dag personeelsroosters

Scenario’s mogen openingsuren tijdelijk overriden.

---

## 4) Scenarios

Scenario’s zijn tijdelijke overlays op baseline-data.

MVP ondersteunt:

- één baseline
- maximaal twee scenario’s
- altijd vergelijking ten opzichte van baseline

Scenario mag wijzigen:

- demand
- resource-efficiëntie/availability
- parallelle units
- openingstijden per department

Scenario mag niet:

- flowstructuur wijzigen
- steps toevoegen/verwijderen
- departments aanmaken
- meerdere producten introduceren
- financiële berekeningen uitvoeren

Doel: investerings- en optimalisatiekeuzes veilig testen zonder baseline te vervuilen.

---

## 5) Dashboard

Het dashboard is het beslissingsscherm en toont direct:

- maximale throughput
- geplande demand versus capaciteit
- bottleneck-step
- utilisatie per step

Daarnaast:

- baseline vs scenario vergelijking
- waarschuwingen bij overbelasting
- export voor managementoverzicht

Niet in scope:

- historische trendanalyse
- financiële KPI’s
- complexe BI-visualisaties

Het dashboard moet één simulatie snel en helder samenvatten.

---

## Wat het MVP expliciet niet is

- geen ERP
- geen MRP
- geen multi-product planning
- geen personeelsplanning
- geen kostprijsberekening
- geen geavanceerde optimalisatie-algoritmes

Het is een capaciteits-simulatie tool. Punt.

---

## Ideale gebruiker

- productiecoördinator
- operations manager
- directeur-eigenaar in MKB

Typisch bedrijf:

- 20–150 medewerkers
- werkt vandaag vooral in Excel
- wil scenario’s testen zonder zwaar IT-project

---

## Commerciële waarde

Met dit MVP kan een bedrijf:

- objectief aantonen waar de bottleneck zit
- investeringen onderbouwen met simulatieresultaten
- capaciteitsbeslissingen vooraf toetsen
- operationele verbeteringen vergelijken zonder implementatierisico

De kernwaarde is besluitonderbouwing met minimale implementatiedrempel.
