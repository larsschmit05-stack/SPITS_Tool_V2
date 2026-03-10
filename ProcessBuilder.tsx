
import React, { useState, useRef, useEffect } from 'react';
import { useAppState } from './src/state/store';
import type { FlowNode, FlowEdge, ProductMixEntry } from './src/state/types';
import type { StepResult } from './src/engine/types';
import { run } from './src/engine/engine';
import {
  Plus, MousePointer2, Move, Trash2, Settings2, PlayCircle, StopCircle,
  Clock, Copy, X, ExternalLink, AlertTriangle, CheckCircle2, Zap, Package, ChevronDown, ChevronRight
} from 'lucide-react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 96;

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

  const hasStart = nodes.some(n => n.nodeType === 'start');
  const hasEnd = nodes.some(n => n.nodeType === 'end');

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
          <h3 className="text-base font-bold text-slate-900">Add to Flow</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-md transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {/* Source */}
          <button
            disabled={hasStart}
            onClick={() => {
              onAddNode({ nodeType: 'start', name: 'Source', position: { x: 60, y: 200 } });
              onClose();
            }}
            className={`w-full p-3.5 rounded-lg border text-left transition-all ${
              hasStart
                ? 'opacity-40 border-slate-200 cursor-not-allowed bg-slate-50'
                : 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <PlayCircle className={`w-5 h-5 ${hasStart ? 'text-slate-400' : 'text-emerald-600'}`} />
              <div>
                <div className="font-bold text-sm text-slate-900">Bron (Source)</div>
                <div className="text-xs text-slate-500">Materiaal ingang — slechts 1 toegestaan</div>
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
                <div className="font-bold text-sm text-slate-900">Processtap</div>
                <div className="text-xs text-slate-500">Koppel aan een resource uit de bibliotheek</div>
              </div>
            </div>
          </button>

          {/* Time Step */}
          <button
            onClick={() => {
              const pos = nextPos();
              onAddNode({
                nodeType: 'timeStep',
                name: `Wachttijd ${nodes.filter(n => n.nodeType === 'timeStep').length + 1}`,
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
                <div className="font-bold text-sm text-slate-900">Tijdstap</div>
                <div className="text-xs text-slate-500">Wacht- of transporttijd, geen capaciteit</div>
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
  isBottleneck?: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onPortMouseDown: (e: React.MouseEvent, id: string, type: 'source' | 'target') => void;
  onMouseUp: (e: React.MouseEvent, id: string) => void;
}

const NodeComponent: React.FC<NodeComponentProps> = ({
  node, isSelected, isMultiSelected, stepResult, isBottleneck = false,
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
                  <span className={stepResult.utilizationAtTarget !== null && stepResult.utilizationAtTarget > 0.9 ? 'text-red-500 font-semibold' : ''}>
                    {stepResult.utilizationAtTarget !== null ? `${(stepResult.utilizationAtTarget * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
              </>
            ) : (
              <span className="italic">{hasResource ? 'Scenario vereist voor KPIs' : 'Koppel een resource'}</span>
            )}
          </div>
        )}
        {node.nodeType === 'timeStep' && (
          <div className="mt-1 text-[10px] text-slate-500">
            {hasDuration ? `${node.durationMinutesPerUnit} min/eenheid` : <span className="italic text-amber-500">Vul duur in</span>}
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
  isBottleneck?: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, stepResult, isBottleneck = false, onClose, onNavigate }) => {
  const { state, updateNode, setNodeResource, setNodeDuration, deleteNode, setNodeMaterialConversion, clearNodeMaterialConversion, setSourceProductMix } = useAppState();
  const [showConversion, setShowConversion] = useState(false);

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

  const utilizationPct = stepResult?.utilizationAtTarget !== null && stepResult?.utilizationAtTarget !== undefined
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
        {/* Terminal nodes */}
        {isTerminal && node.nodeType === 'end' && (
          <div className="p-5 text-center">
            <div className="mb-3 p-3 bg-slate-100 rounded-xl inline-block">
              <StopCircle className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm text-slate-500">Proces eindpunt — geen configuratie nodig.</p>
          </div>
        )}

        {/* Start node: product mix editor */}
        {isTerminal && node.nodeType === 'start' && (
          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-bold text-slate-700">Productmix</span>
              </div>
              {(state.materials ?? []).length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Maak eerst materialen aan op de Materialen-pagina</span>
                </div>
              )}
              {(node.productMix ?? []).map((entry, idx) => (
                <div key={entry.id} className="flex items-center gap-1.5 mb-1.5">
                  <input
                    type="text"
                    value={entry.label}
                    onChange={e => {
                      const updated = (node.productMix ?? []).map((en, i) =>
                        i === idx ? { ...en, label: e.target.value } : en
                      );
                      setSourceProductMix(node.id, updated);
                    }}
                    className="w-20 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Label"
                  />
                  <select
                    value={entry.materialId}
                    onChange={e => {
                      const updated = (node.productMix ?? []).map((en, i) =>
                        i === idx ? { ...en, materialId: e.target.value } : en
                      );
                      setSourceProductMix(node.id, updated);
                    }}
                    className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option value="">— Materiaal —</option>
                    {(state.materials ?? []).map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={entry.quantity}
                    onChange={e => {
                      const updated = (node.productMix ?? []).map((en, i) =>
                        i === idx ? { ...en, quantity: Number(e.target.value) } : en
                      );
                      setSourceProductMix(node.id, updated);
                    }}
                    className="w-16 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Qty"
                  />
                  <button
                    onClick={() => {
                      const updated = (node.productMix ?? []).filter((_, i) => i !== idx);
                      setSourceProductMix(node.id, updated);
                    }}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const newEntry: ProductMixEntry = {
                    id: Math.random().toString(36).slice(2, 9),
                    label: `Type ${(node.productMix ?? []).length + 1}`,
                    materialId: '',
                    quantity: 0,
                  };
                  setSourceProductMix(node.id, [...(node.productMix ?? []), newEntry]);
                }}
                className="mt-1 flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                <Plus className="w-3 h-3" />
                Type toevoegen
              </button>
            </div>
          </div>
        )}

        {/* Editable nodes */}
        {!isTerminal && (
          <div className="p-4 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Naam</label>
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
                    <span>Selecteer een resource om KPIs te berekenen</span>
                  </div>
                )}
                <select
                  value={node.resourceId ?? ''}
                  onChange={e => {
                    if (e.target.value) setNodeResource(node.id, e.target.value);
                  }}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <option value="">— Kies een resource —</option>
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
                        ? `Batch: ${selectedResource.batchSize} st / ${selectedResource.cycleTimeMinutes} min`
                        : `${selectedResource.outputPerHour} eenheden/uur`
                      }
                      {' · '}Beschikbaarheid {Math.round((selectedResource.availability ?? 1) * 100)}%
                    </div>
                    {selectedResource.parallelUnits > 1 && (
                      <div className="text-blue-500">× {selectedResource.parallelUnits} parallelle eenheden</div>
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
                    Bekijk in Resources
                  </button>
                )}

                {!node.resourceId && (
                  <button
                    onClick={() => onNavigate?.('resources')}
                    className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-600 font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    Maak nieuwe resource aan
                  </button>
                )}
              </div>
            )}

            {/* TimeStep: duration */}
            {isTimeStep && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transporttijd</label>
                {!node.durationMinutesPerUnit && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Vul duur in — standaard 60 min gebruikt</span>
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
                <div className="text-xs font-bold text-slate-700">Actief in berekening</div>
                <div className="text-[10px] text-slate-500">Uitgeschakeld = overgeslagen in doorvoer</div>
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
                <span className="text-xs font-bold text-slate-600">Materiaal conversie</span>
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
                      <span>Maak eerst materialen aan op de Materialen-pagina</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Input materiaal</label>
                    <select
                      value={node.inputMaterialId ?? ''}
                      onChange={e => {
                        if (e.target.value) {
                          setNodeMaterialConversion(
                            node.id,
                            e.target.value,
                            node.outputMaterialId ?? e.target.value,
                            node.conversionRatio ?? 1
                          );
                        }
                      }}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                    >
                      <option value="">— Geen —</option>
                      {(state.materials ?? []).map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Output materiaal</label>
                    <select
                      value={node.outputMaterialId ?? ''}
                      onChange={e => {
                        if (e.target.value) {
                          setNodeMaterialConversion(
                            node.id,
                            node.inputMaterialId ?? e.target.value,
                            e.target.value,
                            node.conversionRatio ?? 1
                          );
                        }
                      }}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                    >
                      <option value="">— Geen —</option>
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
                          setNodeMaterialConversion(
                            node.id,
                            node.inputMaterialId ?? '',
                            node.outputMaterialId ?? '',
                            v
                          );
                        }
                      }}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="1"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Bijv. 57.14 sachets per pot</p>
                  </div>

                  {(node.inputMaterialId || node.outputMaterialId || (node.conversionRatio && node.conversionRatio !== 1)) && (
                    <button
                      onClick={() => clearNodeMaterialConversion(node.id)}
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
                <span className="text-xs font-bold text-slate-600">Capaciteit & Bezetting</span>
              </div>

              {stepResult ? (
                <div className="space-y-2">
                  {isResourceStep && (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Effectieve capaciteit</span>
                        <span className="font-semibold text-slate-800">
                          {stepResult.effectiveRateUnitsPerHour > 0
                            ? `${stepResult.effectiveRateUnitsPerHour.toFixed(1)} e/h`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Max throughput (horizon)</span>
                        <span className="font-semibold text-slate-800">
                          {stepResult.stepMaxGoodUnitsOverHorizon > 0
                            ? `${Math.round(stepResult.stepMaxGoodUnitsOverHorizon)} st`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Bezettingsgraad</span>
                        <span className={`font-semibold ${
                          utilizationPct !== null && utilizationPct > 90
                            ? 'text-red-600'
                            : utilizationPct !== null && utilizationPct > 75
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}>
                          {utilizationPct !== null ? `${utilizationPct.toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      {/* Utilization bar */}
                      {utilizationPct !== null && (
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              utilizationPct > 90 ? 'bg-red-500' : utilizationPct > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, utilizationPct)}%` }}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {isTimeStep && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Vertraging</span>
                      <span className="font-semibold text-slate-800">
                        {stepResult.durationMinutesPerUnit
                          ? `${stepResult.durationMinutesPerUnit} min/eenheid`
                          : '—'}
                      </span>
                    </div>
                  )}

                  {isBottleneck && (
                    <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 mt-1">
                      <span className="font-black text-sm">⬛</span>
                      <span className="font-semibold">Flessenhals — beperkt de doorvoer</span>
                    </div>
                  )}

                  {!isBottleneck && isResourceStep && utilizationPct !== null && utilizationPct < 90 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Voldoende capaciteit beschikbaar</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic text-center py-2">
                  Stel een scenario met vraag in om KPIs te zien
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
            Verwijder
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
  const stepResultByNodeId = new Map<string, StepResult>();
  const activeResult = state.latestRunResult?.baseline;
  const bottleneckStepId = activeResult?.bottleneck?.stepId ?? null;
  if (activeResult?.steps) {
    for (const s of activeResult.steps) {
      stepResultByNodeId.set(s.stepId, s);
    }
  }

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
    if (srcNode.nodeType === 'start' && tgtNode.nodeType === 'start') return; // no start→start

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
              <button className="p-2 hover:bg-slate-50 rounded-md text-slate-500 transition-colors" title="Selecteer">
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-slate-50 rounded-md text-slate-500 transition-colors" title="Verplaats">
                <Move className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-slate-200 mx-1 self-center" />
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 rounded-md text-sm font-bold text-white transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Toevoegen
              </button>
            </div>

            {/* Topology counts */}
            <div className="bg-white rounded-lg shadow-card border border-slate-200 px-3 py-1.5 flex items-center gap-3 pointer-events-auto text-xs text-slate-500">
              <span className={sourceCount === 1 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                {sourceCount}× Bron
              </span>
              <span className={sinkCount === 1 ? 'text-slate-600' : 'text-red-500 font-semibold'}>
                {sinkCount}× Sink
              </span>
              {orphanCount > 0 && (
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {orphanCount} zwevend
                </span>
              )}
              {orphanCount === 0 && sourceCount === 1 && sinkCount === 1 && (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Geldig
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
                <span className="text-xs font-bold">Verwijder ({multiSelectedNodeIds.length})</span>
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
          {nodes.map(node => (
            <NodeComponent
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              isMultiSelected={multiSelectedNodeIds.includes(node.id)}
              stepResult={stepResultByNodeId.get(node.id)}
              isBottleneck={bottleneckStepId === node.id}
              onMouseDown={handleMouseDown}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation();
                setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'node', targetId: node.id });
              }}
              onPortMouseDown={handlePortMouseDown}
              onMouseUp={handleNodeMouseUp}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <NodeDetailPanel
          key={selectedNode.id}
          node={selectedNode}
          stepResult={stepResultByNodeId.get(selectedNode.id)}
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
            <Trash2 className="w-3.5 h-3.5" /> Verwijder
          </button>
        </div>
      )}
    </div>
  );
};
