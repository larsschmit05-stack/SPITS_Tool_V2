import React from 'react';
import type { ResourceClass } from '../../../../state/types';

const types: ResourceClass[] = ['processing', 'buffer', 'transport', 'delay'];
export const TypeSelectionStep: React.FC<{ selected?: ResourceClass; onSelect: (t: ResourceClass) => void }> = ({ selected, onSelect }) => (
  <div className="grid grid-cols-2 gap-2">{types.map(t => <button key={t} onClick={() => onSelect(t)} className={`p-3 border rounded text-left ${selected===t ? 'border-brand-600 bg-brand-50' : ''}`}>{t}</button>)}</div>
);
