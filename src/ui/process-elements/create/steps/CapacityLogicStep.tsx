import React from 'react';
import type { ProcessElementCreateDraft } from '../../../../state/types';

export const CapacityLogicStep: React.FC<{ draft: ProcessElementCreateDraft; onPatch: (v: Partial<ProcessElementCreateDraft>) => void }> = ({ draft, onPatch }) => (
  <div className="space-y-2">
    {draft.resourceClass === 'processing' && <input className="w-full border p-2 rounded" type="number" placeholder="Output per uur" value={draft.outputPerHour ?? ''} onChange={e => onPatch({ outputPerHour: Number(e.target.value) || undefined })} />}
    {draft.resourceClass === 'buffer' && <input className="w-full border p-2 rounded" type="number" placeholder="Slot capaciteit" value={draft.slotCapacity ?? ''} onChange={e => onPatch({ slotCapacity: Number(e.target.value) || undefined })} />}
    {draft.resourceClass === 'transport' && <input className="w-full border p-2 rounded" type="number" placeholder="Units per rit" value={draft.unitsPerTrip ?? ''} onChange={e => onPatch({ unitsPerTrip: Number(e.target.value) || undefined })} />}
    {draft.resourceClass === 'delay' && <input className="w-full border p-2 rounded" type="number" placeholder="Delay minuten" value={draft.delayTimeMinutes ?? ''} onChange={e => onPatch({ delayTimeMinutes: Number(e.target.value) || undefined })} />}
  </div>
);
