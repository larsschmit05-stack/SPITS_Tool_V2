import React from 'react';
import type { Department, ProcessElementCreateDraft } from '../../../../state/types';

export const BasicSetupStep: React.FC<{ draft: ProcessElementCreateDraft; departments: Department[]; onPatch: (v: Partial<ProcessElementCreateDraft>) => void }> = ({ draft, departments, onPatch }) => (
  <div className="space-y-2">
    <input className="w-full border p-2 rounded" placeholder="Naam" value={draft.name} onChange={e => onPatch({ name: e.target.value })} />
    {'departmentId' in draft && (
      <select className="w-full border p-2 rounded" value={draft.departmentId ?? ''} onChange={e => onPatch({ departmentId: e.target.value } as Partial<ProcessElementCreateDraft>)}>
        <option value="">Selecteer afdeling</option>
        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    )}
  </div>
);
