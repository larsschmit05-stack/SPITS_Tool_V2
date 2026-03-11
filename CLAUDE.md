# SPITS Capaciteitstool V2 — Project Instructions

## Domain
Capacity planning simulator for manufacturing/logistics.
Users model a production flow (process nodes + resources), set a demand target, and run simulations to find bottlenecks and assess feasibility under different scenarios.
Key Dutch terms: **Afdeling** = department, **Scenario** = what-if variant, **Bottleneck** = slowest step, **Good units** = final output after yield.

## Tech Stack
- React 19 + TypeScript 5.8, built with Vite 6
- State: custom React Context + `useReducer` (no Redux/Zustand)
- Tests: Vitest 4 (`npm test`)
- Charts: Recharts | Icons: lucide-react | PDF export: html2canvas + jspdf
- Persistence: localStorage (excludes `latestRunResult`, `isDirty`)

## Dev Commands
```bash
npm run dev      # Vite dev server (default :3000, falls back to :3001)
npm run build    # Production build → dist/
npm test         # Run all tests (97 tests, ~300ms)
npm run lint     # TypeScript check only
```

## Key Files
| File | Purpose |
|------|---------|
| `App.tsx` | Tab router connecting all modules |
| `Dashboard.tsx` | Simulation runner + KPI cards |
| `ProcessBuilder.tsx` | Node/edge flow graph editor |
| `Resources.tsx` | Resource library CRUD |
| `Departments.tsx` | Department shift schedules |
| `Materials.tsx` | Material definitions |
| `Scenarios.tsx` | Scenario comparison UI |
| `src/state/store.tsx` | Context provider, reducer, 50+ actions |
| `src/state/types.ts` | Domain types (Resource, Scenario, FlowNode, …) |
| `src/engine/engine.ts` | Public `run(state, params) → RunBundle` |
| `src/engine/calculator.ts` | Per-step capacity formulas |
| `src/engine/validators.ts` | 40+ validation rules (errors + warnings) |
| `src/engine/flow.ts` | DAG topological sort |
| `src/engine/scheduler.ts` | Calendar/timezone working-hours math |
| `src/components/NumericInput.tsx` | Free-form numeric input (backspace-safe) |

## Engine Pipeline (pure functions, no side effects)
1. `buildEngineInput` — apply scenario overlays
2. `validateFlowGraph` — topology (≥1 start, 1 end, linear)
3. `linearizeFlow` — topological sort
4. `validateStepContent` / `validateResourceParams` — field ranges
5. `computeScheduledHours` — calendar math
6. `computeStepResults` — capacity per step (pass 1–3: yield, scheduling, calc)
7. `selectBottleneck` — min throughput step
8. `buildComparison` — baseline vs scenario delta

## Naming Conventions
- UI labels: **English** | Code identifiers: **English**
- Time fields: `...Minutes`, `...Hours`, `...Days`
- Rate fields: `...PerHour`, `...PerUnit`
- Percentages: `...Pct` (0–100 scale) | Ratios: `...Ratio` / `availability` (0–1)
- Scenario overrides: `...Override` suffix or inside `resourceOverrides`
- Effective (post-resolution): `effective...` prefix

## Resource Classes
- **Processing** — `outputPerHour` or `cycleTimeMinutes`, supports batch/manual modes
- **Buffer** — slot capacity × (1 - safetyMargin) × (60 / dwellTime)
- **Transport** — discrete: `unitsPerTrip × (60 / tripDuration)` | continuous: `outputPerHour`
- **Delay** — simple time constraint, no department

## Flow Node Types
- `start` — source node: defines input material, optional fixed supply limit
- `end` — sink node (no config)
- `resourceStep` — links to a Resource
- `timeStep` — pure time delay

## Tests Location
- `src/engine/__tests__/scenario.test.ts` — engine runs, bottleneck, conversionRatio
- `src/engine/__tests__/create-flow.test.ts` — flow linearization
- `src/state/__tests__/store.test.ts` — reducer actions
- `src/scenarios/__tests__/validation.test.ts` — scenario validation

## Save Changes Workflow
When the user says "save changes":
1. `git add .` in the project directory
2. `git commit -m "..."` with a clean, descriptive message
3. `git push origin main`

Use the token-embedded remote URL for push authentication (see memory for credentials).
