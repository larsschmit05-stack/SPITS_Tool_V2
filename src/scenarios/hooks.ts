/**
 * Custom hooks for Scenario editor.
 */

import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import type { Scenario, ScenarioPatch, Resource, Department } from '../state/types';

/**
 * Hook to extract a scenario from the full state by ID.
 */
export function useScenarioById(scenarios: Scenario[], scenarioId: string | null): Scenario | null {
  return useMemo(
    () => (scenarioId ? scenarios.find(s => s.id === scenarioId) || null : null),
    [scenarios, scenarioId]
  );
}

/**
 * Hook to manage dirty state for a form with debounced save.
 * Tracks whether form has unsaved changes.
 */
export function useFormDirtyState(initialDirty = false) {
  const [isDirty, setIsDirty] = useState(initialDirty);
  const markDirty = useCallback(() => setIsDirty(true), []);
  const clearDirty = useCallback(() => setIsDirty(false), []);
  return { isDirty, markDirty, clearDirty };
}

/**
 * Hook for debounced dispatch.
 * Useful for auto-saving form changes without firing too many updates.
 */
export function useDebouncedDispatch<T>(
  dispatch: (value: T) => void,
  delay: number = 300
) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  const debouncedDispatch = useCallback(
    (value: T) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        dispatch(value);
      }, delay);
    },
    [dispatch, delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedDispatch;
}

/**
 * Hook to build resource override updates.
 * Manages incremental override edits.
 */
export function useResourceOverrideBuilder(
  scenario: Scenario | null,
  onUpdateOverride: (resourceId: string, override: any) => void
) {
  const updateParallelUnits = useCallback(
    (resourceId: string, value: number) => {
      onUpdateOverride(resourceId, { parallelUnits: value });
    },
    [onUpdateOverride]
  );

  const updateYieldPct = useCallback(
    (resourceId: string, value: number) => {
      onUpdateOverride(resourceId, { yieldPct: value });
    },
    [onUpdateOverride]
  );

  const updateAvailability = useCallback(
    (resourceId: string, value: number) => {
      onUpdateOverride(resourceId, { availability: value });
    },
    [onUpdateOverride]
  );

  const updateOutputPerHour = useCallback(
    (resourceId: string, value: number) => {
      onUpdateOverride(resourceId, { outputPerHour: value });
    },
    [onUpdateOverride]
  );

  return {
    updateParallelUnits,
    updateYieldPct,
    updateAvailability,
    updateOutputPerHour,
  };
}

/**
 * Hook to build department schedule override updates.
 */
export function useDepartmentScheduleBuilder(
  scenario: Scenario | null,
  onUpdateSchedule: (departmentId: string, override: any) => void
) {
  const updateDay = useCallback(
    (departmentId: string, day: string, hours: number) => {
      onUpdateSchedule(departmentId, { [day]: hours });
    },
    [onUpdateSchedule]
  );

  return { updateDay };
}

/**
 * Hook to extract baseline value for comparison in overrides.
 * Used to show "baseline: X" hints in form.
 */
export function useBaselineValue<T>(
  resources: Resource[],
  departments: Department[],
  type: 'resource' | 'department',
  id: string,
  field: string
): T | undefined {
  return useMemo(() => {
    if (type === 'resource') {
      const resource = resources.find(r => r.id === id);
      return resource ? (resource as any)[field] : undefined;
    } else {
      const dept = departments.find(d => d.id === id);
      return dept ? (dept as any)[field] : undefined;
    }
  }, [resources, departments, type, id, field]);
}

