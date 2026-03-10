import React from 'react';
import type { ProcessElementCreateDraft } from '../../../../state/types';

export const PerformanceFactorsBlock: React.FC<{ draft: ProcessElementCreateDraft; onPatch: (v: Partial<ProcessElementCreateDraft>) => void }> = ({ draft, onPatch }) => (
  <div className="grid grid-cols-3 gap-2">
    <input className="border p-2 rounded" type="number" step="0.01" value={draft.availability} onChange={e => onPatch({ availability: Number(e.target.value) })} />
    <input className="border p-2 rounded" type="number" value={draft.yieldPct} onChange={e => onPatch({ yieldPct: Number(e.target.value) })} />
    <input className="border p-2 rounded" type="number" value={draft.dailyStartupMinutes} onChange={e => onPatch({ dailyStartupMinutes: Number(e.target.value) })} />
  </div>
);
