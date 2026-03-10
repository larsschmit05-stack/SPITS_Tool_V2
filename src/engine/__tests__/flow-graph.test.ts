import { describe, expect, it } from 'vitest';
import { validateFlowGraph } from '../validators';
import { linearizeFlow } from '../flow';
import type { EngineFlowStep } from '../types';

describe('flow graph (multi in/out)', () => {
  it('allows merge and branch in DAG', () => {
    const steps: EngineFlowStep[] = [
      { type: 'start', id: 's1', label: 'S1', supplyMode: 'unlimited' },
      { type: 'start', id: 's2', label: 'S2', supplyMode: 'unlimited' },
      { type: 'resourceStep', id: 'r1', label: 'R1', resourceId: 'res-1', enabled: true },
      { type: 'resourceStep', id: 'r2', label: 'R2', resourceId: 'res-2', enabled: true },
      { type: 'end', id: 'e1' },
    ];
    const edges = [
      { id: 'e1', source: 's1', target: 'r1' },
      { id: 'e2', source: 's2', target: 'r1' }, // merge
      { id: 'e3', source: 'r1', target: 'r2' },
      { id: 'e4', source: 'r1', target: 'e1' }, // branch
      { id: 'e5', source: 'r2', target: 'e1' },
    ];

    const issues = validateFlowGraph(steps, edges);
    expect(issues.find(i => i.code === 'ERR_FLOW_MERGE')).toBeUndefined();
    expect(issues.find(i => i.code === 'ERR_FLOW_BRANCH')).toBeUndefined();
    expect(issues.find(i => i.code === 'ERR_FLOW_CYCLE')).toBeUndefined();
  });

  it('linearizeFlow returns topological order for DAG', () => {
    const steps: EngineFlowStep[] = [
      { type: 'start', id: 's1', label: 'S1', supplyMode: 'unlimited' },
      { type: 'start', id: 's2', label: 'S2', supplyMode: 'unlimited' },
      { type: 'resourceStep', id: 'r1', label: 'R1', resourceId: 'res-1', enabled: true },
      { type: 'resourceStep', id: 'r2', label: 'R2', resourceId: 'res-2', enabled: true },
      { type: 'end', id: 'e1' },
    ];
    const edges = [
      { id: 'e1', source: 's1', target: 'r1' },
      { id: 'e2', source: 's2', target: 'r1' },
      { id: 'e3', source: 'r1', target: 'r2' },
      { id: 'e4', source: 'r2', target: 'e1' },
    ];

    const ordered = linearizeFlow(steps, edges);
    const idx = (id: string) => ordered.findIndex(s => s.id === id);

    expect(ordered).toHaveLength(5);
    expect(idx('r1')).toBeGreaterThan(idx('s1'));
    expect(idx('r1')).toBeGreaterThan(idx('s2'));
    expect(idx('r2')).toBeGreaterThan(idx('r1'));
    expect(idx('e1')).toBeGreaterThan(idx('r2'));
  });
});
