
import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { Play, AlertTriangle, Lightbulb, TrendingUp, Package, Bell, Box, Activity, AlertCircle } from 'lucide-react';
import { useAppState } from './src/state/store';
import { run } from './src/engine/engine';
import type { RunParams } from './src/engine/engine';

const KPICard = ({ title, value, subtext, subtextColor, icon: Icon }: any) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-card">
    <div className="flex justify-between items-start mb-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
      {Icon && <Icon className="w-4 h-4 text-slate-400" />}
    </div>
    <div className="flex items-baseline gap-2 mb-1">
      <h3 className="text-2xl font-bold text-slate-900 tabular-nums">{value}</h3>
    </div>
    <p className={`text-xs font-medium ${subtextColor}`}>{subtext}</p>
  </div>
);

export const Dashboard: React.FC = () => {
  const { state, setRunResult } = useAppState();
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [showDemandPrompt, setShowDemandPrompt] = useState(false);
  const [demandInput, setDemandInput] = useState({
    targetGoodUnits: 500,
    horizonCalendarDays: 14,
    startDateISO: '2026-03-02',
    timezone: 'Europe/Amsterdam',
  });

  const activeScenario = useMemo(
    () => state.scenarios.find(s => s.id === state.activeScenarioId) || null,
    [state.scenarios, state.activeScenarioId]
  );

  const latestRun = state.latestRunResult?.baseline;
  const scenarioRun = state.latestRunResult?.scenario;
  const comparison = state.latestRunResult?.comparison;

  const demandPerWeek = activeScenario?.demand?.targetGoodUnits ?? demandInput.targetGoodUnits;

  const handleRunSimulation = async () => {
    // If no demand configured, show prompt instead of erroring
    if (!activeScenario?.demand) {
      setShowDemandPrompt(true);
      return;
    }

    try {
      setIsRunning(true);
      setRunError(null);

      const params: RunParams = {
        projectId: 'project-001',
        scenarioId: state.activeScenarioId || null,
        targetGoodUnits: activeScenario.demand.targetGoodUnits,
        horizonCalendarDays: activeScenario.demand.horizonCalendarDays,
        startDateISO: activeScenario.demand.startDateISO,
        timezone: activeScenario.demand.timezone,
      };

      const result = run(state, params);
      setRunResult(result);
      setIsRunning(false);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'An error occurred during simulation');
      setIsRunning(false);
    }
  };

  const handleDemandRun = async () => {
    try {
      setIsRunning(true);
      setRunError(null);
      setShowDemandPrompt(false);

      const params: RunParams = {
        projectId: 'project-001',
        scenarioId: state.activeScenarioId || null,
        targetGoodUnits: demandInput.targetGoodUnits,
        horizonCalendarDays: demandInput.horizonCalendarDays,
        startDateISO: demandInput.startDateISO,
        timezone: demandInput.timezone,
      };

      const result = run(state, params);
      setRunResult(result);
      setIsRunning(false);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'An error occurred during simulation');
      setIsRunning(false);
    }
  };

  const utilizationData = useMemo(() => {
    if (!latestRun) {
      return state.nodes
        .filter(n => n.nodeType && n.nodeType !== 'start' && n.nodeType !== 'end')
        .map(n => ({
          name: n.name,
          value: 0,
          scenarioValue: null as number | null,
          delta: null as number | null,
          isProcessStep: n.nodeType === 'resourceStep',
        }));
    }

    return latestRun.steps
      .filter(s => s.stepType === 'resourceStep')
      .map(s => {
        const stepDelta = comparison?.stepDeltas.find(d => d.stepId === s.stepId);
        return {
          name: s.label,
          value: s.utilizationAtTarget != null ? Math.round(s.utilizationAtTarget * 100) : 0,
          scenarioValue: stepDelta?.scenarioUtilization != null ? Math.round(stepDelta.scenarioUtilization * 100) : null,
          delta: stepDelta?.deltaUtilization != null ? Math.round(stepDelta.deltaUtilization * 100) : null,
          isProcessStep: true,
          conversionRatio: s.conversionRatio,
        };
      });
  }, [latestRun, comparison, state.nodes]);

  const throughputTrend = useMemo(() => {
    const maxThroughput = latestRun?.summary.maxThroughputGoodUnits ?? 0;
    const horizonDays = latestRun?.inputs.horizonCalendarDays ?? demandInput.horizonCalendarDays;
    const targetTotal = latestRun?.inputs.targetGoodUnits ?? demandPerWeek;

    // Distribute target and throughput evenly across horizon
    const dailyTarget = targetTotal > 0 ? targetTotal / horizonDays : 0;
    const dailyThroughput = maxThroughput > 0 ? maxThroughput / horizonDays : 0;

    // Show up to 7 days to keep chart readable
    const daysToShow = Math.min(7, horizonDays);
    const dayLabels = Array.from({ length: daysToShow }, (_, i) => `Day ${i + 1}`);

    return dayLabels.map(day => ({
      name: day,
      value: dailyThroughput,
      target: dailyTarget,
    }));
  }, [latestRun, demandPerWeek, demandInput.horizonCalendarDays]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
            <h2 className="text-lg font-bold text-slate-900">Dashboard</h2>
            <div className="h-6 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
                <Box className="w-4 h-4 text-slate-400" />
                <span className="font-medium">Demand Target: <span className="font-bold text-slate-900 tabular-nums">{demandPerWeek}</span> units</span>
            </div>
            {activeScenario && (
              <>
                <div className="h-6 w-px bg-slate-200"></div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Activity className="w-4 h-4 text-brand-500" />
                  <span className="font-medium text-brand-700">{activeScenario.name}</span>
                </div>
              </>
            )}
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border"
              style={{
                backgroundColor: latestRun ? (latestRun.summary.feasible ? '#ecfdf5' : '#fef2f2') : '#f1f5f9',
                borderColor: latestRun ? (latestRun.summary.feasible ? '#a7f3d0' : '#fecaca') : '#cbd5e1',
              }}>
                <div className="w-2 h-2 rounded-full" style={{
                  backgroundColor: latestRun ? (latestRun.summary.feasible ? '#10b981' : '#ef4444') : '#94a3b8'
                }}></div>
                <span className="text-xs font-bold uppercase tracking-wide" style={{
                  color: latestRun ? (latestRun.summary.feasible ? '#047857' : '#991b1b') : '#475569'
                }}>
                  {latestRun ? (latestRun.summary.feasible ? '✓ Feasible' : '✗ Not Feasible') : 'No Simulation'}
                </span>
            </div>
            <button
              onClick={handleRunSimulation}
              disabled={isRunning || !activeScenario?.demand}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white disabled:bg-slate-300 disabled:text-slate-500 px-4 py-2 rounded-md text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isRunning ? 'Running...' : 'Run Simulation'}
            </button>
        </div>
      </div>

      {runError && (
        <div className="bg-red-50 p-4 rounded-lg border border-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Simulation Error</p>
            <p className="text-sm text-red-800">{runError}</p>
          </div>
        </div>
      )}

      {showDemandPrompt && (
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h3 className="text-sm font-bold text-blue-900 mb-4">Configure Demand Parameters</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Target Units</label>
              <input
                type="number"
                min="1"
                value={demandInput.targetGoodUnits}
                onChange={(e) => setDemandInput({ ...demandInput, targetGoodUnits: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Horizon (days)</label>
              <input
                type="number"
                min="1"
                value={demandInput.horizonCalendarDays}
                onChange={(e) => setDemandInput({ ...demandInput, horizonCalendarDays: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Start Date</label>
              <input
                type="date"
                value={demandInput.startDateISO}
                onChange={(e) => setDemandInput({ ...demandInput, startDateISO: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Timezone</label>
              <input
                type="text"
                value={demandInput.timezone}
                onChange={(e) => setDemandInput({ ...demandInput, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowDemandPrompt(false)}
              className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDemandRun}
              disabled={isRunning}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-md text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Running...' : 'Run Simulation'}
            </button>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Throughput"
          value={latestRun ? Math.round(latestRun.summary.maxThroughputGoodUnits).toLocaleString() : '—'}
          subtext={latestRun ? `${latestRun.inputs.horizonCalendarDays}-day horizon` : 'Run simulation to see data'}
          subtextColor={latestRun ? 'text-slate-600' : 'text-slate-400'}
          icon={TrendingUp}
        />

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-card relative overflow-hidden">
             <div className="absolute top-0 left-0 bottom-0 w-1" style={{
               backgroundColor: latestRun?.bottleneck ? '#ef4444' : '#cbd5e1'
             }}></div>
             <div className="flex justify-between items-start mb-3 pl-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Primary Constraint</p>
                <AlertTriangle className="w-4 h-4" style={{
                  color: latestRun?.bottleneck ? '#ef4444' : '#cbd5e1'
                }} />
            </div>
            <h3 className="text-xl font-bold mb-1 truncate pl-2" style={{
              color: latestRun?.bottleneck ? '#111827' : '#9ca3af'
            }}>
              {latestRun?.bottleneck?.stepId
                ? latestRun.steps.find(s => s.stepId === latestRun.bottleneck?.stepId)?.label || '—'
                : '—'}
            </h3>
            <p className="text-xs font-bold pl-2" style={{
              color: latestRun?.bottleneck ? '#4b5563' : '#9ca3af'
            }}>
              {latestRun?.bottleneck?.explanation ? latestRun.bottleneck.explanation.slice(0, 50) + '...' : 'Run simulation'}
            </p>
        </div>

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-card relative overflow-hidden">
             <div className="absolute top-0 left-0 bottom-0 w-1" style={{
               backgroundColor: latestRun?.summary.feasible ? '#10b981' : '#f59e0b'
             }}></div>
             <div className="flex justify-between items-start mb-3 pl-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Feasibility</p>
                <Package className="w-4 h-4" style={{
                  color: latestRun?.summary.feasible ? '#10b981' : '#f59e0b'
                }} />
            </div>
            <h3 className="text-xl font-bold mb-1 truncate pl-2" style={{
              color: latestRun ? (latestRun.summary.feasible ? '#065f46' : '#92400e') : '#9ca3af'
            }}>
              {latestRun?.summary.feasible ? '✓ Yes' : latestRun ? '✗ No' : '—'}
            </h3>
            <p className="text-xs font-bold pl-2" style={{
              color: latestRun ? (latestRun.summary.feasible ? '#065f46' : '#92400e') : '#9ca3af'
            }}>
              {latestRun ? `Target: ${latestRun.inputs.targetGoodUnits.toLocaleString()} units` : 'Run simulation'}
            </p>
        </div>

        <KPICard
            title="Avg Utilization"
            value={latestRun ? Math.round(
              (utilizationData.reduce((sum, d) => sum + d.value, 0) / (utilizationData.length || 1))
            ) + '%' : '—'}
            subtext={latestRun ? 'System average' : 'Run simulation to see data'}
            subtextColor={latestRun ? 'text-slate-600' : 'text-slate-400'}
            icon={Activity}
        />
      </div>

      {/* Scenario & Comparison Section */}
      {latestRun && scenarioRun && comparison && (
        <div className="space-y-4 border-t border-slate-200 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Scenario Comparison
              {activeScenario && (
                <span className="ml-2 text-xs font-normal text-slate-500">— {activeScenario.name}</span>
              )}
            </h3>
          </div>

          {/* Bottleneck shift alert */}
          {comparison.changedBottleneck && (() => {
            const baseBottleneckLabel = latestRun!.steps.find(s => s.stepId === latestRun!.bottleneck?.stepId)?.label;
            const scenarioBottleneckLabel = scenarioRun.steps.find(s => s.stepId === scenarioRun.bottleneck?.stepId)?.label;
            return (
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span className="text-amber-900">
                  <span className="font-semibold">Bottleneck shifted:</span>{' '}
                  <span className="font-mono">{baseBottleneckLabel ?? '—'}</span>
                  {' → '}
                  <span className="font-mono font-semibold">{scenarioBottleneckLabel ?? '—'}</span>
                </span>
              </div>
            );
          })()}

          {/* Feasibility change alert */}
          {comparison.feasibleChanged && (
            <div className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
              scenarioRun.summary.feasible
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${scenarioRun.summary.feasible ? 'text-emerald-600' : 'text-red-600'}`} />
              <span className={scenarioRun.summary.feasible ? 'text-emerald-900' : 'text-red-900'}>
                <span className="font-semibold">Feasibility changed:</span>{' '}
                {scenarioRun.summary.feasible ? 'Scenario is now feasible.' : 'Scenario is no longer feasible.'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Scenario Throughput"
              value={Math.round(scenarioRun.summary.maxThroughputGoodUnits).toLocaleString()}
              subtext={`Baseline: ${Math.round(latestRun!.summary.maxThroughputGoodUnits).toLocaleString()}`}
              subtextColor="text-slate-600"
              icon={TrendingUp}
            />

            <KPICard
              title="Throughput Delta"
              value={`${comparison.deltaMaxThroughputGoodUnits > 0 ? '+' : ''}${Math.round(comparison.deltaMaxThroughputGoodUnits).toLocaleString()}`}
              subtext={comparison.deltaMaxThroughputGoodUnits > 0 ? 'Improvement' : comparison.deltaMaxThroughputGoodUnits < 0 ? 'Decline' : 'No change'}
              subtextColor={comparison.deltaMaxThroughputGoodUnits > 0 ? 'text-emerald-600' : comparison.deltaMaxThroughputGoodUnits < 0 ? 'text-red-600' : 'text-slate-600'}
              icon={TrendingUp}
            />

            <KPICard
              title="Scenario Feasibility"
              value={scenarioRun.summary.feasible ? '✓ Yes' : '✗ No'}
              subtext={comparison.feasibleChanged ? (scenarioRun.summary.feasible ? 'Now feasible!' : 'No longer feasible') : 'Unchanged'}
              subtextColor={scenarioRun.summary.feasible ? 'text-emerald-600' : 'text-red-600'}
              icon={Package}
            />

            <KPICard
              title="Bottleneck Changed"
              value={comparison.changedBottleneck ? '✓ Yes' : '✗ No'}
              subtext={comparison.changedBottleneck ? 'Bottleneck shifted' : 'Same constraint'}
              subtextColor={comparison.changedBottleneck ? 'text-amber-600' : 'text-slate-600'}
              icon={AlertTriangle}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-card">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900">Utilization Analysis</h3>
                    <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-status-red"></span> &gt;85% (Critical)</div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-600"></span> Nominal</div>
                    </div>
                </div>
                {scenarioRun && comparison && (
                  <div className="flex items-center gap-4 text-xs mb-4">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-600 opacity-40"></span> Baseline</div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-600"></span> Scenario</div>
                  </div>
                )}
                <div className="space-y-5">
                    {utilizationData.length > 0 ? utilizationData.map((item) => {
                      const isCritical = item.value > 85;
                      const barColor = isCritical ? '#dc2626' : '#0056D2';
                      const hasScenario = item.scenarioValue != null;
                      const scenarioIsCritical = hasScenario && item.scenarioValue! > 85;
                      const scenarioBarColor = scenarioIsCritical ? '#dc2626' : '#0056D2';
                      const deltaVal = item.delta;
                      return (
                        <div key={item.name} className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                                <span className="flex items-center gap-1.5 text-slate-700">
                                  {item.name}
                                  {item.conversionRatio != null && (
                                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded font-bold">
                                      ×{item.conversionRatio}
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2 tabular-nums">
                                  {hasScenario ? (
                                    <>
                                      <span className="text-slate-400">{item.value > 0 ? item.value + '%' : '—'}</span>
                                      <span className="text-slate-300">→</span>
                                      <span className={scenarioIsCritical ? 'text-red-600 font-bold' : 'text-slate-700'}>
                                        {item.scenarioValue! > 0 ? item.scenarioValue + '%' : '—'}
                                      </span>
                                      {deltaVal != null && deltaVal !== 0 && (
                                        <span className={`text-[10px] font-bold px-1 rounded ${deltaVal > 0 ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                          {deltaVal > 0 ? '+' : ''}{deltaVal}%
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className={isCritical ? 'text-red-600 font-bold' : 'text-slate-600'}>
                                      {item.value > 0 ? item.value + '%' : '—'}
                                    </span>
                                  )}
                                </div>
                            </div>
                            {/* Baseline bar */}
                            <div className="h-2 w-full bg-slate-100 rounded-sm overflow-hidden">
                                <div
                                  className="h-full rounded-sm transition-all"
                                  style={{
                                    backgroundColor: barColor,
                                    opacity: hasScenario ? 0.35 : 1,
                                    width: item.value > 0 ? Math.min(item.value, 100) + '%' : '0%',
                                  }}>
                                </div>
                            </div>
                            {/* Scenario bar (only when comparison active) */}
                            {hasScenario && (
                              <div className="h-2 w-full bg-slate-100 rounded-sm overflow-hidden -mt-1">
                                  <div
                                    className="h-full rounded-sm transition-all"
                                    style={{
                                      backgroundColor: scenarioBarColor,
                                      width: item.scenarioValue! > 0 ? Math.min(item.scenarioValue!, 100) + '%' : '0%',
                                    }}>
                                  </div>
                              </div>
                            )}
                        </div>
                      );
                    }) : (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Box className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">{latestRun ? 'No process steps.' : 'No simulation data.'}</p>
                      </div>
                    )}
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-card h-80">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900">Output vs Demand</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={throughputTrend}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0056D2" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#0056D2" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#5E6C84'}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#5E6C84'}} />
                        <Tooltip
                            contentStyle={{ borderRadius: '6px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', fontSize: '12px', fontWeight: 'bold' }}
                            itemStyle={{ color: '#172B4D' }}
                        />
                        <Area type="monotone" dataKey="value" stroke="#0056D2" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                        <Area type="monotone" dataKey="target" stroke="#A5ADBA" strokeDasharray="4 4" strokeWidth={2} fill="none" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-slate-800 text-white rounded-lg p-6 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10 pointer-events-none"></div>
                <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-brand-100" />
                    <h3 className="font-bold tracking-wide text-xs uppercase text-slate-200">System Insights</h3>
                </div>

                <div className="space-y-3">
                  {latestRun ? (
                    <>
                      <div className={`p-3 rounded-md border ${latestRun.summary.feasible ? 'bg-emerald-900/30 border-emerald-500/30' : 'bg-red-900/30 border-red-500/30'}`}>
                        <p className={`text-sm font-medium ${latestRun.summary.feasible ? 'text-emerald-100' : 'text-red-100'}`}>
                          {latestRun.summary.feasible
                            ? `✓ Target of ${latestRun.inputs.targetGoodUnits.toLocaleString()} units is feasible with current capacity.`
                            : `✗ Target of ${latestRun.inputs.targetGoodUnits.toLocaleString()} units cannot be met. Max throughput: ${Math.round(latestRun.summary.maxThroughputGoodUnits).toLocaleString()} units.`}
                        </p>
                      </div>
                      {latestRun.bottleneck && (
                        <div className="bg-slate-700/50 p-3 rounded-md border border-slate-600">
                          <p className="text-xs font-semibold text-slate-300 mb-1">Bottleneck:</p>
                          <p className="text-sm text-slate-100">
                            {latestRun.steps.find(s => s.stepId === latestRun.bottleneck?.stepId)?.label || 'Unknown'}
                          </p>
                          {latestRun.bottleneck.utilizationAtTarget && (
                            <p className="text-xs text-slate-400 mt-1">
                              Utilization at target: {Math.round(latestRun.bottleneck.utilizationAtTarget * 100)}%
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-emerald-900/30 p-3 rounded-md border border-emerald-500/30">
                        <p className="text-sm font-medium text-emerald-100">Run a simulation to see insights.</p>
                    </div>
                  )}
                </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-card">
                 <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-slate-400" />
                        <h3 className="font-bold text-slate-900 text-xs uppercase">Notifications</h3>
                    </div>
                    {latestRun && (latestRun.validation.errors.length > 0 || latestRun.validation.warnings.length > 0) && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                        {latestRun.validation.errors.length + latestRun.validation.warnings.length} ISSUES
                      </span>
                    )}
                </div>
                <div className="space-y-3">
                    {latestRun && (latestRun.validation.errors.length > 0 || latestRun.validation.warnings.length > 0) ? (
                      <>
                        {latestRun.validation.errors.map((error, idx) => (
                          <div key={idx} className="bg-red-50 p-3 rounded-md border border-red-200">
                            <p className="text-xs font-bold text-red-900">{error.message}</p>
                            {error.suggestedFix && (
                              <p className="text-xs text-red-800 mt-1">Suggested: {error.suggestedFix}</p>
                            )}
                          </div>
                        ))}
                        {latestRun.validation.warnings.map((warning, idx) => (
                          <div key={`warn-${idx}`} className="bg-amber-50 p-3 rounded-md border border-amber-200">
                            <p className="text-xs font-bold text-amber-900">{warning.message}</p>
                            {warning.suggestedFix && (
                              <p className="text-xs text-amber-800 mt-1">Suggested: {warning.suggestedFix}</p>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-4">
                        {latestRun ? 'No critical alerts active.' : 'No simulation data.'}
                      </p>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
