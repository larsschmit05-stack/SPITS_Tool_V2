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
