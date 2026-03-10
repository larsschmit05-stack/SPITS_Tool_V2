# Library V2 — Single Source of Truth

## Doel en positionering

De Library vormt de centrale bron van waarheid (“single source of truth”) voor alle capaciteitsbepalende elementen binnen het procesmodel.
Alle productie-, transport- en tijdstappen worden hier als gestandaardiseerde bouwstenen beheerd.

De Library moet:

- de werkvloer realistisch representeren;
- hergebruik en consistentie garanderen;
- modellering versnellen;
- foutieve aannames en duplicatie voorkomen;
- schaalbaarheid en toekomstige uitbreidingen ondersteunen.

## 1. Uniform objectmodel: Process Element

### Aanpassing

Alle processtappen worden ondergebracht in één universeel objecttype: Process Element.

### Definitie

Een Process Element is:

een stap in het proces die tijd kost en/of capaciteit beperkt en daarmee throughput of doorlooptijd beïnvloedt.

De engine bepaalt wachttijden en bottlenecks op basis van deze elementen.

### Type-gebaseerde differentiatie

Het type bepaalt de rekenlogica en benodigde invoervelden:

- Continuous (machine-output)
- Manual / Labor (handmatige bewerking)
- Batch (batchverwerking)
- Transport (verplaatsing met capaciteit)
- Delay (technische wachttijd)

Deze structuur verhoogt consistentie, begrijpelijkheid en uitbreidbaarheid.

## 2. Typebenaming en terminologie

### Aanpassing

Terminologie wordt afgestemd op praktijkgebruik en begrijpelijkheid voor operations-teams.

### Nieuwe benamingen

- Continuous → Continuous / Machine
- Rate-based → Manual / Labor
- Transport → Round Trip Transport
- Delay → Technical Delay

Deze benamingen verminderen interpretatieverschillen en sluiten beter aan bij operationele realiteit.

## 3. Basisvelden (Universeel)

### Aanpassing

Alle Process Elements bevatten een vaste kernset velden.

### Verplicht

- Naam
- Type
- Department (niet bij Delay)
- Parallel units (default: 1)

### Optioneel

- Beschrijving
- Tags

Deze structuur zorgt voor consistente identificatie en hergebruik.

## 4. Realisme-factoren (Performance Factors)

### Aanpassing

De drie belangrijkste real-world correctiefactoren worden standaard opgenomen en gegroepeerd onder:

Performance Factors

- Availability (uptime)
- Yield / First Pass Yield
- Startup loss (min/dag)

### Doel

Deze factoren zorgen ervoor dat berekende capaciteit overeenkomt met werkelijke prestaties.

### UI-verbeteringen

Tooltips worden toegevoegd:

- Availability → effectieve inzetbaarheid van tijd
- Yield → percentage output zonder uitval of herstel
- Startup loss → dagelijks tijdverlies door opstart of voorbereiding

## 5. Type-specifieke invoerstructuur

### Aanpassing

Per type worden alleen de noodzakelijke invoervelden getoond om cognitieve belasting te minimaliseren.

### Continuous / Machine

- Output rate (units/uur)
- Parallel units

### Manual / Labor

- Cycle time (min/unit)
- Parallel units

### Batch

- Batch size
- Batch cycle time
- Parallel units

Aanvullende verduidelijking:
Batch cycle time omvat alle thermische en verwerkingstijd.

### Transport

- Capacity per trip
- Round trip time
- Parallel transport units

### Delay

- Delay time
- Mode: per unit of per batch
- Geen department

Delay blijft strikt bedoeld voor technische wachttijd (koelen, drogen, curing).

## 6. Batch-handling verduidelijking

### Aanpassing

Voor batchprocessen wordt expliciet rekening gehouden met handling-tijd.

### Sterk aanbevolen (maar optioneel in MVP)

- Load/unload time per batch
- Minimum batch size

Dit voorkomt onderschatting van batchbeperkingen.

## 7. Transport realisme-verbeteringen

### Aanpassing

Transport wordt realistischer gemodelleerd om overschatting van capaciteit te voorkomen.

### Aanvullend veld (Advanced)

- Queue allowance (wachttijd per rit of %)

Dit vangt wachttijd bij docks, prioriteiten en beschikbaarheid op.

## 8. Delay: gebruiksafbakening

### Aanpassing

Delay wordt strikt gedefinieerd als technische wachttijd.

### Richtlijnen

Delay mag gebruikt worden voor:

- koelen
- drogen
- curing

Delay mag niet gebruikt worden om wachtrijen door capaciteitsgebrek te modelleren.

Dit voorkomt modelvervuiling en foutieve bottleneckanalyse.

## 9. Department-koppeling en tijdslogica

### Aanpassing

De rol van departments wordt expliciet vastgelegd:

- Departments bepalen beschikbare tijd.
- Process Elements bepalen verwerkingssnelheid.
- De engine bepaalt bottlenecks.

Delay-elementen hebben geen department omdat zij geen capaciteit gebruiken.

## 10. Preview & validatie (sanity check)

### Aanpassing

Bij het aanmaken van een element wordt een preview getoond:

### Preview toont

- theoretische capaciteit per week
- effectieve capaciteit (met performance factors)

### Validatie-waarschuwingen

- ontbrekend department
- extreme waarden
- startup loss groter dan beschikbare tijd

Dit verhoogt vertrouwen en voorkomt invoerfouten.

## 11. Terminologie: Parallel Units

### Aanpassing

Terminologie wordt verduidelijkt om verwarring te voorkomen.

### Alternatieve labelopties

- Aantal gelijktijdig actief
- Aantal units tegelijk beschikbaar

Tooltip:

Hoeveel machines, medewerkers of middelen tegelijk deze stap uitvoeren.

## 12. Library als Single Source of Truth

### Aanpassing

De Library fungeert als centrale waarheid voor alle flows en scenario’s.

### Functionele principes

- Elementen worden éénmalig gedefinieerd.
- Wijzigingen gelden overal waar het element wordt gebruikt.
- Duplicatie en inconsistente definities worden voorkomen.

Dit maakt de tool betrouwbaar en schaalbaar.

## 13. Structuur, filterbaarheid en schaalbaarheid

### Aanpassing

De library ondersteunt groei en overzicht.

### Ondersteuning voor:

- filtering op type
- filtering op department
- zoeken op naam en tags

Deze functionaliteit wordt essentieel bij grotere modellen.

## 14. UX-principes voor V2

De Library volgt de volgende ontwerpprincipes:

- slechts relevante velden tonen;
- logische invoerstappen;
- defaults gebruiken voor snelle invoer;
- preview tonen vóór opslaan;
- realisme zonder complexiteit.

## 15. Process Element Creation Flow – Behavioral Contract

### 15.1 Creation guarantees

- Het systeem MUST een nieuw Process Element aanmaken via een expliciete create-actie.
- Het systeem MUST type-selectie afdwingen vóórdat type-specifieke invoer wordt geaccepteerd.
- Het systeem MUST alleen type-relevante capaciteitvelden accepteren voor het gekozen type.

### 15.2 Required fields per type

Voor alle types geldt:

- Name: required.
- Type: required.

Voor type = Technical Delay:

- Department: NOT required en MUST NOT worden opgeslagen.
- Delay mode: required (`per_unit` of `per_batch`).
- Delay time: required.

Voor type ≠ Technical Delay:

- Department: required.

Type-specifieke vereiste velden:

- Continuous / Machine: output_rate, parallel_units.
- Manual / Labor: cycle_time, parallel_operators.
- Batch: batch_size, batch_cycle_time, parallel_units.
- Transport: capacity_per_trip, round_trip_time, parallel_vehicles.

### 15.3 Conditional field logic

- Als type = Technical Delay, dan MUST Department worden uitgesloten van het data-object.
- Als type verandert, dan MUST het systeem irrelevante type-specifieke velden verwijderen of negeren vóór validatie en opslag.
- Delay mode MUST alleen bestaan bij type = Technical Delay.

### 15.4 Default values

- Department default (alleen type ≠ Technical Delay): laatst gebruikte department, indien beschikbaar.
- Availability default: `1.00`.
- Yield default: `100%`.
- Startup loss default: `0`.

### 15.5 Validation rules before creation

Voor create-actie MUST validatie slagen op minimaal:

- Presence-validatie op alle verplichte velden volgens sectie 15.2.
- Enum-validatie op `Type` en (indien van toepassing) `Delay mode`.
- Numerieke velden MUST > 0 zijn, behalve `startup_loss` dat MUST ≥ 0 zijn.
- Bij type ≠ Technical Delay MUST Department verwijzen naar een bestaand department-id.
- Payload MUST geen velden bevatten die niet relevant zijn voor het gekozen type.

Bij falende validatie MUST geen Process Element worden aangemaakt.

### 15.6 Engine boundary guarantees after creation

Na succesvolle creatie MUST het opgeslagen object direct bruikbaar zijn voor engineberekening zonder aanvullende transformatie.

- Department-gebonden types leveren department-koppeling voor tijdsbeschikbaarheid.
- Technical Delay levert geen department-koppeling en consumeert geen department-tijd.
- Capacity- en performance-factorvelden zijn compleet genoeg voor berekening van theoretische en effectieve throughput.

### 15.7 Redirection behavior after creation

- Na succesvolle creatie MUST het systeem exact één post-create bestemming kiezen.
- Bestemming = library view bij standaard create-actie.
- Bestemming = process builder bij create-and-add-to-flow-actie.
- Bij cancel MUST geen object worden aangemaakt en blijft de bestaande toestand ongewijzigd.

## Conclusie

Library V2 transformeert de huidige resource-structuur tot een professioneel, consistent en realistisch model dat:

- productieprocessen accuraat weerspiegelt;
- bottleneckanalyse betrouwbaarder maakt;
- modellering versnelt en standaardiseert;
- schaalbaar is naar grotere omgevingen;
- dient als solide fundament voor scenario-analyse en besluitvorming.

De Library fungeert hiermee als de Single Source of Truth binnen het MKB Simulator platform.
