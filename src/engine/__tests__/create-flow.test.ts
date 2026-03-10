import { describe, expect, it } from 'vitest';
import { sanitizeDraftByType, validateProcessElementCreateDraft } from '../validators';
import type { ProcessElementCreateDraft } from '../../state/types';

const departments = [{ id: 'd1', name: 'A', color: '#000', hoursByWeekday: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 }, availableHoursPerWeek: 40 }];

describe('create draft sanitization', () => {
  it('removes foreign fields on type-specific mode', () => {
    const draft: ProcessElementCreateDraft = {
      resourceClass: 'processing', name: 'x', departmentId: 'd1', processingMode: 'batch', batchSize: 1, cycleTimeMinutes: 1,
      parallelUnits: 1, availability: 1, yieldPct: 100, dailyStartupMinutes: 0, outputPerHour: 10,
    };
    const cleaned = sanitizeDraftByType(draft);
    expect(cleaned.outputPerHour).toBeUndefined();
  });

  it('requires department for non-delay', () => {
    const draft: ProcessElementCreateDraft = {
      resourceClass: 'buffer', name: 'x', slotCapacity: 1, dwellTimeMinutes: 1,
      availability: 1, yieldPct: 100, dailyStartupMinutes: 0,
    };
    expect(validateProcessElementCreateDraft(draft, departments).departmentId).toBeTruthy();
  });

  it('allows delay without department', () => {
    const draft: ProcessElementCreateDraft = {
      resourceClass: 'delay', name: 'x', delayMode: 'per_unit', delayTimeMinutes: 3,
      availability: 1, yieldPct: 100, dailyStartupMinutes: 0,
    };
    expect(validateProcessElementCreateDraft(draft, departments).departmentId).toBeUndefined();
  });
});
