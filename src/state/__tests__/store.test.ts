import { describe, it, expect } from 'vitest';
import {
  createScenario,
  patchScenario,
  duplicateScenarioFn,
  enforceScenarioConstraints,
  appReducer,
} from '../store';
import type { ProjectState, Scenario } from '../types';

// ---------------------------------------------------------------------------
// Minimal test state fixture
// ---------------------------------------------------------------------------

const baseScenario: Scenario = {
  id: 'test-scenario-01',
  name: 'Test Scenario',
  createdAt: 1000000,
  tags: [],
  demand: {
    targetGoodUnits: 500,
    horizonCalendarDays: 14,
    startDateISO: '2026-03-01',
    timezone: 'Europe/Amsterdam',
  },
};

const baseState: ProjectState = {
  materials: [],
  templates: [],
  resources: [
    {
      id: 'res-01',
      name: 'Machine A',
      type: 'continuous',
      departmentId: 'dept-01',
      outputPerHour: 50,
      parallelUnits: 1,
      yieldPct: 95,
      availability: 0.9,
      dailyStartupMinutes: 15,
    },
  ],
  departments: [
    {
      id: 'dept-01',
      name: 'Productie',
      color: '#3B82F6',
      hoursByWeekday: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
      availableHoursPerWeek: 40,
    },
  ],
  steps: [],
  scenarios: [{ ...baseScenario }],
  activeScenarioId: 'test-scenario-01',
  nodes: [],
  edges: [],
  isDirty: false,
  latestRunResult: null,
};

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

describe('createScenario', () => {
  it('creates scenario with correct name', () => {
    const s = createScenario('My Scenario');
    expect(s.name).toBe('My Scenario');
  });

  it('assigns a non-empty id', () => {
    const s = createScenario('Test');
    expect(s.id).toBeTruthy();
    expect(typeof s.id).toBe('string');
  });

  it('assigns a numeric createdAt timestamp', () => {
    const before = Date.now();
    const s = createScenario('Test');
    expect(s.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('initializes tags as empty array', () => {
    const s = createScenario('Test');
    expect(s.tags).toEqual([]);
  });

  it('creates unique IDs for each call', () => {
    const s1 = createScenario('A');
    const s2 = createScenario('B');
    expect(s1.id).not.toBe(s2.id);
  });
});

describe('patchScenario', () => {
  it('updates name while preserving id and createdAt', () => {
    const patched = patchScenario(baseScenario, { name: 'New Name' });
    expect(patched.name).toBe('New Name');
    expect(patched.id).toBe(baseScenario.id);
    expect(patched.createdAt).toBe(baseScenario.createdAt);
  });

  it('updates description', () => {
    const patched = patchScenario(baseScenario, { description: 'Test description' });
    expect(patched.description).toBe('Test description');
  });

  it('updates demand', () => {
    const newDemand = {
      targetGoodUnits: 1000,
      horizonCalendarDays: 7,
      startDateISO: '2026-04-01',
      timezone: 'UTC',
    };
    const patched = patchScenario(baseScenario, { demand: newDemand });
    expect(patched.demand).toEqual(newDemand);
  });

  it('does not mutate original scenario', () => {
    const originalName = baseScenario.name;
    patchScenario(baseScenario, { name: 'Changed' });
    expect(baseScenario.name).toBe(originalName);
  });
});

describe('duplicateScenarioFn', () => {
  it('creates a new id different from the original', () => {
    const dup = duplicateScenarioFn(baseScenario);
    expect(dup.id).not.toBe(baseScenario.id);
  });

  it('appends (Copy) to the name', () => {
    const dup = duplicateScenarioFn(baseScenario);
    expect(dup.name).toContain('(Copy)');
  });

  it('has a createdAt greater than or equal to the original', () => {
    // We can't guarantee strictly greater due to timing, but should be a fresh timestamp
    const dup = duplicateScenarioFn(baseScenario);
    expect(typeof dup.createdAt).toBe('number');
    expect(dup.createdAt).toBeGreaterThanOrEqual(baseScenario.createdAt);
  });

  it('copies demand from original', () => {
    const dup = duplicateScenarioFn(baseScenario);
    expect(dup.demand).toEqual(baseScenario.demand);
  });

  it('does not mutate original', () => {
    const originalId = baseScenario.id;
    duplicateScenarioFn(baseScenario);
    expect(baseScenario.id).toBe(originalId);
  });
});

describe('enforceScenarioConstraints', () => {
  const s1: Scenario = { ...baseScenario, id: 'a' };
  const s2: Scenario = { ...baseScenario, id: 'b' };
  const s3: Scenario = { ...baseScenario, id: 'c' };

  it('returns no violations for 1 scenario', () => {
    expect(enforceScenarioConstraints([s1])).toEqual([]);
  });

  it('returns no violations for 2 scenarios', () => {
    expect(enforceScenarioConstraints([s1, s2])).toEqual([]);
  });

  it('returns MAX_SCENARIOS_EXCEEDED for 3 scenarios', () => {
    const violations = enforceScenarioConstraints([s1, s2, s3]);
    expect(violations.some(v => v.type === 'MAX_SCENARIOS_EXCEEDED')).toBe(true);
  });

  it('returns DUPLICATE_SCENARIO_ID for duplicate ids', () => {
    const violations = enforceScenarioConstraints([s1, s1]);
    expect(violations.some(v => v.type === 'DUPLICATE_SCENARIO_ID')).toBe(true);
  });

  it('returns no violations for empty array', () => {
    expect(enforceScenarioConstraints([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Reducer: Scenario actions
// ---------------------------------------------------------------------------

describe('appReducer - ADD_SCENARIO', () => {
  it('adds a scenario when below max', () => {
    const next = appReducer(baseState, { type: 'ADD_SCENARIO', payload: { name: 'Scenario 2' } });
    expect(next.scenarios).toHaveLength(2);
    expect(next.scenarios[1].name).toBe('Scenario 2');
  });

  it('rejects when already at 2 scenarios (max 2)', () => {
    const stateWith2 = appReducer(baseState, { type: 'ADD_SCENARIO', payload: { name: 'S2' } });
    const stateWith3 = appReducer(stateWith2, { type: 'ADD_SCENARIO', payload: { name: 'S3' } });
    expect(stateWith3.scenarios).toHaveLength(2);
  });
});

describe('appReducer - DELETE_SCENARIO', () => {
  it('removes the specified scenario', () => {
    const stateWith2 = appReducer(baseState, { type: 'ADD_SCENARIO', payload: { name: 'S2' } });
    const s2Id = stateWith2.scenarios[1].id;
    const next = appReducer(stateWith2, { type: 'DELETE_SCENARIO', payload: s2Id });
    expect(next.scenarios).toHaveLength(1);
    expect(next.scenarios[0].id).toBe('test-scenario-01');
  });

  it('switches activeScenarioId when active scenario is deleted', () => {
    const stateWith2 = appReducer(baseState, { type: 'ADD_SCENARIO', payload: { name: 'S2' } });
    const s2Id = stateWith2.scenarios[1].id;
    // Activate S2 first
    const activeS2 = appReducer(stateWith2, { type: 'SET_ACTIVE_SCENARIO', payload: s2Id });
    expect(activeS2.activeScenarioId).toBe(s2Id);
    // Delete S2
    const next = appReducer(activeS2, { type: 'DELETE_SCENARIO', payload: s2Id });
    expect(next.activeScenarioId).not.toBe(s2Id);
    expect(next.scenarios.some(s => s.id === next.activeScenarioId)).toBe(true);
  });

  it('does NOT change activeScenarioId when inactive scenario is deleted', () => {
    const stateWith2 = appReducer(baseState, { type: 'ADD_SCENARIO', payload: { name: 'S2' } });
    const s2Id = stateWith2.scenarios[1].id;
    // Active is still test-scenario-01
    const next = appReducer(stateWith2, { type: 'DELETE_SCENARIO', payload: s2Id });
    expect(next.activeScenarioId).toBe('test-scenario-01');
  });

  it('does not delete the last scenario', () => {
    const next = appReducer(baseState, { type: 'DELETE_SCENARIO', payload: 'test-scenario-01' });
    expect(next.scenarios).toHaveLength(1);
  });
});

describe('appReducer - UPDATE_SCENARIO', () => {
  it('updates name via patch', () => {
    const next = appReducer(baseState, {
      type: 'UPDATE_SCENARIO',
      payload: { id: 'test-scenario-01', patch: { name: 'Updated Name' } },
    });
    expect(next.scenarios[0].name).toBe('Updated Name');
  });

  it('preserves id and createdAt after update', () => {
    const next = appReducer(baseState, {
      type: 'UPDATE_SCENARIO',
      payload: { id: 'test-scenario-01', patch: { name: 'X', description: 'Y' } },
    });
    expect(next.scenarios[0].id).toBe('test-scenario-01');
    expect(next.scenarios[0].createdAt).toBe(1000000);
  });

  it('updates demand parameters', () => {
    const newDemand = { targetGoodUnits: 999, horizonCalendarDays: 7, startDateISO: '2026-04-01', timezone: 'UTC' };
    const next = appReducer(baseState, {
      type: 'UPDATE_SCENARIO',
      payload: { id: 'test-scenario-01', patch: { demand: newDemand } },
    });
    expect(next.scenarios[0].demand).toEqual(newDemand);
  });
});

describe('appReducer - DUPLICATE_SCENARIO', () => {
  it('duplicates a scenario with new id and (Copy) suffix', () => {
    const next = appReducer(baseState, { type: 'DUPLICATE_SCENARIO', payload: 'test-scenario-01' });
    expect(next.scenarios).toHaveLength(2);
    const copy = next.scenarios[1];
    expect(copy.id).not.toBe('test-scenario-01');
    expect(copy.name).toContain('(Copy)');
  });

  it('does not duplicate when already at 2 scenarios', () => {
    const stateWith2 = appReducer(baseState, { type: 'ADD_SCENARIO', payload: { name: 'S2' } });
    const stateWith3 = appReducer(stateWith2, { type: 'DUPLICATE_SCENARIO', payload: 'test-scenario-01' });
    expect(stateWith3.scenarios).toHaveLength(2);
  });
});

describe('appReducer - SET_ACTIVE_SCENARIO', () => {
  it('sets active scenario when id exists', () => {
    const stateWith2 = appReducer(baseState, { type: 'ADD_SCENARIO', payload: { name: 'S2' } });
    const s2Id = stateWith2.scenarios[1].id;
    const next = appReducer(stateWith2, { type: 'SET_ACTIVE_SCENARIO', payload: s2Id });
    expect(next.activeScenarioId).toBe(s2Id);
  });

  it('does not change state when id does not exist', () => {
    const next = appReducer(baseState, { type: 'SET_ACTIVE_SCENARIO', payload: 'nonexistent' });
    expect(next.activeScenarioId).toBe('test-scenario-01');
  });
});

describe('appReducer - SET_RESOURCE_OVERRIDE', () => {
  it('sets resource override in the scenario', () => {
    const next = appReducer(baseState, {
      type: 'SET_RESOURCE_OVERRIDE',
      payload: {
        scenarioId: 'test-scenario-01',
        resourceId: 'res-01',
        override: { parallelUnits: 3 },
      },
    });
    expect(next.scenarios[0].resourceOverrides?.['res-01']?.parallelUnits).toBe(3);
  });

  it('merges resource overrides incrementally', () => {
    const step1 = appReducer(baseState, {
      type: 'SET_RESOURCE_OVERRIDE',
      payload: { scenarioId: 'test-scenario-01', resourceId: 'res-01', override: { parallelUnits: 2 } },
    });
    const step2 = appReducer(step1, {
      type: 'SET_RESOURCE_OVERRIDE',
      payload: { scenarioId: 'test-scenario-01', resourceId: 'res-01', override: { yieldPct: 90 } },
    });
    expect(step2.scenarios[0].resourceOverrides?.['res-01']?.parallelUnits).toBe(2);
    expect(step2.scenarios[0].resourceOverrides?.['res-01']?.yieldPct).toBe(90);
  });
});

describe('appReducer - CLEAR_RESOURCE_OVERRIDE', () => {
  it('removes resource override', () => {
    const withOverride = appReducer(baseState, {
      type: 'SET_RESOURCE_OVERRIDE',
      payload: { scenarioId: 'test-scenario-01', resourceId: 'res-01', override: { parallelUnits: 2 } },
    });
    const cleared = appReducer(withOverride, {
      type: 'CLEAR_RESOURCE_OVERRIDE',
      payload: { scenarioId: 'test-scenario-01', resourceId: 'res-01' },
    });
    expect(cleared.scenarios[0].resourceOverrides?.['res-01']).toBeUndefined();
  });
});

describe('appReducer - SET_DEPARTMENT_SCHEDULE_OVERRIDE', () => {
  it('sets department schedule override', () => {
    const next = appReducer(baseState, {
      type: 'SET_DEPARTMENT_SCHEDULE_OVERRIDE',
      payload: {
        scenarioId: 'test-scenario-01',
        departmentId: 'dept-01',
        override: { mon: 10, tue: 10 },
      },
    });
    expect(next.scenarios[0].departmentScheduleOverrides?.['dept-01']?.mon).toBe(10);
    expect(next.scenarios[0].departmentScheduleOverrides?.['dept-01']?.tue).toBe(10);
  });

  it('rejects hours > 24', () => {
    const next = appReducer(baseState, {
      type: 'SET_DEPARTMENT_SCHEDULE_OVERRIDE',
      payload: {
        scenarioId: 'test-scenario-01',
        departmentId: 'dept-01',
        override: { mon: 25 },
      },
    });
    // Should reject invalid hours and return same state
    expect(next.scenarios[0].departmentScheduleOverrides).toBeUndefined();
  });

  it('rejects negative hours', () => {
    const next = appReducer(baseState, {
      type: 'SET_DEPARTMENT_SCHEDULE_OVERRIDE',
      payload: {
        scenarioId: 'test-scenario-01',
        departmentId: 'dept-01',
        override: { fri: -1 },
      },
    });
    expect(next.scenarios[0].departmentScheduleOverrides).toBeUndefined();
  });
});

describe('appReducer - CLEAR_DEPARTMENT_SCHEDULE_OVERRIDE', () => {
  it('removes department schedule override', () => {
    const withOverride = appReducer(baseState, {
      type: 'SET_DEPARTMENT_SCHEDULE_OVERRIDE',
      payload: { scenarioId: 'test-scenario-01', departmentId: 'dept-01', override: { mon: 10 } },
    });
    const cleared = appReducer(withOverride, {
      type: 'CLEAR_DEPARTMENT_SCHEDULE_OVERRIDE',
      payload: { scenarioId: 'test-scenario-01', departmentId: 'dept-01' },
    });
    expect(cleared.scenarios[0].departmentScheduleOverrides?.['dept-01']).toBeUndefined();
  });
});
