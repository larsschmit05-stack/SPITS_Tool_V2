/**
 * Flow linearisation and TimeStep department inheritance.
 *
 * Responsibilities:
 *   1. linearizeFlow  — topological sort of nodes+edges → ordered array
 *   2. assignInheritedDepartments — TimeStep inherits dept from nearest upstream ResourceStep
 *
 * Precondition: validateFlowGraph() must pass before calling linearizeFlow().
 * linearizeFlow never throws; it returns [] for an invalid graph.
 */

import type { EngineFlowStep, EngineResource, FlowEdge } from './types';

// ---------------------------------------------------------------------------
// 1. Flow linearisation
// ---------------------------------------------------------------------------

/**
 * Linearises a set of flow steps via their edges into an ordered sequence
 * starting at the 'start' node and ending at the 'end' node.
 *
 * Algorithm: simple iterative walk following unique outgoing edges from start.
 * This is O(n) for a linear (non-branching) graph.
 *
 * Precondition: graph is valid (validateFlowGraph passes).
 * If the graph is invalid or the walk terminates early, returns what was collected.
 */
export function linearizeFlow(
  steps: EngineFlowStep[],
  edges: FlowEdge[]
): EngineFlowStep[] {
  const nodeMap = new Map<string, EngineFlowStep>(steps.map(s => [s.id, s]));

  // Build outgoing adjacency: nodeId → target nodeId (linear: at most 1)
  const next = new Map<string, string>();
  for (const e of edges) {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      next.set(e.source, e.target);
    }
  }

  const startNode = steps.find(s => s.type === 'start');
  if (!startNode) return [];

  const ordered: EngineFlowStep[] = [];
  const visited = new Set<string>();
  let current: string | undefined = startNode.id;

  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    const node = nodeMap.get(current);
    if (!node) break;
    ordered.push(node);
    current = next.get(current);
  }

  return ordered;
}

// ---------------------------------------------------------------------------
// 2. TimeStep department inheritance
// ---------------------------------------------------------------------------

export type StepWithDepartment = EngineFlowStep & {
  /** The departmentId this step should use for scheduling.
   *  ResourceStep: from its linked resource.
   *  TimeStep: from the nearest upstream ResourceStep.
   *  start/end: null.
   */
  inheritedDepartmentId: string | null;
  inheritedDepartmentName: string | null;
};

/**
 * Assigns inheritedDepartmentId/Name to every step in the ordered sequence.
 *
 * Rules:
 * - ResourceStep → departmentId from resource
 * - TimeStep → inherit from nearest upstream ResourceStep (carry-forward)
 * - start / end → null
 *
 * If a TimeStep has no upstream ResourceStep, inheritedDepartmentId is null.
 * The engine's step-content validator (validateStepContent) will have already
 * flagged this as ERR_TIMESTEP_NO_UPSTREAM_RESOURCE.
 */
export function assignInheritedDepartments(
  orderedSteps: EngineFlowStep[],
  resources: EngineResource[],
  departments: Array<{ id: string; name: string }>
): StepWithDepartment[] {
  const resourceMap = new Map<string, EngineResource>(resources.map(r => [r.id, r]));
  const deptNameMap = new Map<string, string>(departments.map(d => [d.id, d.name]));

  let lastResourceDeptId: string | null = null;
  let lastResourceDeptName: string | null = null;

  return orderedSteps.map(step => {
    if (step.type === 'start' || step.type === 'end') {
      return { ...step, inheritedDepartmentId: null, inheritedDepartmentName: null };
    }

    if (step.type === 'resourceStep') {
      const resource = resourceMap.get(step.resourceId);
      const deptId = resource?.departmentId ?? null;
      const deptName = deptId ? (deptNameMap.get(deptId) ?? null) : null;
      lastResourceDeptId = deptId;
      lastResourceDeptName = deptName;
      return {
        ...step,
        inheritedDepartmentId: deptId,
        inheritedDepartmentName: deptName,
      };
    }

    // timeStep: inherit from last seen ResourceStep upstream
    return {
      ...step,
      inheritedDepartmentId: lastResourceDeptId,
      inheritedDepartmentName: lastResourceDeptName,
    };
  });
}
