
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppState } from './src/state/store';
import type { FlowNode, FlowEdge, Material } from './src/state/types';
import type { StepResult } from './src/engine/types';
import { run } from './src/engine/engine';
import { NumericInput } from './src/components/NumericInput';
import {
  Plus, MousePointer2, Move, Trash2, Settings2, PlayCircle, StopCircle,
  Clock, Copy, X, ExternalLink, AlertTriangle, CheckCircle2, Zap, Package, ChevronDown, ChevronRight
} from 'lucide-react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 96;

// ---------------------------------------------------------------------------
// Material flow resolution
// Walks the graph from the start node and resolves the effective input/output
// material at each node. Steps without an explicit material inherit from upstream.
// ---------------------------------------------------------------------------

function resolveFlowMaterials(
  nodes: FlowNode[],
  edges: FlowEdge[],
): Map<string, { inputIds: string[]; outputId?: string }> {
  const result = new Map<string, { inputIds: string[]; outputId?: string }>();
  const successors = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!successors.has(e.source)) successors.set(e.source, []);
    successors.get(e.source)!.push(e.target);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const startNodes = nodes.filter(n => n.nodeType === 'start');
  if (startNodes.length === 0) return result;

  // Support multiple sources. Downstream inheritance only occurs when there is
  // exactly one unique upstream material; with multiple distinct materials the
  // input is ambiguous and must be selected explicitly on the step.
  const queue: string[] = [];
  for (const s of startNodes) {
    result.set(s.id, { inputIds: [], outputId: s.outputMaterialId });
    queue.push(s.id);
  }
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const childId of (successors.get(parentId) ?? [])) {
      const child = nodeById.get(childId);
      if (!child) continue;

      const upstreamOutputs = Array.from(new Set(
        (incoming.get(childId) ?? [])
          .map(sourceId => result.get(sourceId)?.outputId)
          .filter((id): id is string => Boolean(id))
      ));
      const resolvedOutputId = child.outputMaterialId ?? (upstreamOutputs.length === 1 ? upstreamOutputs[0] : undefined);
      const prev = result.get(childId);
      const changed =
        !prev ||
        prev.inputIds.length !== upstreamOutputs.length ||
        prev.inputIds.some((id, i) => id !== upstreamOutputs[i]) ||
        prev.outputId !== resolvedOutputId;

      if (changed) {
        result.set(childId, { inputIds: upstreamOutputs, outputId: resolvedOutputId });
        queue.push(childId);
      }
    }
  }
  return result;
}

interface NodeFlowKpi {
  inflowRateUnitsPerHour: number | null;
  outflowRateUnitsPerHour: number | null;
  utilizationPct: number | null;
}

function computeNodeFlowKpis(
  nodes: FlowNode[],
  edges: FlowEdge[],
  stepResultByNodeId: Map<string, StepResult>,
): Map<string, NodeFlowKpi> {
  const kpis = new Map<string, NodeFlowKpi>();
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
  }

  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n.id, incoming.get(n.id)?.length ?? 0);

  const queue: string[] = nodes.filter(n => (indegree.get(n.id) ?? 0) === 0).map(n => n.id);
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  while (queue.length) {
    const nodeId = queue.shift()!;
    const node = nodeById.get(nodeId);
    if (!node) continue;

    const upstreamIds = incoming.get(nodeId) ?? [];
    const upstreamOutflows = upstreamIds
      .map(id => kpis.get(id)?.outflowRateUnitsPerHour)
      .filter((v): v is number | null => v !== undefined);

    const allUpstreamKnown = upstreamIds.length > 0 && upstreamOutflows.length === upstreamIds.length;
    const anyUpstreamUnknown = upstreamOutflows.some(v => v === null);
    const inflowRateUnitsPerHour =
      upstreamIds.length === 0
        ? null
        : !allUpstreamKnown || anyUpstreamUnknown
        ? null
        : upstreamOutflows.reduce((acc, v) => acc + (v ?? 0), 0);

    let outflowRateUnitsPerHour: number | null = inflowRateUnitsPerHour;
    let utilizationPct: number | null = null;

    if (node.nodeType === 'start') {
      if (node.supplyMode === 'fixed' && node.fixedSupplyAmount != null && node.fixedSupplyAmount > 0) {
        const periodHours: Record<string, number> = { hour: 1, day: 24, week: 168 };
        const ph = periodHours[node.fixedSupplyPeriodUnit ?? 'week'] ?? 168;
        outflowRateUnitsPerHour = node.fixedSupplyAmount / ph;
      } else {
        outflowRateUnitsPerHour = null;
      }
    }

    if (node.nodeType === 'resourceStep' || node.nodeType === 'timeStep') {
      const stepResult = stepResultByNodeId.get(node.id);
      const effectiveRate =
        stepResult && stepResult.effectiveRateUnitsPerHour > 0 ? stepResult.effectiveRateUnitsPerHour : null;

      if (inflowRateUnitsPerHour !== null && effectiveRate !== null) {
        // Builder utilization = actual inflow / effective step capacity.
        utilizationPct = (inflowRateUnitsPerHour / effectiveRate) * 100;
        const conversionRatio = stepResult?.conversionRatio && stepResult.conversionRatio > 0
          ? stepResult.conversionRatio
          : 1;
        const yieldFactor = stepResult?.yieldPct !== undefined ? stepResult.yieldPct / 100 : 1;
        outflowRateUnitsPerHour = Math.min(inflowRateUnitsPerHour, effectiveRate) * conversionRatio * yieldFactor;
      } else {
        outflowRateUnitsPerHour = null;
      }
    }

    if (node.nodeType === 'end') {
      outflowRateUnitsPerHour = inflowRateUnitsPerHour;
    }

    kpis.set(node.id, { inflowRateUnitsPerHour, outflowRateUnitsPerHour, utilizationPct });

    for (const nextId of outgoing.get(nodeId) ?? []) {
      indegree.set(nextId, (indegree.get(nextId) ?? 1) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) queue.push(nextId);
    }
  }

  return kpis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeTypeLabel(nodeType: FlowNode['nodeType']): string {
  switch (nodeType) {
    case 'start': return 'SOURCE';
    case 'end': return 'SINK';
    case 'resourceStep': return 'PROCESS';
    case 'timeStep': return 'TIME';
  }
}

function nodeTypeColor(nodeType: FlowNode['nodeType'], isBottleneck = false): {
  border: string; bg: string; badge: string;
} {
  if (isBottleneck) return { border: 'border-red-400', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700' };
  switch (nodeType) {
    case 'start': return { border: 'border-emerald-400', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' };
    case 'end': return { border: 'border-slate-400', bg: 'bg-slate-50', badge: 'bg-slate-100 text-slate-600' };
    case 'resourceStep': return { border: 'border-blue-400', bg: 'bg-white', badge: 'bg-blue-100 text-blue-700' };
    case 'timeStep': return { border: 'border-amber-400', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700' };
  }
}

// ---------------------------------------------------------------------------
// Flow topology helpers
// ---------------------------------------------------------------------------

function countSources(nodes: FlowNode[]) {
  return nodes.filter(n => n.nodeType === 'start').length;
}
function countSinks(nodes: FlowNode[]) {
  return nodes.filter(n => n.nodeType === 'end').length;
}
function countOrphans(nodes: FlowNode[], edges: FlowEdge[]) {
  return nodes.filter(n => {
    if (n.nodeType === 'start') return false;
    if (n.nodeType === 'end') return false;
    const hasIn = edges.some(e => e.target === n.id);
    const hasOut = edges.some(e => e.source === n.id);
    return !hasIn || !hasOut;
  }).length;
}

// ---------------------------------------------------------------------------
// AddStepModal
// ---------------------------------------------------------------------------

const AddStepModal = ({
  isOpen,
  onClose,
  onAddNode,
  nodes,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (nodePartial: Partial<FlowNode>) => void;
  nodes: FlowNode[];
}) => {
  if (!isOpen) return null;

  const hasEnd = nodes.some(n => n.nodeType === 'end');
  const sourcesCount = nodes.filter(n => n.nodeType === 'start').length;

  const nextPos = () => {
    const last = nodes.filter(n => n.nodeType !== 'start' && n.nodeType !== 'end').pop();
    return { x: last ? last.position.x + 240 : 320, y: last ? last.position.y : 200 };
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-xl shadow-floating w-full max-w-sm overflow-hidden border border-slate-200 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-base font-bold text-slate-900">Add to flow</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-md transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {/* Source — multiple allowed */}
          <button
            onClick={() => {
              onAddNode({
                nodeType: 'start',
                name: sourcesCount === 0 ? 'Source' : `Source ${sourcesCount + 1}`,
                position: { x: 60, y: 200 + sourcesCount * 130 },
                supplyMode: 'unlimited',
              });
              onClose();
            }}
            className="w-full p-3.5 rounded-lg border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <PlayCircle className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="font-bold text-sm text-slate-900">Source</div>
                <div className="text-xs text-slate-500">Start point of material flow — multiple sources are allowed</div>
              </div>
            </div>
          </button>

          {/* Process Step */}
          <button
            onClick={() => {
              const pos = nextPos();
              onAddNode({
                nodeType: 'resourceStep',
                name: `Stap ${nodes.filter(n => n.nodeType === 'resourceStep').length + 1}`,
                position: pos,
              });
              onClose();
            }}
            className="w-full p-3.5 rounded-lg border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <Settings2 className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-bold text-sm text-slate-900">Process step</div>
                <div className="text-xs text-slate-500">Link to a resource from the library</div>
              </div>
            </div>
          </button>

          {/* Time Step */}
          <button
            onClick={() => {
              const pos = nextPos();
              onAddNode({
                nodeType: 'timeStep',
                name: `Delay ${nodes.filter(n => n.nodeType === 'timeStep').length + 1}`,
                durationMinutesPerUnit: 60,
                position: pos,
              });
              onClose();
            }}
            className="w-full p-3.5 rounded-lg border border-amber-200 hover:border-amber-400 hover:bg-amber-50 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div>
                <div className="font-bold text-sm text-slate-900">Time step</div>
                <div className="text-xs text-slate-500">Wait or transport time, no capacity</div>
              </div>
            </div>
          </button>

          {/* Sink */}
          <button
            disabled={hasEnd}
            onClick={() => {
              const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 0);
              onAddNode({ nodeType: 'end', name: 'Sink', position: { x: maxX + 240, y: 200 } });
              onClose();
            }}
            className={`w-full p-3.5 rounded-lg border text-left transition-all ${
              hasEnd
                ? 'opacity-40 border-slate-200 cursor-not-allowed bg-slate-50'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <StopCircle className={`w-5 h-5 ${hasEnd ? 'text-slate-300' : 'text-slate-600'}`} />
              <div>
                <div className="font-bold text-sm text-slate-900">Sink</div>
                <div className="text-xs text-slate-500">Proces eindpunt — slechts 1 toegestaan</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// NodeComponent
// ---------------------------------------------------------------------------

interface NodeComponentProps {
  node: FlowNode;
  isSelected: boolean;
  isMultiSelected?: boolean;
  stepResult?: StepResult;
  flowLoadPct?: number | null;
  isBottleneck?: boolean;
  /** Resolved output material name (from flow propagation) shown as badge on the node. */
  resolvedOutputMaterialName?: string;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onPortMouseDown: (e: React.MouseEvent, id: string, type: 'source' | 'target') => void;
  onMouseUp: (e: React.MouseEvent, id: string) => void;
}

const NodeComponent: React.FC<NodeComponentProps> = ({
  node, isSelected, isMultiSelected, stepResult, flowLoadPct = null, isBottleneck = false,
  resolvedOutputMaterialName,
  onMouseDown, onContextMenu, onPortMouseDown, onMouseUp
}) => {
  const colors = nodeTypeColor(node.nodeType, isBottleneck);

  let borderCls = colors.border;
  let bgCls = colors.bg;
  let shadowCls = 'shadow-sm';

  if (isSelected || isMultiSelected) {
    borderCls = 'border-brand-500';
    shadowCls = 'shadow-md ring-2 ring-brand-500/30';
  }

  const hasResource = node.nodeType === 'resourceStep' && node.resourceId;
  const hasDuration = node.nodeType === 'timeStep' && node.durationMinutesPerUnit;
  const isUnconfigured =
    (node.nodeType === 'resourceStep' && !node.resourceId) ||
    (node.nodeType === 'timeStep' && !node.durationMinutesPerUnit);

  return (
    <div
      className={`absolute flex flex-col rounded-xl border-2 ${borderCls} ${bgCls} ${shadowCls} transition-shadow cursor-move select-none`}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: node.position.x, top: node.position.y, zIndex: isSelected || isMultiSelected ? 10 : 1 }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onContextMenu={(e) => onContextMenu(e, node.id)}
      onMouseUp={(e) => onMouseUp(e, node.id)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pointer-events-none">
        <span className={`text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded ${colors.badge}`}>
          {nodeTypeLabel(node.nodeType)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {isUnconfigured && (
            <AlertTriangle className="w-3 h-3 text-amber-400" />
          )}
          {isBottleneck && (
            <span className="text-[9px] font-black text-red-600 tracking-wide">⬛</span>
          )}
        </div>
      </div>

      {/* Name */}
      <div className="flex-1 px-3 flex flex-col justify-center pointer-events-none overflow-hidden">
        <div className="font-semibold text-sm truncate text-slate-900 leading-tight">{node.name}</div>

        {/* KPIs / metadata */}
        {node.nodeType === 'resourceStep' && (
          <div className="mt-1 text-[10px] text-slate-500 space-y-px">
            {stepResult ? (
              <>
                <div className="flex gap-2">
                  <span>{stepResult.effectiveRateUnitsPerHour > 0 ? `${stepResult.effectiveRateUnitsPerHour.toFixed(1)} e/h` : '—'}</span>
                  <span className={flowLoadPct !== null && flowLoadPct > 90 ? 'text-red-500 font-semibold' : ''}>
                    {flowLoadPct !== null ? `${flowLoadPct.toFixed(0)}%` : '—'}
                  </span>
                </div>
              </>
            ) : (
              <span className="italic">{hasResource ? 'Scenario required for KPIs' : 'Link a resource'}</span>
            )}
          </div>
        )}
        {node.nodeType === 'timeStep' && (
          <div className="mt-1 text-[10px] text-slate-500">
            {hasDuration ? `${node.durationMinutesPerUnit} min/unit` : <span className="italic text-amber-500">Enter duration</span>}
          </div>
        )}
        {/* Source node: material + supply info */}
        {node.nodeType === 'start' && (
          <div className="mt-1 space-y-px text-[10px]">
            {resolvedOutputMaterialName
              ? <div className="text-indigo-600 font-medium truncate">↳ {resolvedOutputMaterialName}</div>
              : <div className="italic text-amber-500">No material</div>
            }
            {node.supplyMode === 'fixed' && node.fixedSupplyAmount != null
              ? <div className="text-amber-700 font-semibold">{node.fixedSupplyAmount}/{node.fixedSupplyPeriodUnit ?? 'week'} — begrensd</div>
              : <div className="text-slate-400">Unlimited supply</div>
            }
            {stepResult?.utilizationAtTarget != null && node.supplyMode === 'fixed' && (
              <div className={stepResult.utilizationAtTarget >= 0.9 ? 'text-red-500 font-semibold' : 'text-slate-500'}>
                {(stepResult.utilizationAtTarget * 100).toFixed(0)}% target
              </div>
            )}
          </div>
        )}
        {/* Non-source material flow badge */}
        {resolvedOutputMaterialName && node.nodeType !== 'end' && node.nodeType !== 'start' && (
          <div className="mt-1 text-[9px] text-indigo-600 font-medium truncate">
            ↳ {resolvedOutputMaterialName}
          </div>
        )}
      </div>

      {/* Left port (target) — all except start */}
      {node.nodeType !== 'start' && (
        <div
          className="absolute top-1/2 -translate-y-1/2 -left-3.5 w-7 h-7 flex items-center justify-center cursor-crosshair group pointer-events-auto"
          onMouseDown={(e) => onPortMouseDown(e, node.id, 'target')}
        >
          <div className="w-3 h-3 bg-white rounded-full border-2 border-slate-300 group-hover:border-brand-500 group-hover:bg-brand-100 transition-all shadow-sm" />
        </div>
      )}

      {/* Right port (source) — all except end */}
      {node.nodeType !== 'end' && (
        <div
          className="absolute top-1/2 -translate-y-1/2 -right-3.5 w-7 h-7 flex items-center justify-center cursor-crosshair group pointer-events-auto"
          onMouseDown={(e) => onPortMouseDown(e, node.id, 'source')}
        >
          <div className="w-3 h-3 bg-white rounded-full border-2 border-slate-300 group-hover:border-brand-500 group-hover:bg-brand-100 transition-all shadow-sm" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// NodeDetailPanel
// ---------------------------------------------------------------------------

interface NodeDetailPanelProps {
  node: FlowNode;
  stepResult?: StepResult;
  flowLoadPct?: number | null;
  isBottleneck?: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, stepResult, flowLoadPct = null, isBottleneck = false, onClose, onNavigate }) => {
  const { state, updateNode, setNodeResource, setNodeDuration, deleteNode } = useAppState();
  const [showConversion, setShowConversion] = useState(false);

  // Resolved material flow for this node (input from upstream, output to downstream)
  const resolvedMaterials = useMemo(
    () => resolveFlowMaterials(state.nodes, state.edges),
    [state.nodes, state.edges],
  );
  const upstreamOutputIds = Array.from(new Set(
    state.edges
      .filter(e => e.target === node.id)
      .map(e => resolvedMaterials.get(e.source)?.outputId)
      .filter((id): id is string => Boolean(id))
  ));
  const materialById = (id?: string): Material | undefined =>
    id ? (state.materials ?? []).find(m => m.id === id) : undefined;
  const upstreamMaterial = upstreamOutputIds.length === 1
    ? materialById(upstreamOutputIds[0])
    : undefined;

  const [nameVal, setNameVal] = useState(node.name);
  const [durVal, setDurVal] = useState<string>(
    node.durationMinutesPerUnit !== undefined ? String(node.durationMinutesPerUnit) : ''
  );

  // Sync when node changes (e.g., selection changes)
  useEffect(() => {
    setNameVal(node.name);
    setDurVal(node.durationMinutesPerUnit !== undefined ? String(node.durationMinutesPerUnit) : '');
  }, [node.id, node.name, node.durationMinutesPerUnit]);

  const handleNameBlur = () => {
    const trimmed = nameVal.trim();
    if (trimmed.length >= 1 && trimmed !== node.name) {
      updateNode(node.id, { name: trimmed });
    } else {
      setNameVal(node.name); // revert
    }
  };

  const handleDurationBlur = () => {
    const parsed = parseFloat(durVal);
    if (!isNaN(parsed) && parsed > 0) {
      setNodeDuration(node.id, parsed);
    } else {
      setDurVal(node.durationMinutesPerUnit !== undefined ? String(node.durationMinutesPerUnit) : '');
    }
  };

  const handleEnabledToggle = () => {
    updateNode(node.id, { enabled: !(node.enabled !== false) });
  };

  const selectedResource = state.resources.find(r => r.id === node.resourceId);
  const availableResources = state.resources.filter(r => !r.isTemplate);

  const isTerminal = node.nodeType === 'start' || node.nodeType === 'end';
  const isResourceStep = node.nodeType === 'resourceStep';
  const isTimeStep = node.nodeType === 'timeStep';
  const isEnabled = node.enabled !== false;

  const targetUtilizationPct = stepResult?.utilizationAtTarget != null
    ? stepResult.utilizationAtTarget * 100
    : null;

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-30 shadow-floating animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-start bg-slate-50">
        <div>
          <span className={`text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded mb-1 inline-block ${nodeTypeColor(node.nodeType).badge}`}>
            {nodeTypeLabel(node.nodeType)}
          </span>
          <div className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{node.name}</div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-500 transition-colors mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* End node */}
        {node.nodeType === 'end' && (
          <div className="p-5 text-center">
            <div className="mb-3 p-3 bg-slate-100 rounded-xl inline-block">
              <StopCircle className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm text-slate-500">Process endpoint — no configuration needed.</p>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Source (start) node — overhauled panel                           */}
        {/* ---------------------------------------------------------------- */}
        {node.nodeType === 'start' && (
          <div className="p-4 space-y-5">

            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Material */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Material</label>
              <p className="text-[10px] text-slate-500 mb-2">
                The material this source feeds into the flow. Next steps inherit it automatically.
              </p>
              {(state.materials ?? []).length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>First create materials on the Materials page</span>
                </div>
              ) : (
                <select
                  value={node.outputMaterialId ?? ''}
                  onChange={e => updateNode(node.id, { outputMaterialId: e.target.value || undefined })}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <option value="">— No material —</option>
                  {(state.materials ?? []).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Aanvoermodus */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">Aanvoermodus</label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateNode(node.id, { supplyMode: 'unlimited', fixedSupplyAmount: undefined })}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all text-left ${
                    (node.supplyMode ?? 'unlimited') === 'unlimited'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800 ring-1 ring-emerald-400'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-bold mb-0.5">∞ Onbeperkt</div>
                  <div className="text-[10px] font-normal opacity-75">Capacity determined by process steps</div>
                </button>
                <button
                  onClick={() => updateNode(node.id, { supplyMode: 'fixed', fixedSupplyPeriodUnit: node.fixedSupplyPeriodUnit ?? 'week' })}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all text-left ${
                    node.supplyMode === 'fixed'
                      ? 'bg-amber-50 border-amber-400 text-amber-800 ring-1 ring-amber-400'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-bold mb-0.5">Fixed inflow</div>
                  <div className="text-[10px] font-normal opacity-75">Source can become the limiter</div>
                </button>
              </div>
            </div>

            {/* Fixed supply configuration */}
            {node.supplyMode === 'fixed' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                <label className="block text-xs font-bold text-slate-700">Supply amount</label>
                <div className="flex items-center gap-2">
                  <NumericInput
                    min={0.001} step={1}
                    value={node.fixedSupplyAmount}
                    onChange={v => updateNode(node.id, { fixedSupplyAmount: v })}
                    placeholder="e.g. 500"
                    className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  />
                  <span className="text-xs text-slate-500 whitespace-nowrap">per</span>
                  <select
                    value={node.fixedSupplyPeriodUnit ?? 'week'}
                    onChange={e => updateNode(node.id, { fixedSupplyPeriodUnit: e.target.value as 'hour' | 'day' | 'week' })}
                    className="text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="hour">hour</option>
                    <option value="day">day</option>
                    <option value="week">week</option>
                  </select>
                </div>
                {node.fixedSupplyAmount != null && node.fixedSupplyAmount > 0 && (() => {
                  const ph: Record<string, number> = { hour: 1, day: 24, week: 168 };
                  const uph = node.fixedSupplyAmount / (ph[node.fixedSupplyPeriodUnit ?? 'week'] ?? 168);
                  return (
                    <p className="text-[10px] text-amber-700">
                      ≈ {uph.toFixed(2)} units/hour — the source can become the bottleneck if this is lower than the process steps.
                    </p>
                  );
                })()}
              </div>
            )}

            {/* KPI block for fixed-supply source */}
            {node.supplyMode === 'fixed' && stepResult && (
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Zap className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-600">Aanvoercapaciteit</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Max throughput</span>
                    <span className="font-semibold">{stepResult.effectiveRateUnitsPerHour.toFixed(2)} e/h</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Max over horizon</span>
                    <span className="font-semibold">{Math.round(stepResult.stepMaxGoodUnitsOverHorizon).toLocaleString()} units</span>
                  </div>
                  {stepResult.utilizationAtTarget != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Target utilization</span>
                      <span className={`font-semibold ${stepResult.utilizationAtTarget >= 0.9 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {(stepResult.utilizationAtTarget * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {isBottleneck && (
                    <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 mt-2">
                      <span className="font-black">⬛</span>
                      <span className="font-semibold">Input throttling — source limits throughput</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Source node footer: delete (only when 2+ sources) + close        */}
        {/* ---------------------------------------------------------------- */}
        {node.nodeType === 'start' && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
            <button
              disabled={(state.nodes ?? []).filter(n => n.nodeType === 'start').length <= 1}
              onClick={() => { deleteNode(node.id); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove source
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              Klaar
            </button>
          </div>
        )}

        {/* Editable nodes */}
        {!isTerminal && (
          <div className="p-4 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>

            {/* ResourceStep: resource picker */}
            {isResourceStep && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Resource</label>
                {!node.resourceId && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Select a resource to calculate KPIs</span>
                  </div>
                )}
                <select
                  value={node.resourceId ?? ''}
                  onChange={e => {
                    if (e.target.value) setNodeResource(node.id, e.target.value);
                  }}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <option value="">— Choose a resource —</option>
                  {availableResources.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                {/* Selected resource info */}
                {selectedResource && (
                  <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-700 space-y-0.5">
                    <div className="font-semibold">{selectedResource.name}</div>
                    <div className="text-blue-500">
                      {selectedResource.type === 'batch'
                        ? `Batch: ${selectedResource.batchSize} units / ${selectedResource.cycleTimeMinutes} min`
                        : `${selectedResource.outputPerHour} units/hour`
                      }
                      {' · '}Availability {Math.round((selectedResource.availability ?? 1) * 100)}%
                    </div>
                    {selectedResource.parallelUnits > 1 && (
                      <div className="text-blue-500">× {selectedResource.parallelUnits} parallel units</div>
                    )}
                  </div>
                )}

                {/* Go to resources */}
                {node.resourceId && (
                  <button
                    onClick={() => { onNavigate?.('resources'); }}
                    className="mt-2 flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View in Resources
                  </button>
                )}

                {!node.resourceId && (
                  <button
                    onClick={() => onNavigate?.('resources')}
                    className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-600 font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    Create new resource
                  </button>
                )}
              </div>
            )}

            {/* TimeStep: duration */}
            {isTimeStep && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transport time</label>
                {!node.durationMinutesPerUnit && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Enter duration — default 60 min used</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="1"
                    value={durVal}
                    onChange={e => setDurVal(e.target.value)}
                    onBlur={handleDurationBlur}
                    onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    placeholder="60"
                    className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-xs text-slate-500 font-medium">min</span>
                </div>
              </div>
            )}

            {/* Enabled toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-xs font-bold text-slate-700">Active in calculation</div>
                <div className="text-[10px] text-slate-500">Disabled = skipped in throughput</div>
              </div>
              <button
                onClick={handleEnabledToggle}
                className={`relative w-10 h-5 rounded-full transition-colors ${isEnabled ? 'bg-brand-500' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Material conversion section */}
            <div className="border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowConversion(prev => !prev)}
                className="flex items-center gap-2 w-full text-left"
              >
                {showConversion
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                }
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-600">Material conversion</span>
                {node.conversionRatio && node.conversionRatio !== 1 && (
                  <span className="ml-auto text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                    ×{node.conversionRatio}
                  </span>
                )}
              </button>

              {showConversion && (
                <div className="mt-3 space-y-3">
                  {(state.materials ?? []).length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>First create materials on the Materials page</span>
                    </div>
                  )}

                  {/* Upstream material(s) are always inherited from connected upstream nodes */}
                  {upstreamMaterial && (
                    <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                      <ChevronRight className="w-3 h-3 flex-shrink-0" />
                      <span>From upstream: <strong>{upstreamMaterial.name} ({upstreamMaterial.unit})</strong></span>
                    </div>
                  )}
                  {upstreamOutputIds.length > 1 && (
                    <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 space-y-1">
                      <div className="font-medium">Inputs from upstream ({upstreamOutputIds.length})</div>
                      <ul className="list-disc list-inside text-[11px]">
                        {upstreamOutputIds.map((id) => {
                          const m = materialById(id);
                          return <li key={id}>{m ? `${m.name} (${m.unit})` : id}</li>;
                        })}
                      </ul>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Input material
                      <span className="ml-1 normal-case font-normal text-indigo-500">(automatic from upstream)</span>
                    </label>
                    <div className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-slate-50 text-slate-700 min-h-[30px]">
                      {upstreamOutputIds.length === 0 && '— No upstream input —'}
                      {upstreamOutputIds.length === 1 && (() => {
                        const m = materialById(upstreamOutputIds[0]);
                        return m ? `${m.name} (${m.unit})` : upstreamOutputIds[0];
                      })()}
                      {upstreamOutputIds.length > 1 && `${upstreamOutputIds.length} materials from upstream (see list above)`}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Output material</label>
                    <select
                      value={node.outputMaterialId ?? ''}
                      onChange={e => {
                        updateNode(node.id, { outputMaterialId: e.target.value || undefined });
                      }}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                    >
                      <option value="">— None —</option>
                      {(state.materials ?? []).map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Conversieverhouding (output per input)</label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.01"
                      value={node.conversionRatio ?? 1}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > 0) {
                          updateNode(node.id, { conversionRatio: v });
                        }
                      }}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="1"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">e.g. 57.14 sachets per pot</p>
                  </div>

                  {(node.outputMaterialId || (node.conversionRatio && node.conversionRatio !== 1)) && (
                    <button
                      onClick={() => updateNode(node.id, { inputMaterialId: undefined, outputMaterialId: undefined, conversionRatio: undefined })}
                      className="text-xs text-slate-400 hover:text-red-500 font-medium transition-colors"
                    >
                      Conversie wissen
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* KPI section */}
        {(isResourceStep || isTimeStep) && (
          <div className="px-4 pb-4">
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Zap className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-600">Capacity & Utilization</span>
              </div>

              {stepResult ? (
                <div className="space-y-2">
                  {isResourceStep && (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Effective capacity</span>
                        <span className="font-semibold text-slate-800">
                          {stepResult.effectiveRateUnitsPerHour > 0
                            ? `${stepResult.effectiveRateUnitsPerHour.toFixed(1)} e/h`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Utilization</span>
                        <span className={`font-semibold ${
                          flowLoadPct !== null && flowLoadPct > 90
                            ? 'text-red-600'
                            : flowLoadPct !== null && flowLoadPct > 75
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}>
                          {flowLoadPct !== null ? `${flowLoadPct.toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      {/* Utilization bar */}
                      {flowLoadPct !== null && (
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              flowLoadPct > 90 ? 'bg-red-500' : flowLoadPct > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, flowLoadPct)}%` }}
                          />
                        </div>
                      )}
                      {targetUtilizationPct !== null && (
                        <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                          <span>Target utilization (scenario)</span>
                          <span>{targetUtilizationPct.toFixed(1)}%</span>
                        </div>
                      )}
                    </>
                  )}

                  {isTimeStep && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Delay</span>
                      <span className="font-semibold text-slate-800">
                        {stepResult.durationMinutesPerUnit
                          ? `${stepResult.durationMinutesPerUnit} min/unit`
                          : '—'}
                      </span>
                    </div>
                  )}

                  {isBottleneck && (
                    <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 mt-1">
                      <span className="font-black text-sm">⬛</span>
                      <span className="font-semibold">Bottleneck — limits throughput</span>
                    </div>
                  )}

                  {!isBottleneck && isResourceStep && flowLoadPct !== null && flowLoadPct < 90 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Sufficient capacity available</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic text-center py-2">
                  Set a scenario with demand to view KPIs
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!isTerminal && (
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
          <button
            onClick={() => {
              deleteNode(node.id);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2 rounded-lg text-xs transition-all"
          >
            Klaar
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProcessBuilder
// ---------------------------------------------------------------------------

interface ProcessBuilderProps {
  onNavigate?: (tab: string) => void;
}

export const ProcessBuilder: React.FC<ProcessBuilderProps> = ({ onNavigate }) => {
  const {
    state,
    addNode, updateNode, deleteNode, deleteNodes, duplicateNode,
    addEdge, deleteEdge,
    setRunResult, ensureSourceAndSink,
  } = useAppState();

  const nodes = state.nodes;
  const edges = state.edges;

  // Resolved material flow per node (propagated from start node's outputMaterialId)
  const resolvedMaterials = useMemo(
    () => resolveFlowMaterials(nodes, edges),
    [nodes, edges],
  );
  const materialById = (id?: string) => (state.materials ?? []).find(m => m.id === id);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean; x: number; y: number; type: 'node' | 'edge'; targetId: string;
  } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x1: number; y1: number; x2: number; y2: number; active: boolean;
  } | null>(null);

  // --- Auto-ensure source and sink on first mount ---
  useEffect(() => {
    ensureSourceAndSink();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Real-time engine KPI calculation ---
  useEffect(() => {
    const scenario = state.scenarios.find(s => s.id === state.activeScenarioId);
    if (!scenario?.demand) {
      setRunResult(null);
      return;
    }
    try {
      const result = run(state, {
        projectId: 'project-001',
        scenarioId: state.activeScenarioId,
        targetGoodUnits: scenario.demand.targetGoodUnits,
        horizonCalendarDays: scenario.demand.horizonCalendarDays,
        startDateISO: scenario.demand.startDateISO,
        timezone: scenario.demand.timezone,
      });
      setRunResult(result);
    } catch {
      setRunResult(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nodes, state.edges, state.activeScenarioId, state.resources, state.departments, state.scenarios]);

  // --- Build step result lookup and bottleneck tracking ---
  const activeResult = state.latestRunResult?.baseline;
  const stepResultByNodeId = useMemo(() => {
    const lookup = new Map<string, StepResult>();
    if (activeResult?.steps) {
      for (const s of activeResult.steps) lookup.set(s.stepId, s);
    }
    return lookup;
  }, [activeResult?.steps]);
  const flowKpiByNodeId = useMemo(
    () => computeNodeFlowKpis(nodes, edges, stepResultByNodeId),
    [nodes, edges, stepResultByNodeId],
  );
  const bottleneckStepId = activeResult?.bottleneck?.stepId ?? null;

  // --- Topology counts for toolbar ---
  const sourceCount = countSources(nodes);
  const sinkCount = countSinks(nodes);
  const orphanCount = countOrphans(nodes, edges);

  // --- Close context menu on outside click ---
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = (e.target as Element).closest('[data-nodeid]')?.getBoundingClientRect()
      ?? (e.target as Element).closest('.absolute')?.getBoundingClientRect();
    if (rect) dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (!multiSelectedNodeIds.includes(id)) {
      setMultiSelectedNodeIds([]);
      setSelectedNodeId(id);
    }
    setSelectedEdgeId(null);
    setDraggingId(id);
    setContextMenu(null);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const y = e.clientY - rect.top + containerRef.current.scrollTop;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setMultiSelectedNodeIds([]);
    setSelectionRect({ x1: x, y1: y, x2: x, y2: y, active: true });
  };

  const handlePortMouseDown = (e: React.MouseEvent, id: string, type: 'source' | 'target') => {
    e.stopPropagation(); e.preventDefault();
    if (type === 'source') {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setConnectingNodeId(id);
        setMousePos({
          x: e.clientX - rect.left + containerRef.current!.scrollLeft,
          y: e.clientY - rect.top + containerRef.current!.scrollTop,
        });
      }
    }
  };

  const handleNodeMouseUp = (e: React.MouseEvent, targetId: string) => {
    if (!connectingNodeId || connectingNodeId === targetId) return;

    // Prevent connecting: start → start, or end → anything, or anything → end's out-port
    const srcNode = nodes.find(n => n.id === connectingNodeId);
    const tgtNode = nodes.find(n => n.id === targetId);
    if (!srcNode || !tgtNode) return;
    if (srcNode.nodeType === 'end') return;           // end has no out-port
    if (tgtNode.nodeType === 'start') return;          // nothing goes into start
    addEdge(connectingNodeId, targetId);
    setConnectingNodeId(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const y = e.clientY - rect.top + containerRef.current.scrollTop;

    if (selectionRect?.active) {
      setSelectionRect(prev => prev ? { ...prev, x2: x, y2: y } : null);
      return;
    }
    if (connectingNodeId) { setMousePos({ x, y }); return; }
    if (!draggingId) return;

    const newPos = {
      x: Math.max(0, Math.round((x - dragOffset.current.x) / 10) * 10),
      y: Math.max(0, Math.round((y - dragOffset.current.y) / 10) * 10),
    };
    updateNode(draggingId, { position: newPos });
  };

  const handleMouseUp = () => {
    if (selectionRect?.active) {
      const { x1, y1, x2, y2 } = selectionRect;
      const left = Math.min(x1, x2), top = Math.min(y1, y2);
      const right = Math.max(x1, x2), bottom = Math.max(y1, y2);
      const selectedIds = nodes.filter(n =>
        n.position.x + NODE_WIDTH > left && n.position.x < right &&
        n.position.y + NODE_HEIGHT > top && n.position.y < bottom
      ).map(n => n.id);
      setMultiSelectedNodeIds(selectedIds);
      if (selectedIds.length === 1) setSelectedNodeId(selectedIds[0]);
      setSelectionRect(null);
    }
    setDraggingId(null);
    setConnectingNodeId(null);
  };

  const handleMenuAction = (action: 'duplicate' | 'goto' | 'delete') => {
    if (!contextMenu) return;
    if (action === 'delete') {
      if (contextMenu.type === 'node') {
        deleteNode(contextMenu.targetId);
        if (selectedNodeId === contextMenu.targetId) setSelectedNodeId(null);
      } else {
        deleteEdge(contextMenu.targetId);
      }
    } else if (action === 'duplicate' && contextMenu.type === 'node') {
      duplicateNode(contextMenu.targetId);
    } else if (action === 'goto' && contextMenu.type === 'node') {
      const node = nodes.find(n => n.id === contextMenu.targetId);
      if (node?.resourceId) onNavigate?.('resources');
    }
    setContextMenu(null);
  };

  const handleBulkDelete = () => {
    if (multiSelectedNodeIds.length > 0) {
      deleteNodes(multiSelectedNodeIds);
      setMultiSelectedNodeIds([]);
      setSelectedNodeId(null);
    } else if (selectedNodeId) {
      deleteNode(selectedNodeId);
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      deleteEdge(selectedEdgeId);
      setSelectedEdgeId(null);
    }
  };

  // Edge path helper
  const getPath = (sPos: { x: number; y: number }, tPos: { x: number; y: number }) => {
    const sX = sPos.x + NODE_WIDTH + 10;
    const sY = sPos.y + NODE_HEIGHT / 2;
    const tX = tPos.x - 10;
    const tY = tPos.y + NODE_HEIGHT / 2;
    const cx = (sX + tX) / 2;
    return `M ${sX} ${sY} C ${cx} ${sY} ${cx} ${tY} ${tX} ${tY}`;
  };

  // Connecting wire path
  const connectingNode = nodes.find(n => n.id === connectingNodeId);

  return (
    <div className="flex h-full relative">
      <AddStepModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        nodes={nodes}
        onAddNode={addNode}
      />

      {/* Canvas */}
      <div className="flex-1 relative bg-slate-50 overflow-hidden flex flex-col">

        {/* Toolbar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
          <div className="flex items-center gap-2">
            {/* Add button */}
            <div className="bg-white p-1 rounded-lg shadow-card border border-slate-200 pointer-events-auto flex gap-1">
              <button className="p-2 hover:bg-slate-50 rounded-md text-slate-500 transition-colors" title="Select">
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-slate-50 rounded-md text-slate-500 transition-colors" title="Move">
                <Move className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-slate-200 mx-1 self-center" />
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 rounded-md text-sm font-bold text-white transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {/* Topology counts */}
            <div className="bg-white rounded-lg shadow-card border border-slate-200 px-3 py-1.5 flex items-center gap-3 pointer-events-auto text-xs text-slate-500">
              <span className={sourceCount >= 1 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                {sourceCount}× {sourceCount === 1 ? 'Source' : 'Sources'}
              </span>
              <span className={sinkCount === 1 ? 'text-slate-600' : 'text-red-500 font-semibold'}>
                {sinkCount}× Sink
              </span>
              {orphanCount > 0 && (
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {orphanCount} floating
                </span>
              )}
              {orphanCount === 0 && sourceCount >= 1 && sinkCount === 1 && (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Valid
                </span>
              )}
            </div>
          </div>

          {/* Delete / right side */}
          <div className="bg-white p-1 rounded-lg shadow-card border border-slate-200 pointer-events-auto flex gap-1">
            <button
              onClick={handleBulkDelete}
              disabled={!selectedNodeId && !selectedEdgeId && multiSelectedNodeIds.length === 0}
              className="flex items-center gap-2 p-2 px-3 hover:bg-red-50 hover:text-red-600 rounded-md text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Trash2 className="w-4 h-4" />
              {multiSelectedNodeIds.length > 1 && (
                <span className="text-xs font-bold">Delete ({multiSelectedNodeIds.length})</span>
              )}
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-auto cursor-default"
          style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '40px 40px' }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseDown={handleCanvasMouseDown}
        >
          {/* SVG edges */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%', minWidth: 2400, minHeight: 1600 }}
          >
            <defs>
              <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M 0 0 L 7 3.5 L 0 7" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
              </marker>
              <marker id="arrow-sel" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M 0 0 L 7 3.5 L 0 7" fill="none" stroke="#0056D2" strokeWidth="2" />
              </marker>
            </defs>

            {edges.map(edge => {
              const s = nodes.find(n => n.id === edge.source);
              const t = nodes.find(n => n.id === edge.target);
              if (!s || !t) return null;
              const isSel = selectedEdgeId === edge.id;
              return (
                <g
                  key={edge.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeId(null); setMultiSelectedNodeIds([]); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'edge', targetId: edge.id }); }}
                  className="pointer-events-auto cursor-pointer group"
                >
                  <path d={getPath(s.position, t.position)} fill="none" stroke="transparent" strokeWidth="16" />
                  <path
                    d={getPath(s.position, t.position)}
                    fill="none"
                    stroke={isSel ? '#0056D2' : '#94a3b8'}
                    strokeWidth={isSel ? '2.5' : '2'}
                    markerEnd={isSel ? 'url(#arrow-sel)' : 'url(#arrow)'}
                    className="group-hover:stroke-brand-400 transition-colors"
                  />
                </g>
              );
            })}

            {/* Live connecting wire */}
            {connectingNodeId && connectingNode && (
              <path
                d={`M ${connectingNode.position.x + NODE_WIDTH + 10} ${connectingNode.position.y + NODE_HEIGHT / 2} L ${mousePos.x} ${mousePos.y}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeDasharray="6,4"
              />
            )}
          </svg>

          {/* Selection rect */}
          {selectionRect?.active && (
            <div
              className="absolute border border-brand-500 bg-brand-500/10 pointer-events-none z-50 rounded"
              style={{
                left: Math.min(selectionRect.x1, selectionRect.x2),
                top: Math.min(selectionRect.y1, selectionRect.y2),
                width: Math.abs(selectionRect.x2 - selectionRect.x1),
                height: Math.abs(selectionRect.y2 - selectionRect.y1),
              }}
            />
          )}

          {/* Nodes */}
          {nodes.map(node => {
            const resolvedOut = resolvedMaterials.get(node.id)?.outputId;
            const resolvedOutMaterial = materialById(resolvedOut);
            return (
              <NodeComponent
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                isMultiSelected={multiSelectedNodeIds.includes(node.id)}
                stepResult={stepResultByNodeId.get(node.id)}
                flowLoadPct={flowKpiByNodeId.get(node.id)?.utilizationPct ?? null}
                isBottleneck={bottleneckStepId === node.id}
                resolvedOutputMaterialName={resolvedOutMaterial ? `${resolvedOutMaterial.name} (${resolvedOutMaterial.unit})` : undefined}
                onMouseDown={handleMouseDown}
                onContextMenu={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'node', targetId: node.id });
                }}
                onPortMouseDown={handlePortMouseDown}
                onMouseUp={handleNodeMouseUp}
              />
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <NodeDetailPanel
          key={selectedNode.id}
          node={selectedNode}
          stepResult={stepResultByNodeId.get(selectedNode.id)}
          flowLoadPct={flowKpiByNodeId.get(selectedNode.id)?.utilizationPct ?? null}
          isBottleneck={bottleneckStepId === selectedNode.id}
          onClose={() => setSelectedNodeId(null)}
          onNavigate={onNavigate}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-floating border border-slate-200 w-48 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === 'node' && (
            <>
              <button
                onClick={() => handleMenuAction('duplicate')}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 flex items-center gap-2 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> Dupliceer
              </button>
              <button
                onClick={() => handleMenuAction('goto')}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 flex items-center gap-2 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Bekijk Resource
              </button>
              <div className="h-px bg-slate-100 my-1" />
            </>
          )}
          <button
            onClick={() => handleMenuAction('delete')}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
};
