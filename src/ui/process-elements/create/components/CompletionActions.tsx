import React from 'react';

export const CompletionActions: React.FC<{ onCreate: () => void; onCreateAndAdd: () => void; onCancel: () => void; disabled?: boolean }> = ({ onCreate, onCreateAndAdd, onCancel, disabled }) => (
  <div className="flex gap-2 justify-end">
    <button className="px-3 py-2 text-sm border rounded" onClick={onCancel}>Cancel</button>
    <button className="px-3 py-2 text-sm border rounded" disabled={disabled} onClick={onCreate}>Create Element</button>
    <button className="px-3 py-2 text-sm bg-brand-600 text-white rounded" disabled={disabled} onClick={onCreateAndAdd}>Create & Add to Flow</button>
  </div>
);
