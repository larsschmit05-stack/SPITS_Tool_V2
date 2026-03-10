import { useMemo, useState } from 'react';
import type { CreateActionIntent, ProcessElementCreateDraft, ResourceClass } from '../../../../state/types';
import type { Department } from '../../../../state/types';
import { sanitizeDraftByType, validateProcessElementCreateDraft } from '../../../../engine/validators';
import { computeEffectiveCapacityPreview, mapCreateDraftToPreviewResource } from '../../../../engine/preview';

const defaultByClass: Record<ResourceClass, ProcessElementCreateDraft> = {
  processing: {
    resourceClass: 'processing', name: '', description: '', departmentId: undefined,
    processingMode: 'continuous', outputPerHour: undefined, batchSize: undefined, cycleTimeMinutes: undefined,
    parallelUnits: 1, availability: 1, yieldPct: 100, dailyStartupMinutes: 0,
  },
  buffer: {
    resourceClass: 'buffer', name: '', description: '', departmentId: undefined,
    slotCapacity: undefined, dwellTimeMinutes: undefined, safetyMarginPct: 0,
    availability: 1, yieldPct: 100, dailyStartupMinutes: 0,
  },
  transport: {
    resourceClass: 'transport', name: '', description: '', departmentId: undefined,
    transportMode: 'discrete', outputPerHour: undefined, unitsPerTrip: undefined, tripDurationMinutes: undefined,
    parallelUnits: 1, availability: 1, yieldPct: 100, dailyStartupMinutes: 0,
  },
  delay: {
    resourceClass: 'delay', name: '', description: '', delayMode: 'per_unit', delayTimeMinutes: undefined,
    availability: 1, yieldPct: 100, dailyStartupMinutes: 0,
  },
};

export function useProcessElementCreateFlow(departments: Department[], lastUsedDepartmentId?: string | null) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ProcessElementCreateDraft | null>(null);

  const setType = (resourceClass: ResourceClass) => {
    const base = { ...defaultByClass[resourceClass] } as ProcessElementCreateDraft;
    if (resourceClass !== 'delay' && lastUsedDepartmentId && departments.some(d => d.id === lastUsedDepartmentId)) {
      (base as Exclude<ProcessElementCreateDraft, { resourceClass: 'delay' }>).departmentId = lastUsedDepartmentId;
    }
    setDraft(base);
  };

  const patch = (patchObj: Partial<ProcessElementCreateDraft>) => {
    if (!draft) return;
    setDraft(sanitizeDraftByType({ ...draft, ...patchObj } as ProcessElementCreateDraft));
  };

  const errors = useMemo(() => draft ? validateProcessElementCreateDraft(draft, departments) : {}, [draft, departments]);
  const preview = useMemo(() => {
    if (!draft) return null;
    const dep = 'departmentId' in draft ? departments.find(d => d.id === draft.departmentId) : undefined;
    const dayHours = dep ? dep.availableHoursPerWeek / 5 : 24;
    return computeEffectiveCapacityPreview(mapCreateDraftToPreviewResource(draft), dayHours);
  }, [draft, departments]);

  const submitReady = !!draft && Object.keys(errors).length === 0;
  const submitIntent = (intent: CreateActionIntent) => ({ draft, intent, submitReady });

  return { step, setStep, draft, setType, patch, errors, preview, submitReady, submitIntent };
}
