import { describe, it, expect } from 'vitest';
import {
  validateDemandForm,
  validateScheduleOverride,
  validateResourceOverride,
  normalizeTags,
} from '../validation';

// ---------------------------------------------------------------------------
// validateDemandForm
// ---------------------------------------------------------------------------

describe('validateDemandForm', () => {
  const validDemand = {
    targetGoodUnits: 500,
    horizonCalendarDays: 14,
    startDateISO: '2026-03-01',
    timezone: 'Europe/Amsterdam',
  };

  it('returns no errors for valid demand', () => {
    const result = validateDemandForm(validDemand);
    expect(result.errors).toEqual({});
  });

  it('returns no errors for empty fields (not required)', () => {
    const result = validateDemandForm({});
    expect(result.errors).toEqual({});
  });

  describe('targetGoodUnits', () => {
    it('returns error for zero', () => {
      const result = validateDemandForm({ ...validDemand, targetGoodUnits: 0 });
      expect(result.errors.targetGoodUnits).toBeDefined();
    });

    it('returns error for negative value', () => {
      const result = validateDemandForm({ ...validDemand, targetGoodUnits: -1 });
      expect(result.errors.targetGoodUnits).toBeDefined();
    });

    it('returns error for decimal value', () => {
      const result = validateDemandForm({ ...validDemand, targetGoodUnits: 1.5 });
      expect(result.errors.targetGoodUnits).toBeDefined();
    });

    it('accepts positive integer', () => {
      const result = validateDemandForm({ ...validDemand, targetGoodUnits: 1 });
      expect(result.errors.targetGoodUnits).toBeUndefined();
    });

    it('no error for empty string (field optional)', () => {
      const result = validateDemandForm({ ...validDemand, targetGoodUnits: '' as any });
      expect(result.errors.targetGoodUnits).toBeUndefined();
    });
  });

  describe('horizonCalendarDays', () => {
    it('returns error for zero', () => {
      const result = validateDemandForm({ ...validDemand, horizonCalendarDays: 0 });
      expect(result.errors.horizonCalendarDays).toBeDefined();
    });

    it('returns error for decimal', () => {
      const result = validateDemandForm({ ...validDemand, horizonCalendarDays: 7.5 });
      expect(result.errors.horizonCalendarDays).toBeDefined();
    });

    it('accepts positive integer', () => {
      const result = validateDemandForm({ ...validDemand, horizonCalendarDays: 30 });
      expect(result.errors.horizonCalendarDays).toBeUndefined();
    });
  });

  describe('startDateISO', () => {
    it('returns error for invalid format', () => {
      const result = validateDemandForm({ ...validDemand, startDateISO: '2026/03/01' });
      expect(result.errors.startDateISO).toBeDefined();
    });

    it('returns error for invalid date (month 13)', () => {
      const result = validateDemandForm({ ...validDemand, startDateISO: '2026-13-01' });
      expect(result.errors.startDateISO).toBeDefined();
    });

    it('accepts valid ISO date', () => {
      const result = validateDemandForm({ ...validDemand, startDateISO: '2026-12-31' });
      expect(result.errors.startDateISO).toBeUndefined();
    });
  });

  describe('timezone', () => {
    it('no error for valid timezone string', () => {
      const result = validateDemandForm({ ...validDemand, timezone: 'America/New_York' });
      expect(result.errors.timezone).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// validateScheduleOverride
// ---------------------------------------------------------------------------

describe('validateScheduleOverride', () => {
  it('returns no errors for valid hours', () => {
    const errors = validateScheduleOverride({ mon: 8, tue: 8, wed: 0, thu: 24, fri: 8 });
    expect(errors).toEqual({});
  });

  it('returns error for hours > 24', () => {
    const errors = validateScheduleOverride({ mon: 25 });
    expect(errors.mon).toBeDefined();
  });

  it('returns error for negative hours', () => {
    const errors = validateScheduleOverride({ tue: -1 });
    expect(errors.tue).toBeDefined();
  });

  it('handles string input that is out of range', () => {
    const errors = validateScheduleOverride({ wed: '30' as any });
    expect(errors.wed).toBeDefined();
  });

  it('handles string input within range', () => {
    const errors = validateScheduleOverride({ thu: '8.5' as any });
    expect(errors.thu).toBeUndefined();
  });

  it('no error for empty/undefined day', () => {
    const errors = validateScheduleOverride({ fri: '' as any });
    expect(errors.fri).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateResourceOverride
// ---------------------------------------------------------------------------

describe('validateResourceOverride', () => {
  it('returns no errors for valid override', () => {
    const errors = validateResourceOverride({
      parallelUnits: 2,
      yieldPct: 95,
      availability: 0.9,
      outputPerHour: 50,
    });
    expect(errors).toEqual({});
  });

  describe('parallelUnits', () => {
    it('returns error for zero', () => {
      const errors = validateResourceOverride({ parallelUnits: 0 });
      expect(errors.parallelUnits).toBeDefined();
    });

    it('returns error for decimal', () => {
      const errors = validateResourceOverride({ parallelUnits: 1.5 });
      expect(errors.parallelUnits).toBeDefined();
    });

    it('accepts integer >= 1', () => {
      const errors = validateResourceOverride({ parallelUnits: 3 });
      expect(errors.parallelUnits).toBeUndefined();
    });
  });

  describe('yieldPct', () => {
    it('returns error for 0', () => {
      const errors = validateResourceOverride({ yieldPct: 0 });
      expect(errors.yieldPct).toBeDefined();
    });

    it('returns error for > 100', () => {
      const errors = validateResourceOverride({ yieldPct: 101 });
      expect(errors.yieldPct).toBeDefined();
    });

    it('accepts value in (0, 100]', () => {
      const errors = validateResourceOverride({ yieldPct: 100 });
      expect(errors.yieldPct).toBeUndefined();
    });
  });

  describe('availability', () => {
    it('returns error for 0', () => {
      const errors = validateResourceOverride({ availability: 0 });
      expect(errors.availability).toBeDefined();
    });

    it('returns error for > 1', () => {
      const errors = validateResourceOverride({ availability: 1.1 });
      expect(errors.availability).toBeDefined();
    });

    it('accepts value in (0, 1]', () => {
      const errors = validateResourceOverride({ availability: 1 });
      expect(errors.availability).toBeUndefined();
    });
  });

  describe('outputPerHour', () => {
    it('returns error for 0', () => {
      const errors = validateResourceOverride({ outputPerHour: 0 });
      expect(errors.outputPerHour).toBeDefined();
    });

    it('returns error for negative', () => {
      const errors = validateResourceOverride({ outputPerHour: -5 });
      expect(errors.outputPerHour).toBeDefined();
    });

    it('accepts positive value', () => {
      const errors = validateResourceOverride({ outputPerHour: 0.5 });
      expect(errors.outputPerHour).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeTags
// ---------------------------------------------------------------------------

describe('normalizeTags', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });

  it('trims whitespace', () => {
    expect(normalizeTags(['  hello  ', ' world'])).toEqual(['hello', 'world']);
  });

  it('deduplicates tags', () => {
    expect(normalizeTags(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('filters empty strings', () => {
    expect(normalizeTags(['a', '', '  ', 'b'])).toEqual(['a', 'b']);
  });

  it('limits to 5 tags', () => {
    const result = normalizeTags(['1', '2', '3', '4', '5', '6', '7']);
    expect(result).toHaveLength(5);
  });
});
