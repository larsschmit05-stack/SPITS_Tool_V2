import { describe, it, expect, beforeEach } from 'vitest';
import { run } from '../engine';
import type { ProjectState } from '../../state/types';
import type { RunParams } from '../engine';

// ---------------------------------------------------------------------------
// Minimal valid ProjectState fixture
// One dept, one resource, linear flow: start → resourceStep → end
// ---------------------------------------------------------------------------

function makeBaseState(): ProjectState {
  return {
    materials: [],
    templates: [],
    resources: [
      {
        id: 'res-cnc',
        name: 'CNC Machine',
        type: 'continuous',
        departmentId: 'dept-prod',
        outputPerHour: 50,
        parallelUnits: 1,
        yieldPct: 100,
        availability: 1.0,
        dailyStartupMinutes: 0,
      },
    ],
    departments: [
      {
        id: 'dept-prod',
        name: 'Production',
        color: '#3B82F6',
        hoursByWeekday: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
        availableHoursPerWeek: 40,
      },
    ],
    steps: [],
    scenarios: [
      {
        id: 'scenario-baseline',
        name: 'Baseline',
        createdAt: Date.now(),
        demand: {
          targetGoodUnits: 100,
          horizonCalendarDays: 7,
          startDateISO: '2026-03-02',
          timezone: 'Europe/Amsterdam',
        },
      },
    ],
    activeScenarioId: 'scenario-baseline',
    nodes: [
      { id: 'node-start', nodeType: 'start', name: 'Start', position: { x: 0, y: 0 } },
      {
        id: 'node-cnc',
        nodeType: 'resourceStep',
        name: 'CNC Step',
        position: { x: 200, y: 0 },
        resourceId: 'res-cnc',
        enabled: true,
      },
      { id: 'node-end', nodeType: 'end', name: 'End', position: { x: 400, y: 0 } },
    ],
    edges: [
      { id: 'edge-1', source: 'node-start', target: 'node-cnc' },
      { id: 'edge-2', source: 'node-cnc', target: 'node-end' },
    ],
    isDirty: false,
    latestRunResult: null,
  };
}

const baseParams: RunParams = {
  projectId: 'test-project',
  scenarioId: null,
  targetGoodUnits: 100,
  horizonCalendarDays: 7,
  startDateISO: '2026-03-02',
  timezone: 'Europe/Amsterdam',
};

// ---------------------------------------------------------------------------
// RunBundle structure
// ---------------------------------------------------------------------------

describe('run() - RunBundle structure', () => {
  it('returns baseline, scenario=null, comparison=null when no scenarioId', () => {
    const state = makeBaseState();
    const result = run(state, { ...baseParams, scenarioId: null });
    expect(result.baseline).toBeDefined();
    expect(result.scenario).toBeNull();
    expect(result.comparison).toBeNull();
  });

  it('returns baseline, scenario, and comparison when scenarioId is set', () => {
    const state = makeBaseState();
    const result = run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(result.baseline).toBeDefined();
    expect(result.scenario).toBeDefined();
    expect(result.comparison).toBeDefined();
  });

  it('baseline mode is always "baseline"', () => {
    const state = makeBaseState();
    const result = run(state, { ...baseParams, scenarioId: null });
    expect(result.baseline.mode).toBe('baseline');
  });

  it('scenario mode is "scenario" when active', () => {
    const state = makeBaseState();
    const result = run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(result.scenario!.mode).toBe('scenario');
  });
});

// ---------------------------------------------------------------------------
// Baseline immutability
// ---------------------------------------------------------------------------

describe('run() - baseline immutability', () => {
  let state: ProjectState;

  beforeEach(() => {
    state = makeBaseState();
  });

  it('does not mutate state.resources array reference', () => {
    const originalResources = state.resources;
    run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(state.resources).toBe(originalResources);
  });

  it('does not mutate state.departments array reference', () => {
    const originalDepartments = state.departments;
    run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(state.departments).toBe(originalDepartments);
  });

  it('does not mutate state.resources[0] reference', () => {
    const originalResource = state.resources[0];
    run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(state.resources[0]).toBe(originalResource);
  });

  it('does not mutate state.departments[0].hoursByWeekday (nested object)', () => {
    const originalHours = state.departments[0].hoursByWeekday;
    run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(state.departments[0].hoursByWeekday).toBe(originalHours);
  });

  it('does not change resource parallelUnits after scenario with override', () => {
    // Add a resource override to the scenario
    state.scenarios[0].resourceOverrides = { 'res-cnc': { parallelUnits: 5 } };
    const originalParallelUnits = state.resources[0].parallelUnits;
    run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(state.resources[0].parallelUnits).toBe(originalParallelUnits);
    expect(state.resources[0].parallelUnits).toBe(1); // unchanged
  });
});

// ---------------------------------------------------------------------------
// Demand parameter fallback
// ---------------------------------------------------------------------------

describe('run() - demand parameter fallback', () => {
  it('scenario with demand uses scenario demand (not params)', () => {
    const state = makeBaseState();
    // Scenario has demand.targetGoodUnits = 100 (from makeBaseState)
    // Params have targetGoodUnits = 999 (different)
    const result = run(state, {
      ...baseParams,
      scenarioId: 'scenario-baseline',
      targetGoodUnits: 999,
    });
    // Scenario run should use scenario.demand.targetGoodUnits = 100
    expect(result.scenario!.inputs.targetGoodUnits).toBe(100);
  });

  it('scenario without demand falls back to params', () => {
    const state = makeBaseState();
    // Remove demand from scenario
    delete state.scenarios[0].demand;
    const result = run(state, {
      ...baseParams,
      scenarioId: 'scenario-baseline',
      targetGoodUnits: 250,
    });
    // Scenario run should use params.targetGoodUnits = 250
    expect(result.scenario!.inputs.targetGoodUnits).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// Comparison accuracy
// ---------------------------------------------------------------------------

describe('run() - comparison accuracy', () => {
  it('deltaMaxThroughputGoodUnits reflects resource override effect', () => {
    const state = makeBaseState();
    // Add resource override: double parallelUnits → higher throughput in scenario
    state.scenarios[0].resourceOverrides = { 'res-cnc': { parallelUnits: 2 } };
    const result = run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    // Scenario should have higher throughput than baseline
    expect(result.comparison!.deltaMaxThroughputGoodUnits).toBeGreaterThan(0);
  });

  it('stepDeltas includes entry for the overridden resource step', () => {
    const state = makeBaseState();
    state.scenarios[0].resourceOverrides = { 'res-cnc': { parallelUnits: 2 } };
    const result = run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    const deltas = result.comparison!.stepDeltas;
    // At least one step delta should exist
    expect(deltas.length).toBeGreaterThan(0);
  });

  it('comparison has correct feasibility flags', () => {
    const state = makeBaseState();
    const result = run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    const comp = result.comparison!;
    expect(typeof comp.baselineFeasible).toBe('boolean');
    expect(typeof comp.scenarioFeasible).toBe('boolean');
    expect(typeof comp.feasibleChanged).toBe('boolean');
  });

  it('comparison has changedBottleneck flag', () => {
    const state = makeBaseState();
    const result = run(state, { ...baseParams, scenarioId: 'scenario-baseline' });
    expect(typeof result.comparison!.changedBottleneck).toBe('boolean');
  });

  it('run returns valid baseline summary', () => {
    const state = makeBaseState();
    const result = run(state, { ...baseParams, scenarioId: null });
    expect(result.baseline.summary).toBeDefined();
    expect(typeof result.baseline.summary.maxThroughputGoodUnits).toBe('number');
    expect(typeof result.baseline.summary.feasible).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// conversionRatio: output units must be in final-material (output) units
// ---------------------------------------------------------------------------

describe('run() - conversionRatio bug regression', () => {
  it('stepMaxGoodUnitsPerHour accounts for conversionRatio (output units)', () => {
    // Resource: 8 e/h (input units), conversionRatio 5 → 40 output units/h
    // Horizon: 7 calendar days, Mon-Fri 8h = 40 effective hours
    const state: ProjectState = {
      materials: [],
      templates: [],
      resources: [
        {
          id: 'res-conv',
          name: 'Conversion Machine',
          type: 'continuous',
          departmentId: 'dept-prod',
          outputPerHour: 8,
          parallelUnits: 1,
          yieldPct: 100,
          availability: 1.0,
          dailyStartupMinutes: 0,
        },
      ],
      departments: [
        {
          id: 'dept-prod',
          name: 'Production',
          color: '#3B82F6',
          hoursByWeekday: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
          availableHoursPerWeek: 40,
        },
      ],
      steps: [],
      scenarios: [
        {
          id: 'scenario-baseline',
          name: 'Baseline',
          createdAt: Date.now(),
          demand: {
            targetGoodUnits: 100,
            horizonCalendarDays: 7,
            startDateISO: '2026-03-02',
            timezone: 'Europe/Amsterdam',
          },
        },
      ],
      activeScenarioId: 'scenario-baseline',
      nodes: [
        { id: 'node-start', nodeType: 'start', name: 'Start', position: { x: 0, y: 0 } },
        {
          id: 'node-conv',
          nodeType: 'resourceStep',
          name: 'Conv Step',
          position: { x: 200, y: 0 },
          resourceId: 'res-conv',
          enabled: true,
          conversionRatio: 5,
        },
        { id: 'node-end', nodeType: 'end', name: 'End', position: { x: 400, y: 0 } },
      ],
      edges: [
        { id: 'edge-1', source: 'node-start', target: 'node-conv' },
        { id: 'edge-2', source: 'node-conv', target: 'node-end' },
      ],
      isDirty: false,
      latestRunResult: null,
    };

    const result = run(state, {
      projectId: 'test-project',
      scenarioId: null,
      targetGoodUnits: 100,
      horizonCalendarDays: 7,
      startDateISO: '2026-03-02',
      timezone: 'Europe/Amsterdam',
    });

    const step = result.baseline.steps[0];
    // 8 e/h × conversionRatio 5 = 40 output units/h
    expect(step.stepMaxGoodUnitsPerHour).toBeCloseTo(40, 5);
    // 40 output units/h × 40 effective hours = 1600 output units
    expect(step.stepMaxGoodUnitsOverHorizon).toBeCloseTo(1600, 5);
    // utilizationAtTarget = 100 / 1600 = 6.25%
    expect(step.utilizationAtTarget).toBeCloseTo(0.0625, 5);
  });
});

// ---------------------------------------------------------------------------
// Material flow propagation (Pass 3 forward)
// ---------------------------------------------------------------------------

describe('run() - material flow propagation', () => {
  it('fixed supply 10 e/h → resource (eff 20 e/h, yield 80%, conv 10): inflow=10, throughput=10, outflow=80', () => {
    const state: ProjectState = {
      materials: [],
      templates: [],
      resources: [
        {
          id: 'res-packer',
          name: 'Packer',
          type: 'continuous',
          departmentId: 'dept-prod',
          outputPerHour: 20,
          parallelUnits: 1,
          yieldPct: 80,
          availability: 1.0,
          dailyStartupMinutes: 0,
          resourceClass: 'processing',
          processingMode: 'continuous',
        },
      ],
      departments: [
        {
          id: 'dept-prod',
          name: 'Production',
          color: '#3B82F6',
          hoursByWeekday: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
          availableHoursPerWeek: 40,
        },
      ],
      steps: [],
      scenarios: [
        {
          id: 'sc',
          name: 'Baseline',
          createdAt: Date.now(),
          demand: {
            targetGoodUnits: 100,
            horizonCalendarDays: 7,
            startDateISO: '2026-03-02',
            timezone: 'Europe/Amsterdam',
          },
        },
      ],
      activeScenarioId: 'sc',
      nodes: [
        {
          id: 'node-start',
          nodeType: 'start',
          name: 'Start',
          position: { x: 0, y: 0 },
          supplyMode: 'fixed',
          fixedSupplyAmount: 10,
          fixedSupplyPeriodUnit: 'hour',
        },
        {
          id: 'node-packer',
          nodeType: 'resourceStep',
          name: 'Packer',
          position: { x: 200, y: 0 },
          resourceId: 'res-packer',
          enabled: true,
          conversionRatio: 10,
        },
        { id: 'node-end', nodeType: 'end', name: 'End', position: { x: 400, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'node-start', target: 'node-packer' },
        { id: 'e2', source: 'node-packer', target: 'node-end' },
      ],
      isDirty: false,
      latestRunResult: null,
    };

    const result = run(state, {
      projectId: 'test-project',
      scenarioId: null,
      targetGoodUnits: 100,
      horizonCalendarDays: 7,
      startDateISO: '2026-03-02',
      timezone: 'Europe/Amsterdam',
    });

    // steps[0] = source StepResult (fixed supply), steps[1] = packer
    const sourceStep = result.baseline.steps.find(s => s.stepType === 'source');
    const packerStep = result.baseline.steps.find(s => s.stepId === 'node-packer');

    expect(sourceStep).toBeDefined();
    expect(packerStep).toBeDefined();

    // Source outflow = 10 e/h
    expect(sourceStep!.outflowUnitsPerHour).toBeCloseTo(10, 4);

    // Packer: inflow=10, throughput=min(10,20)=10, outflow=10×0.8×10=80
    expect(packerStep!.inflowUnitsPerHour).toBeCloseTo(10, 4);
    expect(packerStep!.actualThroughputUnitsPerHour).toBeCloseTo(10, 4);
    expect(packerStep!.outflowUnitsPerHour).toBeCloseTo(80, 4);
  });

  it('unlimited supply → resource (eff 20 e/h, yield 80%): inflow=null, throughput=20, outflow=16', () => {
    const state: ProjectState = {
      materials: [],
      templates: [],
      resources: [
        {
          id: 'res-roaster',
          name: 'Roaster',
          type: 'continuous',
          departmentId: 'dept-prod',
          outputPerHour: 20,
          parallelUnits: 1,
          yieldPct: 80,
          availability: 1.0,
          dailyStartupMinutes: 0,
          resourceClass: 'processing',
          processingMode: 'continuous',
        },
      ],
      departments: [
        {
          id: 'dept-prod',
          name: 'Production',
          color: '#3B82F6',
          hoursByWeekday: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
          availableHoursPerWeek: 40,
        },
      ],
      steps: [],
      scenarios: [
        {
          id: 'sc',
          name: 'Baseline',
          createdAt: Date.now(),
          demand: {
            targetGoodUnits: 100,
            horizonCalendarDays: 7,
            startDateISO: '2026-03-02',
            timezone: 'Europe/Amsterdam',
          },
        },
      ],
      activeScenarioId: 'sc',
      nodes: [
        { id: 'node-start', nodeType: 'start', name: 'Start', position: { x: 0, y: 0 } },
        {
          id: 'node-roaster',
          nodeType: 'resourceStep',
          name: 'Roaster',
          position: { x: 200, y: 0 },
          resourceId: 'res-roaster',
          enabled: true,
        },
        { id: 'node-end', nodeType: 'end', name: 'End', position: { x: 400, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'node-start', target: 'node-roaster' },
        { id: 'e2', source: 'node-roaster', target: 'node-end' },
      ],
      isDirty: false,
      latestRunResult: null,
    };

    const result = run(state, {
      projectId: 'test-project',
      scenarioId: null,
      targetGoodUnits: 100,
      horizonCalendarDays: 7,
      startDateISO: '2026-03-02',
      timezone: 'Europe/Amsterdam',
    });

    const roasterStep = result.baseline.steps.find(s => s.stepId === 'node-roaster');
    expect(roasterStep).toBeDefined();

    // Unlimited supply → inflow=null, throughput=effectiveRate=20, outflow=20×0.8=16
    expect(roasterStep!.inflowUnitsPerHour).toBeNull();
    expect(roasterStep!.actualThroughputUnitsPerHour).toBeCloseTo(20, 4);
    expect(roasterStep!.outflowUnitsPerHour).toBeCloseTo(16, 4);
  });

  it('supply 5 e/h → resource (eff 20 e/h): throughput=5 (supply is bottleneck)', () => {
    const state = makeBaseState();
    // Override start node to fixed supply 5 e/h
    state.nodes[0] = {
      ...state.nodes[0],
      supplyMode: 'fixed',
      fixedSupplyAmount: 5,
      fixedSupplyPeriodUnit: 'hour',
    };
    // CNC has outputPerHour=50, so supply is the constraint
    const result = run(state, {
      projectId: 'test-project',
      scenarioId: null,
      targetGoodUnits: 100,
      horizonCalendarDays: 7,
      startDateISO: '2026-03-02',
      timezone: 'Europe/Amsterdam',
    });

    const cncStep = result.baseline.steps.find(s => s.stepId === 'node-cnc');
    expect(cncStep).toBeDefined();
    expect(cncStep!.inflowUnitsPerHour).toBeCloseTo(5, 4);
    expect(cncStep!.actualThroughputUnitsPerHour).toBeCloseTo(5, 4);
  });
});
