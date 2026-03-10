import React from 'react';
import { useProcessElementCreateFlow } from './hooks/useProcessElementCreateFlow';
import type { CreateActionIntent, Department } from '../../../state/types';
import { TypeSelectionStep } from './steps/TypeSelectionStep';
import { BasicSetupStep } from './steps/BasicSetupStep';
import { CapacityLogicStep } from './steps/CapacityLogicStep';
import { PerformanceFactorsBlock } from './steps/PerformanceFactorsBlock';
import { CapacityPreviewPanel } from './components/CapacityPreviewPanel';
import { CompletionActions } from './components/CompletionActions';

export const ProcessElementCreateModal: React.FC<{
  open: boolean;
  departments: Department[];
  lastUsedDepartmentId?: string | null;
  onClose: () => void;
  onSubmit: (intent: CreateActionIntent, draft: any) => void;
}> = ({ open, departments, lastUsedDepartmentId, onClose, onSubmit }) => {
  const flow = useProcessElementCreateFlow(departments, lastUsedDepartmentId);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl p-4 w-full max-w-2xl space-y-4">
        <div className="text-sm font-semibold">Nieuw proces-element (Stap {flow.step}/4)</div>
        {flow.step === 1 && <TypeSelectionStep selected={flow.draft?.resourceClass} onSelect={flow.setType} />}
        {flow.step === 2 && flow.draft && <BasicSetupStep draft={flow.draft} departments={departments} onPatch={flow.patch} />}
        {flow.step === 3 && flow.draft && <CapacityLogicStep draft={flow.draft} onPatch={flow.patch} />}
        {flow.step === 4 && flow.draft && <PerformanceFactorsBlock draft={flow.draft} onPatch={flow.patch} />}

        <CapacityPreviewPanel preview={flow.preview} />

        <div className="text-xs text-red-600">{Object.values(flow.errors)[0] ?? ''}</div>

        <div className="flex justify-between">
          <div className="flex gap-2">
            <button className="px-3 py-2 border rounded" onClick={() => flow.setStep(Math.max(1, flow.step - 1))}>Back</button>
            <button className="px-3 py-2 border rounded" onClick={() => flow.setStep(Math.min(4, flow.step + 1))} disabled={flow.step===1 && !flow.draft}>Next</button>
          </div>
          <CompletionActions
            disabled={!flow.submitReady || flow.step < 4}
            onCancel={onClose}
            onCreate={() => flow.draft && onSubmit('create', flow.draft)}
            onCreateAndAdd={() => flow.draft && onSubmit('createAndAddToFlow', flow.draft)}
          />
        </div>
      </div>
    </div>
  );
};
