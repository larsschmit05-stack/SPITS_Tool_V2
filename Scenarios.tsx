
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Copy, Trash2, Plus, History, Edit2, Save, AlertCircle,
  Info, TrendingUp, Clock, Zap, Layers, Play, RotateCcw,
  Check, X, ChevronRight, Activity, Timer,
} from 'lucide-react';
import { useAppState } from './src/state/store';
import type { ScenarioPatch, ScenarioDemand, Scenario, Department, Resource, FlowNode, ProjectState } from './src/state/types';
import type { RunBundle } from './src/engine/types';
import { validateDemandForm, validateScenarioCompleteness } from './src/scenarios/validation';
import {
  countActiveOverrides,
  computeDelta,
  totalHoursPerWeek,
  resolvedDeptHours,
} from './src/scenarios/helpers';
import { run } from './src/engine/engine';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-lg border border-slate-200 shadow-sm p-6 ${className}`}>
    {children}
  </div>
);

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

type ScenarioTab = 'overview' | 'demand' | 'departments' | 'resources' | 'stepCapacity' | 'run';

const TABS: Array<{ id: ScenarioTab; label: string; icon: React.FC<any> }> = [
  { id: 'overview',      label: 'Overview',       icon: Info },
  { id: 'demand',        label: 'Demand',          icon: TrendingUp },
  { id: 'departments',   label: 'Departments',     icon: Clock },
  { id: 'resources',     label: 'Resources',       icon: Zap },
  { id: 'stepCapacity',  label: 'Step Capacity',   icon: Layers },
  { id: 'run',           label: 'Run & Results',   icon: Play },
];

const statusColors = {
  Ready:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  Incomplete: 'bg-amber-50 text-amber-700 border-amber-200',
  Invalid:    'bg-red-50 text-red-700 border-red-200',
};
const statusIcons = {
  Ready:      <Check className="w-3.5 h-3.5" />,
  Incomplete: <AlertCircle className="w-3.5 h-3.5" />,
  Invalid:    <X className="w-3.5 h-3.5" />,
};

// ---------------------------------------------------------------------------
// Tab 1 — Overview
// ---------------------------------------------------------------------------

const OverviewTab: React.FC<{
  scenario: Scenario;
  onUpdate: (patch: ScenarioPatch) => void;
  onGoToTab: (tab: ScenarioTab) => void;
  latestRun: RunBundle | null;
}> = ({ scenario, onUpdate, onGoToTab, latestRun }) => {
  const overrides = countActiveOverrides(scenario);
  const status = validateScenarioCompleteness(scenario);
  const lastRunAt = latestRun?.baseline?.generatedAt;

  return (
    <div className="space-y-6">
      {/* Status row */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-bold ${statusColors[status]}`}>
          {statusIcons[status]} {status}
        </span>
        {overrides.total > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
            <Activity className="w-3.5 h-3.5" />
            {overrides.total} active override{overrides.total !== 1 ? 's' : ''}
            {overrides.demand > 0 && <span className="text-slate-400">· demand</span>}
            {overrides.departments > 0 && <span className="text-slate-400">· {overrides.departments} dept{overrides.departments !== 1 ? 's' : ''}</span>}
            {overrides.resources > 0 && <span className="text-slate-400">· {overrides.resources} resource{overrides.resources !== 1 ? 's' : ''}</span>}
          </span>
        )}
        {lastRunAt && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-500">
            <Timer className="w-3.5 h-3.5" />
            Last run: {new Date(lastRunAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Name + Description */}
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Scenario Name</label>
          <input
            type="text"
            value={scenario.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="Scenario name..."
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Description</label>
          <textarea
            value={scenario.description ?? ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
            placeholder="Describe what this scenario tests..."
            rows={3}
          />
        </div>
      </div>

      {/* Quick-jump cards */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Configuration</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { tab: 'demand' as ScenarioTab, icon: TrendingUp, label: 'Demand', summary: scenario.demand ? `${scenario.demand.targetGoodUnits} units / ${scenario.demand.horizonCalendarDays} days` : 'Not configured' },
            { tab: 'departments' as ScenarioTab, icon: Clock, label: 'Departments', summary: overrides.departments > 0 ? `${overrides.departments} department${overrides.departments !== 1 ? 's' : ''} overridden` : 'Baseline hours' },
            { tab: 'resources' as ScenarioTab, icon: Zap, label: 'Resources', summary: overrides.resources > 0 ? `${overrides.resources} resource${overrides.resources !== 1 ? 's' : ''} overridden` : 'Baseline capacity' },
            { tab: 'stepCapacity' as ScenarioTab, icon: Layers, label: 'Step Capacity', summary: 'Bottleneck boosts' },
          ] as const).map(({ tab, icon: Icon, label, summary }) => (
            <button
              key={tab}
              onClick={() => onGoToTab(tab)}
              className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-brand-50 text-left transition-all group"
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-slate-400 group-hover:text-brand-500" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">{label}</div>
                  <div className="text-xs text-slate-500">{summary}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <div className="pt-2 border-t border-slate-100">
        <button
          onClick={() => onGoToTab('run')}
          disabled={status === 'Invalid'}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
            status === 'Invalid'
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : status === 'Incomplete'
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
              : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
          }`}
        >
          <Play className="w-4 h-4" />
          {status === 'Incomplete' ? 'Configure demand to run' : 'Run & Results →'}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 2 — Demand
// ---------------------------------------------------------------------------

const DemandTab: React.FC<{
  scenario: Scenario;
  onUpdate: (patch: ScenarioPatch) => void;
}> = ({ scenario, onUpdate }) => {
  const DEFAULT_UNITS = 500;
  const DEFAULT_DAYS = 14;

  const [local, setLocal] = useState<Partial<ScenarioDemand>>(
    scenario.demand ?? {
      targetGoodUnits: DEFAULT_UNITS,
      horizonCalendarDays: DEFAULT_DAYS,
      startDateISO: new Date().toISOString().slice(0, 10),
      timezone: 'Europe/Amsterdam',
    }
  );

  const enabled = !!scenario.demand;
  const errors = useMemo(() => validateDemandForm(local), [local]);

  // Sync if scenario demand changes externally
  useEffect(() => {
    if (scenario.demand) setLocal(scenario.demand);
  }, [scenario.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((key: keyof ScenarioDemand, value: any) => {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    if (
      updated.targetGoodUnits &&
      updated.horizonCalendarDays &&
      updated.startDateISO &&
      updated.timezone &&
      Object.keys(errors.errors).length === 0
    ) {
      onUpdate({ demand: updated as ScenarioDemand });
    }
  }, [local, errors, onUpdate]);

  const toggle = () => {
    if (enabled) {
      onUpdate({ demand: undefined });
    } else {
      const demand: ScenarioDemand = {
        targetGoodUnits: (local.targetGoodUnits as number) || DEFAULT_UNITS,
        horizonCalendarDays: (local.horizonCalendarDays as number) || DEFAULT_DAYS,
        startDateISO: local.startDateISO || new Date().toISOString().slice(0, 10),
        timezone: local.timezone || 'Europe/Amsterdam',
      };
      setLocal(demand);
      onUpdate({ demand });
    }
  };

  const reset = () => {
    onUpdate({ demand: undefined });
    setLocal({ targetGoodUnits: DEFAULT_UNITS, horizonCalendarDays: DEFAULT_DAYS, startDateISO: new Date().toISOString().slice(0, 10), timezone: 'Europe/Amsterdam' });
  };

  const unitsDelta = enabled && local.targetGoodUnits ? computeDelta(DEFAULT_UNITS, local.targetGoodUnits as number) : null;
  const daysDelta  = enabled && local.horizonCalendarDays ? computeDelta(DEFAULT_DAYS, local.horizonCalendarDays as number) : null;

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div>
          <p className="text-sm font-semibold text-slate-800">Demand Override</p>
          <p className="text-xs text-slate-500 mt-0.5">Configure scenario-specific demand parameters</p>
        </div>
        <button
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-brand-600' : 'bg-slate-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Fields */}
      <div className={`space-y-4 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Target Units</label>
            <input
              type="number"
              min="1"
              value={local.targetGoodUnits ?? ''}
              onChange={(e) => handleChange('targetGoodUnits', e.target.value ? parseInt(e.target.value) : '')}
              disabled={!enabled}
              className={`w-full bg-slate-50 border rounded-md px-3 py-2 text-sm ${
                errors.errors.targetGoodUnits ? 'border-red-400' : 'border-slate-200'
              } focus:ring-1 focus:ring-brand-500 outline-none`}
              placeholder="e.g., 500"
            />
            {errors.errors.targetGoodUnits && <p className="text-xs text-red-600 mt-1">{errors.errors.targetGoodUnits}</p>}
            {unitsDelta && <p className={`text-xs mt-1 font-medium ${unitsDelta.absolute >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {unitsDelta.absolute >= 0 ? '+' : ''}{unitsDelta.absolute} vs default ({unitsDelta.pct.toFixed(1)}%)
            </p>}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Horizon (Days)</label>
            <input
              type="number"
              min="1"
              value={local.horizonCalendarDays ?? ''}
              onChange={(e) => handleChange('horizonCalendarDays', e.target.value ? parseInt(e.target.value) : '')}
              disabled={!enabled}
              className={`w-full bg-slate-50 border rounded-md px-3 py-2 text-sm ${
                errors.errors.horizonCalendarDays ? 'border-red-400' : 'border-slate-200'
              } focus:ring-1 focus:ring-brand-500 outline-none`}
              placeholder="e.g., 14"
            />
            {errors.errors.horizonCalendarDays && <p className="text-xs text-red-600 mt-1">{errors.errors.horizonCalendarDays}</p>}
            {daysDelta && <p className={`text-xs mt-1 font-medium ${daysDelta.absolute >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {daysDelta.absolute >= 0 ? '+' : ''}{daysDelta.absolute} days vs default
            </p>}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Start Date</label>
            <input
              type="date"
              value={local.startDateISO ?? ''}
              onChange={(e) => handleChange('startDateISO', e.target.value)}
              disabled={!enabled}
              className={`w-full bg-slate-50 border rounded-md px-3 py-2 text-sm ${
                errors.errors.startDateISO ? 'border-red-400' : 'border-slate-200'
              } focus:ring-1 focus:ring-brand-500 outline-none`}
            />
            {errors.errors.startDateISO && <p className="text-xs text-red-600 mt-1">{errors.errors.startDateISO}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Timezone</label>
            <input
              type="text"
              value={local.timezone ?? ''}
              onChange={(e) => handleChange('timezone', e.target.value)}
              disabled={!enabled}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500 outline-none"
              placeholder="e.g., Europe/Amsterdam"
            />
          </div>
        </div>

        {enabled && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset demand to baseline
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 3 — Departments (Time)
// ---------------------------------------------------------------------------

const DepartmentsTab: React.FC<{
  scenario: Scenario;
  departments: Department[];
  onSetSchedule: (deptId: string, override: Partial<Department['hoursByWeekday']>) => void;
  onClearSchedule: (deptId: string) => void;
}> = ({ scenario, departments, onSetSchedule, onClearSchedule }) => {
  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-semibold text-slate-600">No departments configured</p>
        <p className="text-xs text-slate-400 mt-1">Add departments in the Departments section first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Override department operating hours per weekday. Validation: 0–24 hours per day (0–168 per week).
      </p>

      {departments.map((dept) => {
        const deptOverride = scenario.departmentScheduleOverrides?.[dept.id];
        const resolved = resolvedDeptHours(dept, deptOverride);
        const baselineTotal = totalHoursPerWeek(dept.hoursByWeekday);
        const scenarioTotal = totalHoursPerWeek(resolved);
        const totalDelta = computeDelta(baselineTotal, scenarioTotal);
        const isOverridden = !!deptOverride && Object.keys(deptOverride).length > 0;

        return (
          <DeptRow
            key={dept.id}
            dept={dept}
            deptOverride={deptOverride}
            resolved={resolved}
            baselineTotal={baselineTotal}
            scenarioTotal={scenarioTotal}
            totalDelta={totalDelta}
            isOverridden={isOverridden}
            onSetSchedule={onSetSchedule}
            onClearSchedule={onClearSchedule}
          />
        );
      })}
    </div>
  );
};

const DeptRow: React.FC<{
  dept: Department;
  deptOverride: Partial<Department['hoursByWeekday']> | undefined;
  resolved: Department['hoursByWeekday'];
  baselineTotal: number;
  scenarioTotal: number;
  totalDelta: { absolute: number; pct: number };
  isOverridden: boolean;
  onSetSchedule: (deptId: string, override: Partial<Department['hoursByWeekday']>) => void;
  onClearSchedule: (deptId: string) => void;
}> = ({ dept, deptOverride, resolved, baselineTotal, scenarioTotal, totalDelta, isOverridden, onSetSchedule, onClearSchedule }) => {
  const [localHours, setLocalHours] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const day of WEEKDAYS) {
      const overrideVal = deptOverride?.[day];
      init[day] = overrideVal !== undefined ? String(overrideVal) : '';
    }
    return init;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleDayChange = (day: string, raw: string) => {
    setLocalHours(prev => ({ ...prev, [day]: raw }));

    if (raw === '') {
      // Remove override for this day: rebuild override without this key
      const newOverride: Partial<Department['hoursByWeekday']> = { ...(deptOverride ?? {}) };
      delete (newOverride as any)[day];
      setErrors(prev => { const n = { ...prev }; delete n[day]; return n; });
      if (Object.keys(newOverride).length === 0) {
        onClearSchedule(dept.id);
      } else {
        onSetSchedule(dept.id, newOverride);
      }
      return;
    }

    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
      setErrors(prev => ({ ...prev, [day]: '0–24' }));
      return;
    }
    setErrors(prev => { const n = { ...prev }; delete n[day]; return n; });
    onSetSchedule(dept.id, { [day]: parsed } as Partial<Department['hoursByWeekday']>);
  };

  const handleReset = () => {
    setLocalHours(Object.fromEntries(WEEKDAYS.map(d => [d, ''])));
    setErrors({});
    onClearSchedule(dept.id);
  };

  return (
    <div className={`rounded-lg border p-4 transition-all ${isOverridden ? 'border-brand-300 bg-brand-50/30' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dept.color }} />
          <span className="font-semibold text-sm text-slate-800">{dept.name}</span>
          {isOverridden && (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-brand-100 text-brand-700">
              Overridden
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-slate-400">Baseline: </span>
            <span className="text-xs font-medium text-slate-600">{baselineTotal}h/wk</span>
            {isOverridden && (
              <>
                <span className="text-xs text-slate-400 mx-1">→</span>
                <span className="text-xs font-bold text-slate-800">{scenarioTotal}h/wk</span>
                <span className={`ml-1.5 text-xs font-bold ${totalDelta.absolute >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ({totalDelta.absolute >= 0 ? '+' : ''}{totalDelta.absolute}h)
                </span>
              </>
            )}
          </div>
          {isOverridden && (
            <button onClick={handleReset} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Reset to baseline">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => {
          const baseline = dept.hoursByWeekday[day];
          const overrideVal = localHours[day];
          const hasError = !!errors[day];
          const displayValue = overrideVal !== '' ? overrideVal : String(baseline);

          return (
            <div key={day} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">{WEEKDAY_LABELS[day]}</span>
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={displayValue}
                onChange={(e) => handleDayChange(day, e.target.value)}
                className={`w-full text-center text-xs rounded px-1 py-1.5 border ${
                  hasError
                    ? 'border-red-400 bg-red-50'
                    : overrideVal !== '' && parseFloat(overrideVal) !== baseline
                    ? 'border-brand-400 bg-brand-50 font-semibold'
                    : 'border-slate-200 bg-slate-50'
                } focus:ring-1 focus:ring-brand-500 outline-none`}
              />
              {hasError && <span className="text-[9px] text-red-500">{errors[day]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 4 — Resources (Speed & Capacity)
// ---------------------------------------------------------------------------

const ResourcesTab: React.FC<{
  scenario: Scenario;
  resources: Resource[];
  departments: Department[];
  flowResourceIds: Set<string>;
  onSetOverride: (resourceId: string, override: Partial<Omit<Resource, 'id' | 'departmentId'>>) => void;
  onClearOverride: (resourceId: string) => void;
}> = ({ scenario, resources, departments, flowResourceIds, onSetOverride, onClearOverride }) => {
  const flowResources = useMemo(
    () => (flowResourceIds.size > 0 ? resources.filter(r => flowResourceIds.has(r.id)) : resources),
    [resources, flowResourceIds]
  );

  if (flowResources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Zap className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-semibold text-slate-600">No resources in the flow</p>
        <p className="text-xs text-slate-400 mt-1">Add resource steps to your flow in the Process Builder first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {flowResourceIds.size > 0 && resources.length > flowResources.length && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          Showing {flowResources.length} of {resources.length} resources — only those referenced in the flow.
        </p>
      )}
      {flowResources.map((resource) => {
        const dept = departments.find(d => d.id === resource.departmentId);
        const override = scenario.resourceOverrides?.[resource.id];
        const isOverridden = !!override && Object.keys(override).length > 0;
        return (
          <ResourceRow
            key={resource.id}
            resource={resource}
            dept={dept}
            override={override}
            isOverridden={isOverridden}
            onSetOverride={onSetOverride}
            onClearOverride={onClearOverride}
          />
        );
      })}
    </div>
  );
};

const ResourceRow: React.FC<{
  resource: Resource;
  dept?: Department;
  override?: Partial<Omit<Resource, 'id' | 'departmentId'>>;
  isOverridden: boolean;
  onSetOverride: (resourceId: string, override: Partial<Omit<Resource, 'id' | 'departmentId'>>) => void;
  onClearOverride: (resourceId: string) => void;
}> = ({ resource, dept, override, isOverridden, onSetOverride, onClearOverride }) => {
  const [expanded, setExpanded] = useState(isOverridden);

  type FieldKey = 'parallelUnits' | 'availability' | 'yieldPct' | 'outputPerHour';

  const fields: Array<{ key: FieldKey; label: string; min: number; max: number; step: number; show: boolean; hint: string }> = [
    { key: 'parallelUnits', label: 'Parallel Units', min: 1, max: 100, step: 1, show: true, hint: 'Number of identical parallel units/machines' },
    { key: 'availability', label: 'Availability (0–1)', min: 0.01, max: 1, step: 0.01, show: true, hint: 'Machine uptime ratio' },
    { key: 'yieldPct', label: 'Yield %', min: 0.1, max: 100, step: 0.1, show: true, hint: 'Quality / yield percentage' },
    { key: 'outputPerHour', label: 'Output / Hour', min: 0.01, max: 99999, step: 0.01, show: resource.type !== 'batch', hint: 'Units produced per effective hour' },
  ].filter(f => f.show);

  const handleChange = (key: FieldKey, raw: string) => {
    if (raw === '') {
      // Remove this field from override
      if (!override) return;
      const next = { ...override };
      delete next[key];
      if (Object.keys(next).length === 0) {
        onClearOverride(resource.id);
      } else {
        onSetOverride(resource.id, next);
      }
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    onSetOverride(resource.id, { [key]: parsed });
  };

  const getBaselineVal = (key: FieldKey): number | undefined => (resource as any)[key];
  const getOverrideVal = (key: FieldKey): number | undefined => override?.[key as keyof typeof override] as number | undefined;

  return (
    <div className={`rounded-lg border transition-all ${isOverridden ? 'border-brand-300 bg-brand-50/30' : 'border-slate-200 bg-white'}`}>
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div>
            <span className="text-sm font-semibold text-slate-800">{resource.name}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
                {resource.type}
              </span>
              {dept && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color }} />
                  {dept.name}
                </span>
              )}
            </div>
          </div>
          {isOverridden && (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-brand-100 text-brand-700">
              Overridden
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOverridden && (
            <button
              onClick={(e) => { e.stopPropagation(); onClearOverride(resource.id); }}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
              title="Reset to baseline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            {fields.map(({ key, label, min, max, step, hint }) => {
              const baseline = getBaselineVal(key);
              const ov = getOverrideVal(key);
              const delta = ov !== undefined && baseline !== undefined ? computeDelta(baseline, ov) : null;

              return (
                <div key={key}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{label}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={ov !== undefined ? ov : (baseline ?? '')}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className={`w-full bg-slate-50 border rounded-md px-3 py-2 text-sm ${
                          ov !== undefined ? 'border-brand-400 bg-brand-50 font-medium' : 'border-slate-200'
                        } focus:ring-1 focus:ring-brand-500 outline-none`}
                      />
                    </div>
                    {ov !== undefined && (
                      <button
                        onClick={() => handleChange(key, '')}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        title="Reset this field"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {baseline !== undefined && (
                    <p className="text-xs text-slate-400 mt-1">Baseline: {baseline}</p>
                  )}
                  {delta && (
                    <p className={`text-xs font-medium mt-0.5 ${delta.absolute >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {delta.absolute >= 0 ? '+' : ''}{delta.absolute.toFixed(2)} ({delta.pct.toFixed(1)}%)
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 5 — Step Capacity (Extra Boost)
// ---------------------------------------------------------------------------

const StepCapacityTab: React.FC<{
  scenario: Scenario;
  nodes: FlowNode[];
  resources: Resource[];
  onSetOverride: (resourceId: string, override: Partial<Omit<Resource, 'id' | 'departmentId'>>) => void;
  onClearOverride: (resourceId: string) => void;
}> = ({ scenario, nodes, resources, onSetOverride, onClearOverride }) => {
  const resourceSteps = useMemo(
    () => nodes.filter(n => n.nodeType === 'resourceStep' && n.resourceId),
    [nodes]
  );

  if (resourceSteps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Layers className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-semibold text-slate-600">No resource steps in the flow</p>
        <p className="text-xs text-slate-400 mt-1">Add resource steps to your flow in the Process Builder first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Simulate adding extra machines or parallel capacity per process step.
        The override sets the total <strong>parallel units</strong> for the linked resource.
      </p>

      {resourceSteps.map((step) => {
        const resource = resources.find(r => r.id === step.resourceId);
        if (!resource) return null;
        const override = scenario.resourceOverrides?.[resource.id];
        const currentParallel = override?.parallelUnits ?? resource.parallelUnits;
        const isOverridden = override?.parallelUnits !== undefined;

        return (
          <div
            key={step.id}
            className={`rounded-lg border p-4 transition-all ${isOverridden ? 'border-brand-300 bg-brand-50/30' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{step.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Resource: <span className="font-medium">{resource.name}</span>
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Baseline: <strong>{resource.parallelUnits}</strong></span>
                  {isOverridden && (
                    <>
                      <span className="text-slate-400">→</span>
                      <span className="text-xs font-bold text-slate-800">Override: {currentParallel}</span>
                      <span className={`text-xs font-bold ${currentParallel >= resource.parallelUnits ? 'text-emerald-600' : 'text-red-600'}`}>
                        ({currentParallel >= resource.parallelUnits ? '+' : ''}{currentParallel - resource.parallelUnits})
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Parallel Units</label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  step="1"
                  value={currentParallel}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!Number.isFinite(v) || v < 1) return;
                    onSetOverride(resource.id, { parallelUnits: v });
                  }}
                  className={`w-20 text-center border rounded-md px-2 py-1.5 text-sm ${
                    isOverridden ? 'border-brand-400 bg-brand-50 font-semibold' : 'border-slate-200 bg-slate-50'
                  } focus:ring-1 focus:ring-brand-500 outline-none`}
                />
              </div>
              {isOverridden && (
                <button
                  onClick={() => {
                    if (override && Object.keys(override).length === 1 && override.parallelUnits !== undefined) {
                      onClearOverride(resource.id);
                    } else {
                      const next = { ...override };
                      delete next.parallelUnits;
                      onSetOverride(resource.id, next);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 6 — Run & Results
// ---------------------------------------------------------------------------

const RunResultsTab: React.FC<{
  scenario: Scenario;
  state: ProjectState;
  latestRun: RunBundle | null;
  onSetRunResult: (bundle: RunBundle | null) => void;
  onGoToDashboard: () => void;
}> = ({ scenario, state, latestRun, onSetRunResult, onGoToDashboard }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const status = validateScenarioCompleteness(scenario);

  const handleRun = useCallback(async () => {
    if (!scenario.demand || status !== 'Ready') return;
    setIsRunning(true);
    setRunError(null);
    try {
      const bundle = run(state, {
        projectId: 'default',
        scenarioId: scenario.id,
        targetGoodUnits: scenario.demand.targetGoodUnits,
        horizonCalendarDays: scenario.demand.horizonCalendarDays,
        startDateISO: scenario.demand.startDateISO,
        timezone: scenario.demand.timezone,
      });
      onSetRunResult(bundle);
    } catch (err: any) {
      setRunError(err?.message ?? 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  }, [scenario, state, status, onSetRunResult]);

  const baseline = latestRun?.baseline;
  const scenarioResult = latestRun?.scenario;
  const comparison = latestRun?.comparison;

  return (
    <div className="space-y-6">
      {/* Run button row */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleRun}
          disabled={isRunning || status !== 'Ready'}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm ${
            isRunning
              ? 'bg-slate-200 text-slate-500 cursor-wait'
              : status !== 'Ready'
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-brand-600 hover:bg-brand-700 text-white'
          }`}
        >
          <Play className={`w-4 h-4 ${isRunning ? 'animate-pulse' : ''}`} />
          {isRunning ? 'Running…' : 'Run Simulation'}
        </button>

        {status === 'Incomplete' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Configure demand parameters in the Demand tab first.
          </p>
        )}
        {status === 'Invalid' && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            Fix validation errors in the Demand tab before running.
          </p>
        )}
      </div>

      {runError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div><strong>Run failed:</strong> {runError}</div>
        </div>
      )}

      {/* Results */}
      {baseline && (
        <div className="space-y-5">
          {/* Baseline KPIs */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Baseline Results</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard
                label="Max Throughput"
                value={`${Math.round(baseline.summary.maxThroughputGoodUnits).toLocaleString()} units`}
                sub={`over ${baseline.summary.horizonCalendarDays} days`}
              />
              <KpiCard
                label="Feasible"
                value={baseline.summary.feasible ? 'Yes' : 'No'}
                accent={baseline.summary.feasible ? 'emerald' : 'red'}
                sub={`Target: ${baseline.summary.targetGoodUnits.toLocaleString()} units`}
              />
              <KpiCard
                label="Bottleneck"
                value={
                  baseline.bottleneck?.stepId
                    ? (baseline.steps.find(s => s.stepId === baseline.bottleneck!.stepId)?.label ?? '—')
                    : '—'
                }
                accent="amber"
                sub={baseline.bottleneck?.explanation?.slice(0, 60) ?? ''}
              />
            </div>
          </div>

          {/* Scenario comparison */}
          {scenarioResult && comparison && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Scenario vs Baseline</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <KpiCard
                  label="Throughput Delta"
                  value={`${comparison.deltaMaxThroughputGoodUnits >= 0 ? '+' : ''}${Math.round(comparison.deltaMaxThroughputGoodUnits).toLocaleString()} units`}
                  accent={comparison.deltaMaxThroughputGoodUnits >= 0 ? 'emerald' : 'red'}
                  sub={`Scenario: ${Math.round(scenarioResult.summary.maxThroughputGoodUnits).toLocaleString()} units`}
                />
                <KpiCard
                  label="Bottleneck Shift"
                  value={comparison.changedBottleneck ? 'Changed' : 'Same'}
                  accent={comparison.changedBottleneck ? 'amber' : 'slate'}
                  sub={
                    comparison.changedBottleneck
                      ? `Now: ${scenarioResult.steps.find(s => s.stepId === scenarioResult.bottleneck?.stepId)?.label ?? '—'}`
                      : 'Same step as baseline'
                  }
                />
              </div>

              {/* Step utilization table */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Step Utilization</p>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-2 text-slate-500 font-semibold">Step</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-semibold">Baseline</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-semibold">Scenario</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-semibold">Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparison.stepDeltas
                        .filter(sd => sd.baselineUtilization !== null || sd.scenarioUtilization !== null)
                        .map((sd) => {
                          const label = baseline.steps.find(s => s.stepId === sd.stepId)?.label ?? sd.stepId;
                          const bPct = sd.baselineUtilization !== null ? Math.round(sd.baselineUtilization * 100) : null;
                          const sPct = sd.scenarioUtilization !== null ? Math.round(sd.scenarioUtilization * 100) : null;
                          const dPct = sd.deltaUtilization !== null ? Math.round(sd.deltaUtilization * 100) : null;
                          return (
                            <tr key={sd.stepId} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-medium text-slate-700">{label}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{bPct !== null ? `${bPct}%` : '—'}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-800">{sPct !== null ? `${sPct}%` : '—'}</td>
                              <td className={`px-3 py-2 text-right font-bold ${dPct !== null && dPct < 0 ? 'text-emerald-600' : dPct !== null && dPct > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                {dPct !== null ? `${dPct >= 0 ? '+' : ''}${dPct}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Link to dashboard */}
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={onGoToDashboard}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
            >
              View full Dashboard <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!baseline && !isRunning && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-600">No results yet</p>
          <p className="text-xs text-slate-400 mt-1">Run the simulation to see baseline vs scenario comparison.</p>
        </div>
      )}
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  accent?: 'emerald' | 'red' | 'amber' | 'slate';
}> = ({ label, value, sub, accent = 'slate' }) => {
  const accentColors = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    slate: 'text-slate-800',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-bold ${accentColors[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Scenarios Component
// ---------------------------------------------------------------------------

export const Scenarios: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const {
    state,
    addScenario,
    updateScenario,
    deleteScenario,
    setActiveScenario,
    duplicateScenario,
    setResourceOverride,
    clearResourceOverride,
    setDepartmentScheduleOverride,
    clearDepartmentScheduleOverride,
    setRunResult,
  } = useAppState();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [activeTab, setActiveTab] = useState<ScenarioTab>('overview');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingId]);

  // Reset tab to overview when active scenario changes
  useEffect(() => {
    setActiveTab('overview');
  }, [state.activeScenarioId]);

  const activeScenario = useMemo(
    () => state.scenarios.find(s => s.id === state.activeScenarioId) || null,
    [state.scenarios, state.activeScenarioId]
  );

  // Collect resourceIds used in the flow
  const flowResourceIds = useMemo(() => {
    const ids = new Set<string>();
    state.nodes
      .filter(n => n.nodeType === 'resourceStep' && n.resourceId)
      .forEach(n => ids.add(n.resourceId!));
    return ids;
  }, [state.nodes]);

  const overrides = useMemo(
    () => (activeScenario ? countActiveOverrides(activeScenario) : null),
    [activeScenario]
  );
  const status = useMemo(
    () => (activeScenario ? validateScenarioCompleteness(activeScenario) : null),
    [activeScenario]
  );

  const startEditing = (id: string, name: string) => { setEditingId(id); setEditName(name); };
  const saveRename = () => {
    if (editingId && editName.trim()) updateScenario(editingId, { name: editName.trim() });
    setEditingId(null);
  };

  const handleSetSchedule = useCallback((deptId: string, override: Partial<Department['hoursByWeekday']>) => {
    if (!activeScenario) return;
    setDepartmentScheduleOverride(activeScenario.id, deptId, override);
  }, [activeScenario, setDepartmentScheduleOverride]);

  const handleClearSchedule = useCallback((deptId: string) => {
    if (!activeScenario) return;
    clearDepartmentScheduleOverride(activeScenario.id, deptId);
  }, [activeScenario, clearDepartmentScheduleOverride]);

  const handleSetResourceOverride = useCallback((resourceId: string, override: Partial<Omit<Resource, 'id' | 'departmentId'>>) => {
    if (!activeScenario) return;
    setResourceOverride(activeScenario.id, resourceId, override);
  }, [activeScenario, setResourceOverride]);

  const handleClearResourceOverride = useCallback((resourceId: string) => {
    if (!activeScenario) return;
    clearResourceOverride(activeScenario.id, resourceId);
  }, [activeScenario, clearResourceOverride]);

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" /> Scenarios
          </h2>
          {state.scenarios.length < 2 && (
            <button
              onClick={() => addScenario('New Scenario')}
              className="p-1.5 hover:bg-slate-200 rounded-md text-brand-600 transition-all"
              title="Add scenario"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {state.scenarios.map(s => (
            <div
              key={s.id}
              onClick={() => setActiveScenario(s.id)}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
                state.activeScenarioId === s.id
                  ? 'bg-brand-50 border-brand-500 text-brand-900 shadow-sm'
                  : 'bg-white border-transparent text-slate-600 hover:bg-slate-100 hover:border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden flex-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${state.activeScenarioId === s.id ? 'bg-brand-500' : 'bg-slate-300'}`} />
                {editingId === s.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingId(null); }}
                    onBlur={saveRename}
                    className="flex-1 px-2 py-1 bg-white border border-brand-500 rounded text-sm font-semibold focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-sm font-semibold truncate select-none">{s.name}</span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); startEditing(s.id, s.name); }} className="p-1 text-slate-400 hover:text-brand-600 transition-colors" title="Rename">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                {state.scenarios.length < 2 && (
                  <button onClick={(e) => { e.stopPropagation(); duplicateScenario(s.id); }} className="p-1 text-slate-400 hover:text-brand-600 transition-colors" title="Duplicate">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${s.name}"?`)) deleteScenario(s.id); }}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {state.scenarios.length >= 2 && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
            Max 2 scenarios reached
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 overflow-hidden">
        {activeScenario ? (
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 pt-6 pb-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-slate-400" />
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Scenario</span>
                    <h1 className="text-xl font-bold text-slate-900">{activeScenario.name}</h1>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {overrides && overrides.total > 0 && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                      {overrides.total} override{overrides.total !== 1 ? 's' : ''}
                    </span>
                  )}
                  {status && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold ${statusColors[status]}`}>
                      {statusIcons[status]} {status}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 text-[11px] font-bold">
                    <Save className="w-3.5 h-3.5" /> AUTO-SAVED
                  </div>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex gap-0 overflow-x-auto">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                      activeTab === id
                        ? 'border-brand-500 text-brand-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {id === 'overview' && overrides && overrides.total > 0 && (
                      <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-100 text-brand-700 text-[9px] font-bold">
                        {overrides.total}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="p-8 max-w-4xl">
              {activeTab === 'overview' && (
                <Card>
                  <OverviewTab
                    scenario={activeScenario}
                    onUpdate={(patch) => updateScenario(activeScenario.id, patch)}
                    onGoToTab={setActiveTab}
                    latestRun={state.latestRunResult ?? null}
                  />
                </Card>
              )}

              {activeTab === 'demand' && (
                <Card>
                  <DemandTab
                    scenario={activeScenario}
                    onUpdate={(patch) => updateScenario(activeScenario.id, patch)}
                  />
                </Card>
              )}

              {activeTab === 'departments' && (
                <DepartmentsTab
                  scenario={activeScenario}
                  departments={state.departments}
                  onSetSchedule={handleSetSchedule}
                  onClearSchedule={handleClearSchedule}
                />
              )}

              {activeTab === 'resources' && (
                <ResourcesTab
                  scenario={activeScenario}
                  resources={state.resources}
                  departments={state.departments}
                  flowResourceIds={flowResourceIds}
                  onSetOverride={handleSetResourceOverride}
                  onClearOverride={handleClearResourceOverride}
                />
              )}

              {activeTab === 'stepCapacity' && (
                <StepCapacityTab
                  scenario={activeScenario}
                  nodes={state.nodes}
                  resources={state.resources}
                  onSetOverride={handleSetResourceOverride}
                  onClearOverride={handleClearResourceOverride}
                />
              )}

              {activeTab === 'run' && (
                <Card>
                  <RunResultsTab
                    scenario={activeScenario}
                    state={state}
                    latestRun={state.latestRunResult ?? null}
                    onSetRunResult={setRunResult}
                    onGoToDashboard={() => onNavigate?.('dashboard')}
                  />
                </Card>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">No Scenario Selected</h3>
              <p className="text-sm text-slate-500">Select a scenario from the list to view and edit details.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
