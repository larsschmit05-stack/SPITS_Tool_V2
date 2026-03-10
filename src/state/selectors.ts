/**
 * Memoized selectors for derived state.
 *
 * These are pure functions with reference-equality caching.
 * They do NOT belong in the reducer — computing them on every action
 * would be wasteful on large projects.
 *
 * Usage pattern (in React components):
 *   const { state } = useAppState();
 *   const usageMap = selectResourceUsageMap(state.nodes, state.edges, state.scenarios, state.latestRunResult);
 *
 * The selector re-computes only when its input references change.
 * All other state changes (e.g. UPDATE_DEPARTMENT) leave the cache valid.
 */

import type { FlowNode, FlowEdge, Scenario } from './types';
import type { RunBundle } from '../engine/types';

// ---------------------------------------------------------------------------
// ResourceUsage
// ---------------------------------------------------------------------------

export interface ResourceFlowUsage {
  /** FlowNode.id of the resourceStep that uses this resource */
  nodeId: string;
  /** Human-readable node name */
  nodeName: string;
  /** Zero-based index of this step in the linearised process flow */
  stepIndex: number;
}

export interface ResourceBottleneckRecord {
  scenarioId: string;
  scenarioName: string;
  /** utilizationAtTarget at the time this resource was identified as bottleneck */
  utilizationAtTarget: number;
}

export interface ResourceUsage {
  resourceId: string;
  /** All resourceStep nodes that reference this resource */
  usedInFlows: ResourceFlowUsage[];
  /** Total count of nodes using this resource */
  usageCount: number;
  /**
   * Scenarios where this resource was the bottleneck in the latest run.
   * Populated from latestRunResult when available.
   */
  wasBottleneckIn: ResourceBottleneckRecord[];
}

// ---------------------------------------------------------------------------
// Memo cache (module-level, single cache slot)
// ---------------------------------------------------------------------------

let _cachedNodes: FlowNode[] | null = null;
let _cachedEdges: FlowEdge[] | null = null;
let _cachedRunResult: RunBundle | null | undefined = undefined;
let _cachedResult: Map<string, ResourceUsage> | null = null;

// ---------------------------------------------------------------------------
// Internal computation
// ---------------------------------------------------------------------------

function buildUsageMap(
  nodes: FlowNode[],
  edges: FlowEdge[],
  scenarios: Scenario[],
  latestRunResult: RunBundle | null | undefined
): Map<string, ResourceUsage> {
  const map = new Map<string, ResourceUsage>();

  // Collect all resourceStep nodes in flow order.
  // We compute a rough step index by doing a simple linear traversal of edges.
  const resourceStepNodes = nodes.filter(
    n => n.nodeType === 'resourceStep' && n.resourceId
  );

  // Build step index map: nodeId → approximate linear order
  // (We do a BFS from start nodes to assign ordering)
  const stepIndexMap = new Map<string, number>();
  const startNodes = nodes.filter(n => n.nodeType === 'start');
  if (startNodes.length > 0) {
    const adjacency = new Map<string, string>();
    for (const e of edges) {
      adjacency.set(e.source, e.target);
    }
    let current: string | undefined = startNodes[0].id;
    let idx = 0;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      stepIndexMap.set(current, idx++);
      current = adjacency.get(current);
    }
  }

  // Build usage entries
  for (const node of resourceStepNodes) {
    const resourceId = node.resourceId!;
    const existing = map.get(resourceId) ?? {
      resourceId,
      usedInFlows: [],
      usageCount: 0,
      wasBottleneckIn: [],
    };
    existing.usedInFlows.push({
      nodeId: node.id,
      nodeName: node.name,
      stepIndex: stepIndexMap.get(node.id) ?? -1,
    });
    existing.usageCount++;
    map.set(resourceId, existing);
  }

  // Populate wasBottleneckIn from latestRunResult
  if (latestRunResult) {
    const runsToCheck: Array<{ run: typeof latestRunResult.baseline; scenarioId: string }> = [
      { run: latestRunResult.baseline, scenarioId: 'baseline' },
    ];
    if (latestRunResult.scenario) {
      runsToCheck.push({
        run: latestRunResult.scenario,
        scenarioId: latestRunResult.scenario.scenarioId ?? 'scenario',
      });
    }

    for (const { run, scenarioId } of runsToCheck) {
      const bottleneckResourceId = run.bottleneck?.resourceId;
      const utilizationAtTarget = run.bottleneck?.utilizationAtTarget;
      if (!bottleneckResourceId || utilizationAtTarget === null || utilizationAtTarget === undefined) continue;

      const entry = map.get(bottleneckResourceId);
      if (!entry) continue;

      const scenario = scenarios.find(s => s.id === scenarioId);
      const scenarioName = scenarioId === 'baseline' ? 'Baseline' : (scenario?.name ?? scenarioId);

      // Avoid duplicates
      const alreadyRecorded = entry.wasBottleneckIn.some(b => b.scenarioId === scenarioId);
      if (!alreadyRecorded) {
        entry.wasBottleneckIn.push({ scenarioId, scenarioName, utilizationAtTarget });
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Public memoized selector
// ---------------------------------------------------------------------------

/**
 * Returns a Map<resourceId, ResourceUsage> derived from the current flow graph
 * and latest run result.
 *
 * Memoization: recomputes only when nodes[], edges[], or latestRunResult changes
 * (reference equality). scenarios[] is passed through but does not trigger
 * recomputation on its own — only used for scenario name lookup.
 *
 * Performance: O(nodes + edges) per recomputation.
 */
export function selectResourceUsageMap(
  nodes: FlowNode[],
  edges: FlowEdge[],
  scenarios: Scenario[],
  latestRunResult: RunBundle | null | undefined
): Map<string, ResourceUsage> {
  // Cache hit: all primary inputs are reference-equal
  if (
    nodes === _cachedNodes &&
    edges === _cachedEdges &&
    latestRunResult === _cachedRunResult &&
    _cachedResult !== null
  ) {
    return _cachedResult;
  }

  // Cache miss: recompute
  _cachedNodes = nodes;
  _cachedEdges = edges;
  _cachedRunResult = latestRunResult;
  _cachedResult = buildUsageMap(nodes, edges, scenarios, latestRunResult);
  return _cachedResult;
}

/**
 * Convenience: get usage for a single resource without materialising the full map.
 * Returns null if the resource is not used in any flow.
 */
export function selectResourceUsage(
  resourceId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  scenarios: Scenario[],
  latestRunResult: RunBundle | null | undefined
): ResourceUsage | null {
  return selectResourceUsageMap(nodes, edges, scenarios, latestRunResult).get(resourceId) ?? null;
}
