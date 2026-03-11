import React, { useState, useEffect, useCallback } from 'react';
import { useAppState } from './src/state/store';
import { selectResourceUsage } from './src/state/selectors';
import {
  Search, Plus, Trash2, Database, Copy, Tag, X, BookmarkCheck, ChevronDown,
  Info,
} from 'lucide-react';
import type { Resource, ResourceClass, ProcessingMode, TransportMode, DelayMode } from './src/state/types';
import { computeCapacityPreview, type CapacityPreview } from './src/utils/capacityCalculation';
import { ProcessElementCreationFlow } from './ProcessElementCreationFlow';
import { NumericInput } from './src/components/NumericInput';

// ---------------------------------------------------------------------------
// Type labels (Canonical Naming Contract)
// ---------------------------------------------------------------------------

export function getResourceClassLabel(
  resourceClass: ResourceClass | undefined,
  processingMode?: ProcessingMode,
  transportMode?: TransportMode
): string {
  const cls = resourceClass ?? 'processing';
  if (cls === 'processing') {
    if (processingMode === 'batch') return 'Batch';
    if (processingMode === 'manual') return 'Manual / Labor';
    return 'Continuous / Machine';
  }
  if (cls === 'buffer') return 'Buffer';
  if (cls === 'transport') {
    return transportMode === 'continuous' ? 'Continuous Transport' : 'Trip-based Transport';
  }
  if (cls === 'delay') return 'Technical Delay';
  return 'Processing';
}

const CLASS_FILTER_LABELS: Record<string, string> = {
  All: 'All',
  processing: 'Processing',
  buffer: 'Buffer',
  transport: 'Transport',
  delay: 'Delay',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateDraft(draft: Partial<Resource>, deptIds: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const cls = draft.resourceClass ?? 'processing';

  // Department required for everything except delay
  if (cls !== 'delay') {
    if (!draft.departmentId || !deptIds.includes(draft.departmentId)) {
      errors.departmentId = 'Select a department';
    }
  }

  if (cls === 'processing') {
    const mode = draft.processingMode ?? 'continuous';
    if (mode === 'continuous' || mode === 'manual') {
      if (!draft.outputPerHour || draft.outputPerHour <= 0) {
        errors.outputPerHour = mode === 'manual'
          ? 'Cycle time is required and must be greater than 0'
          : 'Required and must be greater than 0';
      }
    }
    if (mode === 'batch') {
      if (!draft.batchSize || draft.batchSize <= 0) errors.batchSize = 'Required and must be greater than 0';
      if (!draft.cycleTimeMinutes || draft.cycleTimeMinutes < 0.1) errors.cycleTimeMinutes = 'Required and must be ≥ 0.1 min';
    }
  }

  if (cls === 'buffer') {
    if (!draft.slotCapacity || draft.slotCapacity <= 0) errors.slotCapacity = 'Maximum capacity is required and must be greater than 0';
    if (!draft.dwellTimeMinutes || draft.dwellTimeMinutes < 1) errors.dwellTimeMinutes = 'Dwell time is required (min. 1 minute)';
  }

  if (cls === 'transport') {
    const tmode = draft.transportMode ?? 'discrete';
    if (tmode === 'discrete') {
      if (!draft.unitsPerTrip || draft.unitsPerTrip <= 0) errors.unitsPerTrip = 'Load per trip is required and must be greater than 0';
      if (!draft.tripDurationMinutes || draft.tripDurationMinutes < 1) errors.tripDurationMinutes = 'Round-trip time is required (min. 1 minute)';
    } else {
      if (!draft.outputPerHour || draft.outputPerHour <= 0) errors.outputPerHour = 'Required and must be greater than 0';
    }
  }

  if (cls === 'delay') {
    if (!draft.delayTimeMinutes || draft.delayTimeMinutes < 0.1) {
      errors.delayTimeMinutes = 'Wait time is required (min. 0.1 minute)';
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Small reusable field components
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  tooltip?: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, required, error, tooltip, children }) => (
  <div>
    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
      {label}
      {required && <span className="text-red-500">*</span>}
      {tooltip && (
        <span className="group relative inline-flex">
          <Info className="w-3 h-3 text-slate-400 cursor-help" />
          <span className="absolute left-4 top-0 z-20 hidden group-hover:block w-56 text-xs font-normal normal-case tracking-normal bg-slate-800 text-white rounded-md px-2 py-1.5 shadow-lg">
            {tooltip}
          </span>
        </span>
      )}
    </label>
    {children}
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
);

const inputCls = (error?: string) =>
  `w-full px-3 py-2 bg-white border rounded-md text-sm focus:outline-none focus:ring-1 ${
    error
      ? 'border-red-400 focus:ring-red-400'
      : 'border-slate-200 focus:ring-brand-500 focus:border-brand-500'
  }`;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ResourcesProps {
  onNavigate?: (tab: string) => void;
}

export const Resources: React.FC<ResourcesProps> = ({ onNavigate }) => {
  const {
    state,
    addResource,
    deleteResource,
    updateResource,
    markAsTemplate,
    unmarkTemplate,
    instantiateFromTemplate,
    assignTagToResource,
    removeTagFromResource,
  } = useAppState();

  // Filters
  const [typeFilter, setTypeFilter] = useState<'All' | ResourceClass>('All');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Detail draft
  const [draft, setDraft] = useState<Resource | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // New resource creation flow
  const [showCreationFlow, setShowCreationFlow] = useState(false);

  // Instantiate dialog (legacy copy)
  const [showInstDialog, setShowInstDialog] = useState(false);
  const [instName, setInstName] = useState('');

  // Tag input
  const [newTag, setNewTag] = useState('');

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const deptIds = state.departments.map(d => d.id);

  const filteredResources = state.resources.filter(r => {
    const cls = r.resourceClass ?? 'processing';
    const typeMatch = typeFilter === 'All' || cls === typeFilter;
    const deptMatch = deptFilter === 'All' || r.departmentId === deptFilter;
    const searchLower = search.toLowerCase();
    const textMatch =
      r.name.toLowerCase().includes(searchLower) ||
      (r.tags ?? []).some(t => t.toLowerCase().includes(searchLower));
    return typeMatch && deptMatch && textMatch;
  });

  const selectedResource = state.resources.find(r => r.id === selectedId) ?? null;

  // When selection changes, reset draft
  useEffect(() => {
    if (!selectedId) { setDraft(null); setErrors({}); setIsDirty(false); return; }
    const res = state.resources.find(r => r.id === selectedId);
    if (res) { setDraft({ ...res }); setErrors({}); setIsDirty(false); }
  }, [selectedId]); // intentionally only on selectedId change

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // -------------------------------------------------------------------------
  // Draft helpers
  // -------------------------------------------------------------------------

  const patchDraft = <K extends keyof Resource>(key: K, value: Resource[K]) => {
    if (!draft) return;
    const updated = { ...draft, [key]: value };

    // When processingMode changes on processing class, clear incompatible fields
    if (key === 'processingMode') {
      if (value === 'continuous' || value === 'manual') {
        updated.batchSize = undefined;
        updated.cycleTimeMinutes = undefined;
      } else if (value === 'batch') {
        updated.outputPerHour = undefined;
      }
    }

    // When transportMode changes, clear incompatible fields
    if (key === 'transportMode') {
      if (value === 'continuous') {
        updated.unitsPerTrip = undefined;
        updated.tripDurationMinutes = undefined;
      } else {
        updated.outputPerHour = undefined;
      }
    }

    setDraft(updated);
    setIsDirty(true);
    setErrors(validateDraft(updated, deptIds));
  };

  // For manual mode: UI shows cycle time (min/unit), we compute outputPerHour
  const setCycleTimeForManual = (cycleMin: number | undefined) => {
    if (!draft) return;
    const updated = {
      ...draft,
      cycleTimeMinutes: cycleMin,
      outputPerHour: cycleMin && cycleMin > 0 ? 60 / cycleMin : undefined,
    };
    setDraft(updated);
    setIsDirty(true);
    setErrors(validateDraft(updated, deptIds));
  };

  const handleSave = () => {
    if (!draft) return;
    const errs = validateDraft(draft, deptIds);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    updateResource(draft);
    setIsDirty(false);

    // Change-impact toast
    const usage = selectResourceUsage(draft.id, state.nodes, state.edges, state.scenarios, state.latestRunResult);
    if (usage && usage.usageCount > 0) {
      const bottleneckNote = usage.wasBottleneckIn.length > 0 ? ' — this element was a bottleneck.' : '';
      showToast(`Saved. Used in ${usage.usageCount} step(s) — recalculate to update results.${bottleneckNote}`);
    } else {
      showToast('Opgeslagen');
    }
  };

  const handleDiscard = () => {
    if (selectedResource) { setDraft({ ...selectedResource }); setErrors({}); setIsDirty(false); }
  };

  // -------------------------------------------------------------------------
  // Create new resource (via ProcessElementCreationFlow modal)
  // -------------------------------------------------------------------------

  const handleCreateResource = (resource: Omit<Resource, 'id'>) => {
    const newId = addResource(resource);
    setSelectedId(newId);
    showToast(`'${resource.name}' created`);
  };

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  const handleAddTag = () => {
    if (!draft || !newTag.trim()) return;
    const tag = newTag.trim().toLowerCase();
    const existing = draft.tags ?? [];
    if (existing.includes(tag)) { setNewTag(''); return; }
    assignTagToResource(draft.id, tag);
    setDraft({ ...draft, tags: [...existing, tag] });
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!draft) return;
    removeTagFromResource(draft.id, tag);
    setDraft({ ...draft, tags: (draft.tags ?? []).filter(t => t !== tag) });
  };

  // -------------------------------------------------------------------------
  // Template actions (legacy)
  // -------------------------------------------------------------------------

  const handleToggleTemplate = () => {
    if (!draft) return;
    if (draft.isTemplate) {
      unmarkTemplate(draft.id);
      setDraft({ ...draft, isTemplate: false });
      showToast('Removed from library');
    } else {
      markAsTemplate(draft.id);
      setDraft({ ...draft, isTemplate: true });
      showToast('Saved as template');
    }
  };

  const handleInstantiate = () => {
    if (!selectedResource) return;
    setInstName(`${selectedResource.name} (copy)`);
    setShowInstDialog(true);
  };

  const confirmInstantiate = () => {
    if (!selectedResource || !instName.trim()) return;
    const newId = instantiateFromTemplate(selectedResource.id, instName.trim());
    setShowInstDialog(false);
    setInstName('');
    setSelectedId(newId);
    showToast(`'${instName.trim()}' created`);
  };

  // -------------------------------------------------------------------------
  // Capacity preview
  // -------------------------------------------------------------------------

  const avgDeptHoursPerDay = (() => {
    if (!draft || !draft.departmentId) return null;
    const dept = state.departments.find(d => d.id === draft.departmentId);
    if (!dept) return null;
    const days = Object.values(dept.hoursByWeekday).filter(h => h > 0).length || 1;
    return dept.availableHoursPerWeek / days;
  })();

  const preview = draft ? computeCapacityPreview(draft, avgDeptHoursPerDay) : null;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const hasErrors = Object.keys(errors).length > 0;
  const canSave = isDirty && !hasErrors;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-full gap-0 overflow-hidden">

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 overflow-hidden shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-brand-600" /> Library
            </h3>
            <button
              onClick={() => setShowCreationFlow(true)}
              title="New element"
              className="p-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-md transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Name or tag..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Type filter */}
          <div className="flex gap-1 flex-wrap mb-2">
            {(['All', 'processing', 'buffer', 'transport', 'delay'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all border ${
                  typeFilter === f
                    ? 'bg-brand-600 border-brand-700 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {CLASS_FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {/* Department filter */}
          {state.departments.length > 0 && (
            <div className="relative">
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="All">All departments</option>
                {state.departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Resource list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredResources.length > 0 ? (
            filteredResources.map(res => {
              const cls = res.resourceClass ?? 'processing';
              const clsLabel = getResourceClassLabel(cls, res.processingMode, res.transportMode);
              const dept = state.departments.find(d => d.id === res.departmentId);
              return (
                <div
                  key={res.id}
                  onClick={() => setSelectedId(res.id)}
                  className={`p-3 cursor-pointer transition-all border-l-4 hover:bg-slate-50 ${
                    selectedId === res.id
                      ? 'bg-brand-50/30 border-l-brand-600'
                      : 'border-l-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate text-slate-800">{res.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{clsLabel}</span>
                        {dept && <span className="text-[9px] text-slate-400">{dept.name}</span>}
                        {cls === 'delay' && (
                          <span className="text-[9px] font-bold text-violet-600 uppercase bg-violet-50 px-1 py-0.5 rounded">
                            Delay
                          </span>
                        )}
                        {res.isTemplate && (
                          <span className="text-[9px] font-bold text-amber-600 uppercase bg-amber-50 px-1 py-0.5 rounded">
                            Template
                          </span>
                        )}
                        {res.templateSourceId && (
                          <span className="text-[9px] font-bold text-sky-600 uppercase bg-sky-50 px-1 py-0.5 rounded">
                            Kopie
                          </span>
                        )}
                      </div>
                      {res.tags && res.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {res.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                          {res.tags.length > 3 && (
                            <span className="text-[9px] text-slate-400">+{res.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs">No elements found</div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Detail panel                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        {draft ? (
          <>
            {/* Detail header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
                  <Database className="w-4.5 h-4.5 text-brand-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {getResourceClassLabel(draft.resourceClass, draft.processingMode, draft.transportMode)}
                    {draft.isTemplate ? ' · Library Template' : draft.templateSourceId ? ' · Template copy' : ''}
                  </p>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">{draft.name}</h3>
                </div>
              </div>

              {/* Save / Discard */}
              <div className="flex items-center gap-2">
                {isDirty && (
                  <button
                    onClick={handleDiscard}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                    canSave
                      ? 'bg-brand-600 hover:bg-brand-700 text-white'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Save
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-5">

                {/* Validation summary */}
                {hasErrors && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-red-700 mb-1">Fix the following errors to save:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {Object.values(errors).map((e, i) => (
                        <li key={i} className="text-xs text-red-600">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ---- Name ---- */}
                <Field label="Name">
                  <input
                    type="text"
                    value={draft.name}
                    onChange={e => patchDraft('name', e.target.value)}
                    className={inputCls()}
                  />
                </Field>

                {/* ---- Type + Sub-type ---- */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Class badge (immutable after creation) */}
                  <Field label="Type">
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
                      {getResourceClassLabel(draft.resourceClass, draft.processingMode, draft.transportMode)}
                    </div>
                  </Field>

                  {/* Sub-type selector — processing sub-mode */}
                  {(draft.resourceClass === 'processing' || draft.resourceClass == null) && (
                    <Field label="Processing mode">
                      <div className="relative">
                        <select
                          value={draft.processingMode ?? 'continuous'}
                          onChange={e => patchDraft('processingMode', e.target.value as ProcessingMode)}
                          className={`${inputCls()} appearance-none pr-8`}
                        >
                          <option value="continuous">Continuous / Machine</option>
                          <option value="manual">Manual / Labor</option>
                          <option value="batch">Batch</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </Field>
                  )}

                  {/* Sub-type selector — transport mode */}
                  {draft.resourceClass === 'transport' && (
                    <Field label="Transport mode">
                      <div className="relative">
                        <select
                          value={draft.transportMode ?? 'discrete'}
                          onChange={e => patchDraft('transportMode', e.target.value as TransportMode)}
                          className={`${inputCls()} appearance-none pr-8`}
                        >
                          <option value="discrete">Trip-based Transport</option>
                          <option value="continuous">Continuous Transport</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </Field>
                  )}
                </div>

                {/* ---- Department (not for delay) ---- */}
                {draft.resourceClass !== 'delay' && (
                  <Field label="Department" required error={errors.departmentId}>
                    <div className="relative">
                      <select
                        value={draft.departmentId ?? ''}
                        onChange={e => patchDraft('departmentId', e.target.value)}
                        className={`${inputCls(errors.departmentId)} appearance-none pr-8`}
                      >
                        <option value="">-- Select department --</option>
                        {state.departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </Field>
                )}

                {/* ---------------------------------------------------------------- */}
                {/* TYPE-SPECIFIC FIELDS                                              */}
                {/* ---------------------------------------------------------------- */}

                {/* Processing: Continuous / Machine */}
                {(draft.resourceClass === 'processing' || draft.resourceClass == null) &&
                  (draft.processingMode === 'continuous' || draft.processingMode == null) && (
                  <Field label="Output per hour" required error={errors.outputPerHour}>
                    <div className="flex items-center gap-2">
                      <NumericInput
                        min={0} step={1}
                        value={draft.outputPerHour}
                        onChange={v => patchDraft('outputPerHour', v)}
                        placeholder="e.g. 50"
                        className={`${inputCls(errors.outputPerHour)} flex-1`}
                      />
                      <span className="text-xs text-slate-500 whitespace-nowrap">units/hour</span>
                    </div>
                  </Field>
                )}

                {/* Processing: Manual / Labor */}
                {(draft.resourceClass === 'processing' || draft.resourceClass == null) &&
                  draft.processingMode === 'manual' && (
                  <Field
                    label="Cycle time"
                    required
                    error={errors.outputPerHour}
                    tooltip="Time per unit in minutes. Engine calculates: output/hour = 60 / cycle time"
                  >
                    <div className="flex items-center gap-2">
                      <NumericInput
                        min={0.1} step={0.1}
                        value={draft.cycleTimeMinutes ?? (draft.outputPerHour ? Math.round(6000 / draft.outputPerHour) / 100 : undefined)}
                        onChange={v => setCycleTimeForManual(v)}
                        placeholder="e.g. 6"
                        className={`${inputCls(errors.outputPerHour)} flex-1`}
                      />
                      <span className="text-xs text-slate-500 whitespace-nowrap">min/unit</span>
                    </div>
                  </Field>
                )}

                {/* Processing: Batch */}
                {(draft.resourceClass === 'processing' || draft.resourceClass == null) &&
                  draft.processingMode === 'batch' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Batch size" required error={errors.batchSize}>
                        <div className="flex items-center gap-2">
                          <NumericInput
                            min={1} step={1} integer
                            value={draft.batchSize}
                            onChange={v => patchDraft('batchSize', v)}
                            placeholder="e.g. 100"
                            className={`${inputCls(errors.batchSize)} flex-1`}
                          />
                          <span className="text-xs text-slate-500">units</span>
                        </div>
                      </Field>
                      <Field
                        label="Batch cycle time"
                        required
                        error={errors.cycleTimeMinutes}
                        tooltip="Includes all thermal and processing time"
                      >
                        <div className="flex items-center gap-2">
                          <NumericInput
                            min={0.1} step={1}
                            value={draft.cycleTimeMinutes}
                            onChange={v => patchDraft('cycleTimeMinutes', v)}
                            placeholder="e.g. 30"
                            className={`${inputCls(errors.cycleTimeMinutes)} flex-1`}
                          />
                          <span className="text-xs text-slate-500">minutes</span>
                        </div>
                      </Field>
                    </div>
                    <Field
                      label="Setup time per batch"
                      tooltip="Setup work per batch (loading, alignment, etc.)"
                    >
                      <div className="flex items-center gap-2">
                        <NumericInput
                          min={0} step={1}
                          value={draft.batchSetupMinutes}
                          onChange={v => patchDraft('batchSetupMinutes', v)}
                          placeholder="e.g. 5"
                          className={`${inputCls()} flex-1`}
                        />
                        <span className="text-xs text-slate-500">minutes</span>
                      </div>
                    </Field>
                  </>
                )}

                {/* Transport: Trip-based */}
                {draft.resourceClass === 'transport' && (draft.transportMode === 'discrete' || draft.transportMode == null) && (
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      label="Load per trip"
                      required
                      error={errors.unitsPerTrip}
                      tooltip="Units per trip"
                    >
                      <div className="flex items-center gap-2">
                        <NumericInput
                          min={1} step={1}
                          value={draft.unitsPerTrip}
                          onChange={v => patchDraft('unitsPerTrip', v)}
                          placeholder="e.g. 200"
                          className={`${inputCls(errors.unitsPerTrip)} flex-1`}
                        />
                        <span className="text-xs text-slate-500">units</span>
                      </div>
                    </Field>
                    <Field
                      label="Rondrittijd"
                      required
                      error={errors.tripDurationMinutes}
                      tooltip="Total round-trip time including loading and unloading"
                    >
                      <div className="flex items-center gap-2">
                        <NumericInput
                          min={1} step={1}
                          value={draft.tripDurationMinutes}
                          onChange={v => patchDraft('tripDurationMinutes', v)}
                          placeholder="e.g. 8"
                          className={`${inputCls(errors.tripDurationMinutes)} flex-1`}
                        />
                        <span className="text-xs text-slate-500">minutes</span>
                      </div>
                    </Field>
                  </div>
                )}

                {/* Transport: Continu */}
                {draft.resourceClass === 'transport' && draft.transportMode === 'continuous' && (
                  <Field label="Throughput" required error={errors.outputPerHour}>
                    <div className="flex items-center gap-2">
                      <NumericInput
                        min={0} step={1}
                        value={draft.outputPerHour}
                        onChange={v => patchDraft('outputPerHour', v)}
                        placeholder="e.g. 300"
                        className={`${inputCls(errors.outputPerHour)} flex-1`}
                      />
                      <span className="text-xs text-slate-500 whitespace-nowrap">units/hour</span>
                    </div>
                  </Field>
                )}

                {/* Buffer fields */}
                {draft.resourceClass === 'buffer' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="Maximum capacity"
                        required
                        error={errors.slotCapacity}
                        tooltip="Maximum units that can be stored in this buffer"
                      >
                        <NumericInput
                          min={1} step={1} integer
                          value={draft.slotCapacity}
                          onChange={v => patchDraft('slotCapacity', v)}
                          placeholder="e.g. 500"
                          className={inputCls(errors.slotCapacity)}
                        />
                      </Field>
                      <Field label="Unit">
                        <input
                          type="text"
                          value={draft.slotUnit ?? ''}
                          onChange={e => patchDraft('slotUnit', e.target.value || undefined)}
                          placeholder="kg / units / liters"
                          className={inputCls()}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="Verblijftijd"
                        required
                        error={errors.dwellTimeMinutes}
                        tooltip="Average time product stays in the buffer"
                      >
                        <div className="flex items-center gap-2">
                          <NumericInput
                            min={1} step={1}
                            value={draft.dwellTimeMinutes}
                            onChange={v => patchDraft('dwellTimeMinutes', v)}
                            placeholder="e.g. 120"
                            className={`${inputCls(errors.dwellTimeMinutes)} flex-1`}
                          />
                          <span className="text-xs text-slate-500">min</span>
                        </div>
                      </Field>
                      <Field label="Veiligheidsreserve">
                        <div className="flex items-center gap-2">
                          <NumericInput
                            min={0} max={50} step={1}
                            value={draft.safetyMarginPct ?? 0}
                            onChange={v => patchDraft('safetyMarginPct', v ?? 0)}
                            className={`${inputCls()} flex-1`}
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </Field>
                    </div>
                    <Field label="Max wait time (optional)">
                      <div className="flex items-center gap-2">
                        <NumericInput
                          min={1} step={1}
                          value={draft.maxHoldMinutes}
                          onChange={v => patchDraft('maxHoldMinutes', v)}
                          placeholder="No limit"
                          className={`${inputCls()} flex-1`}
                        />
                        <span className="text-xs text-slate-500">min</span>
                      </div>
                    </Field>
                  </>
                )}

                {/* Delay fields */}
                {draft.resourceClass === 'delay' && (
                  <>
                    <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5 text-xs text-violet-700">
                      Technical Delay has no department — it limits throughput but does not consume capacity.
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Wait time" required error={errors.delayTimeMinutes} tooltip="Technical wait time per unit (e.g., cooling, drying, curing)">
                        <div className="flex items-center gap-2">
                          <NumericInput
                            min={0.1} step={1}
                            value={draft.delayTimeMinutes}
                            onChange={v => patchDraft('delayTimeMinutes', v)}
                            placeholder="e.g. 120"
                            className={`${inputCls(errors.delayTimeMinutes)} flex-1`}
                          />
                          <span className="text-xs text-slate-500">min</span>
                        </div>
                      </Field>
                      <Field label="Delay mode">
                        <div className="relative">
                          <select
                            value={draft.delayMode ?? 'per_unit'}
                            onChange={e => patchDraft('delayMode', e.target.value as DelayMode)}
                            className={`${inputCls()} appearance-none pr-8`}
                          >
                            <option value="per_unit">Per unit</option>
                            <option value="per_batch">Per batch</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                      </Field>
                    </div>
                  </>
                )}

                {/* ---------------------------------------------------------------- */}
                {/* PARALLEL UNITS (not for buffer, not for delay)                   */}
                {/* ---------------------------------------------------------------- */}
                {draft.resourceClass !== 'buffer' && draft.resourceClass !== 'delay' && (
                  <Field
                    label="Parallel units active"
                    tooltip="How many machines, workers, or resources perform this step in parallel"
                  >
                    <div className="flex items-center gap-2">
                      <NumericInput
                        min={1} step={1} integer
                        value={draft.parallelUnits ?? 1}
                        onChange={v => patchDraft('parallelUnits', v ?? 1)}
                        className={`${inputCls()} flex-1`}
                      />
                      <span className="text-xs text-slate-500">units</span>
                    </div>
                  </Field>
                )}

                {/* ---------------------------------------------------------------- */}
                {/* PERFORMANCE FACTORS (not for delay)                                */}
                {/* ---------------------------------------------------------------- */}
                {draft.resourceClass !== 'delay' && (
                  <div className="border border-slate-100 rounded-lg p-4 space-y-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Performance factors</p>

                    <Field
                      label="Availability"
                      tooltip="Effective usable time (e.g. 0.90 = 90% available due to downtime and maintenance)"
                    >
                      <div className="flex items-center gap-2">
                        <NumericInput
                          min={0.01} max={1} step={0.01}
                          value={draft.availability ?? 1}
                          onChange={v => patchDraft('availability', v ?? 1)}
                          className={`${inputCls()} flex-1`}
                        />
                        <span className="text-xs text-slate-500">0–1</span>
                      </div>
                    </Field>

                    {/* Yield — processing only */}
                    {(draft.resourceClass === 'processing' || draft.resourceClass == null) && (
                      <Field
                        label="First Pass Yield"
                        tooltip="Output percentage without scrap or rework (100% = no scrap)"
                      >
                        <div className="flex items-center gap-2">
                          <NumericInput
                            min={0.1} max={100} step={1}
                            value={draft.yieldPct ?? 100}
                            onChange={v => patchDraft('yieldPct', v ?? 100)}
                            className={`${inputCls()} flex-1`}
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </Field>
                    )}

                    {/* Startup — processing only */}
                    {(draft.resourceClass === 'processing' || draft.resourceClass == null) && (
                      <Field
                        label="Daily startup time"
                        tooltip="Daily time loss due to startup or setup (e.g. warm-up, calibration)"
                      >
                        <div className="flex items-center gap-2">
                          <NumericInput
                            min={0} step={1}
                            value={draft.dailyStartupMinutes ?? 0}
                            onChange={v => patchDraft('dailyStartupMinutes', v ?? 0)}
                            className={`${inputCls()} flex-1`}
                          />
                          <span className="text-xs text-slate-500">min/day</span>
                        </div>
                      </Field>
                    )}
                  </div>
                )}

                {/* ---------------------------------------------------------------- */}
                {/* CAPACITY PREVIEW                                                  */}
                {/* ---------------------------------------------------------------- */}
                {preview && (
                  <div className="border border-slate-100 rounded-lg p-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Capacity preview</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 rounded-md p-3">
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Theoretical throughput</p>
                        <p className="text-lg font-bold text-slate-700">
                          {preview.theoreticalRate !== null
                            ? `${preview.theoreticalRate.toFixed(1)}`
                            : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400">units/hour</p>
                      </div>
                      <div className="bg-brand-50 rounded-md p-3">
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Effective throughput</p>
                        <p className="text-lg font-bold text-brand-700">
                          {preview.effectiveRate !== null
                            ? `${preview.effectiveRate.toFixed(1)}`
                            : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400">units/hour</p>
                      </div>
                    </div>
                    {/* Warnings */}
                    {preview.warnings.map((w, i) => (
                      <div key={i} className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">{w}</p>
                      </div>
                    ))}
                    {/* Department warning for non-delay */}
                    {draft.resourceClass !== 'delay' && !draft.departmentId && (
                      <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">No department selected — add a department for an accurate calculation</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ---- Description ---- */}
                <Field label="Description (optional)">
                  <textarea
                    rows={2}
                    value={draft.description ?? ''}
                    onChange={e => patchDraft('description', e.target.value || undefined)}
                    placeholder="Short description..."
                    className={`${inputCls()} resize-none`}
                  />
                </Field>

                {/* ---- Tags ---- */}
                <Field label="Tags">
                  <div className="space-y-2">
                    {draft.tags && draft.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {draft.tags.map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full"
                          >
                            <Tag className="w-2.5 h-2.5 text-slate-400" />
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(tag)}
                              className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add tag..."
                        value={newTag}
                        onChange={e => setNewTag(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                        className={`${inputCls()} flex-1 text-xs`}
                      />
                      <button
                        onClick={handleAddTag}
                        disabled={!newTag.trim()}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </Field>

                {/* ---- Library actions ---- */}
                <div className="border-t border-slate-100 pt-5 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Library actions</p>
                  <button
                    onClick={handleToggleTemplate}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      draft.isTemplate
                        ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <BookmarkCheck className={`w-4 h-4 ${draft.isTemplate ? 'text-amber-600' : 'text-slate-400'}`} />
                    {draft.isTemplate ? 'Remove from library' : 'Save as template'}
                  </button>
                  {draft.isTemplate && (
                    <button
                      onClick={handleInstantiate}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
                    >
                      <Copy className="w-4 h-4 text-slate-400" />
                      Create copy from template
                    </button>
                  )}
                  {draft.templateSourceId && (
                    <div className="bg-sky-50 border border-sky-100 rounded-lg px-4 py-2.5">
                      <p className="text-xs text-sky-700">
                        Created from template{' '}
                        <span className="font-semibold">
                          {state.resources.find(r => r.id === draft.templateSourceId)?.name ?? draft.templateSourceId}
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* ---- Delete ---- */}
                <div className="border-t border-slate-100 pt-4">
                  <button
                    onClick={() => {
                      if (window.confirm(`Element "${draft.name}" permanently delete?`)) {
                        deleteResource(draft.id);
                        setSelectedId(null);
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-md font-medium text-sm hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete element
                  </button>
                </div>

              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center text-center p-12">
            <div>
              <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <h3 className="text-base font-bold text-slate-900 mb-2">No element selected</h3>
              <p className="text-sm text-slate-500 max-w-xs mb-5">
                Select an element from the list or create a new one.
              </p>
              <button
                onClick={() => setShowCreationFlow(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-md text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" /> New element
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Process Element Creation Flow modal                                   */}
      {/* ------------------------------------------------------------------ */}
      {showCreationFlow && (
        <ProcessElementCreationFlow
          departments={state.departments}
          onCreateResource={handleCreateResource}
          onClose={() => setShowCreationFlow(false)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Instantiate dialog (legacy copy)                                     */}
      {/* ------------------------------------------------------------------ */}
      {showInstDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-bold text-slate-900 mb-1">Create copy</h3>
            <p className="text-xs text-slate-500 mb-4">Enter a name for the new element. All settings will be copied.</p>
            <input
              type="text"
              value={instName}
              onChange={e => setInstName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmInstantiate()}
              className={`${inputCls()} mb-4`}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowInstDialog(false)}
                className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmInstantiate}
                disabled={!instName.trim()}
                className="px-4 py-1.5 text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Toast                                                                */}
      {/* ------------------------------------------------------------------ */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg max-w-sm">
          {toast}
        </div>
      )}
    </div>
  );
};
