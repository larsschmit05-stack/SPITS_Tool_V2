import React, { useState, useEffect } from 'react';
import { useAppState } from './src/state/store';
import {
  Search, Plus, Trash2, AlertCircle, ChevronDown,
} from 'lucide-react';
import type { Department } from './src/state/types';
import { validateDepartmentDraft, sumHoursByWeekday } from './src/engine/validators';
import { NumericInput } from './src/components/NumericInput';

// ---------------------------------------------------------------------------
// Small reusable field components
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, required, error, children }) => (
  <div>
    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
);

const inputCls = (error?: string) =>
  `w-full px-3 py-2 bg-white border rounded-md text-sm focus:outline-none focus:ring-1 ${
    error
      ? 'border-red-400 focus:ring-red-400'
      : 'border-slate-200 focus:ring-brand-500 focus:border-brand-500'
  }`;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const Departments: React.FC = () => {
  const { state, addDepartment, updateDepartment, deleteDepartment } = useAppState();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Department> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filteredDepartments = state.departments.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedDepartment = state.departments.find(d => d.id === selectedId) ?? null;

  // When selection changes, reset draft to the department's current state
  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      setErrors({});
      setIsDirty(false);
      setShowDeleteConfirm(false);
      return;
    }
    const dept = state.departments.find(d => d.id === selectedId);
    if (dept) {
      setDraft({ ...dept });
      setErrors({});
      setIsDirty(false);
      setShowDeleteConfirm(false);
    }
  }, [selectedId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // -------------------------------------------------------------------------
  // Draft helpers
  // -------------------------------------------------------------------------

  const patchDraft = <K extends keyof Department>(key: K, value: Department[K]) => {
    if (!draft) return;
    const updated = { ...draft, [key]: value };
    setDraft(updated);
    setIsDirty(true);

    // Real-time validation
    const newErrors = validateDepartmentDraft(updated, state.departments);
    setErrors(newErrors);
  };

  const patchDraftHours = (day: string, value: number) => {
    if (!draft) return;
    const updated = {
      ...draft,
      hoursByWeekday: { ...draft.hoursByWeekday, [day]: value },
    };
    setDraft(updated);
    setIsDirty(true);

    // Real-time validation
    const newErrors = validateDepartmentDraft(updated, state.departments);
    setErrors(newErrors);
  };

  const handleAddDepartment = () => {
    const newDept: Partial<Department> = {
      name: 'New Department',
      color: '#3B82F6',
      hoursByWeekday: {
        mon: 8,
        tue: 8,
        wed: 8,
        thu: 8,
        fri: 8,
        sat: 0,
        sun: 0,
      },
      availableHoursPerWeek: 40,
    };
    setDraft(newDept);
    setSelectedId('__new__'); // Temporary ID to mark as new
    setIsDirty(true);
    setShowDeleteConfirm(false);
    setErrors(validateDepartmentDraft(newDept, state.departments));
  };

  const handleSave = () => {
    if (!draft) return;

    const newErrors = validateDepartmentDraft(draft, state.departments);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (selectedId === '__new__') {
      // Add new department
      addDepartment(draft as Omit<Department, 'id'>);
      showToast('Department added');
    } else {
      // Update existing
      updateDepartment(draft as Department);
      showToast('Department updated');
    }

    setSelectedId(null);
    setDraft(null);
    setErrors({});
    setIsDirty(false);
  };

  const handleDiscard = () => {
    setSelectedId(null);
    setDraft(null);
    setErrors({});
    setIsDirty(false);
    setShowDeleteConfirm(false);
  };

  const handleDelete = () => {
    if (!selectedId || selectedId === '__new__' || !selectedDepartment) return;

    const resourcesInDept = state.resources.filter(
      r => r.departmentId === selectedId
    ).length;

    if (resourcesInDept > 0) {
      setErrors({
        _delete: `Cannot delete: ${resourcesInDept} resource${resourcesInDept !== 1 ? 's' : ''} assigned`,
      });
      return;
    }

    deleteDepartment(selectedId);
    showToast('Department removed');
    setSelectedId(null);
    setDraft(null);
    setErrors({});
    setIsDirty(false);
    setShowDeleteConfirm(false);
  };

  const hasErrors = Object.keys(errors).length > 0;
  const canSave = isDirty && !hasErrors;

  // Count resources in selected department
  const resourcesInSelectedDept = selectedId && selectedId !== '__new__'
    ? state.resources.filter(r => r.departmentId === selectedId).length
    : 0;

  const canDelete = selectedId !== '__new__' && resourcesInSelectedDept === 0;

  // Calculate weekly total
  const weeklyTotal = draft?.hoursByWeekday
    ? sumHoursByWeekday(draft.hoursByWeekday)
    : 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-full gap-0 overflow-hidden">

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 overflow-hidden shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
              Departments
            </h3>
            <button
              onClick={handleAddDepartment}
              title="New department"
              className="p-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-md transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Department list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredDepartments.length > 0 ? (
            filteredDepartments.map(dept => (
              <div
                key={dept.id}
                onClick={() => setSelectedId(dept.id)}
                className={`p-3 cursor-pointer transition-all border-l-4 hover:bg-slate-50 ${
                  selectedId === dept.id
                    ? 'bg-brand-50/30 border-l-brand-600'
                    : 'border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 border border-slate-300"
                        style={{ backgroundColor: dept.color }}
                      />
                      <div className="font-semibold text-sm truncate text-slate-800">
                        {dept.name}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {dept.availableHoursPerWeek}h/week
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs">
              No departments found
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Detail panel                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        {draft ? (
          <>
            {/* Detail header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {draft.color && (
                  <div
                    className="w-9 h-9 rounded-lg border-2 border-slate-300"
                    style={{ backgroundColor: draft.color }}
                  />
                )}
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {draft.name || 'New Department'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {weeklyTotal}h/week
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscard}
                  className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-all ${
                    canSave
                      ? 'bg-brand-600 hover:bg-brand-700 text-white'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Save
                </button>
              </div>
            </div>

            {/* Delete error message */}
            {errors._delete && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{errors._delete}</p>
              </div>
            )}

            {/* Detail form (scrollable) */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">

                {/* Name */}
                <Field label="Name" required error={errors.name}>
                  <input
                    type="text"
                    value={draft.name ?? ''}
                    onChange={e => patchDraft('name', e.target.value)}
                    className={inputCls(errors.name)}
                    placeholder="e.g. Production, Assembly..."
                  />
                </Field>

                {/* Color */}
                <Field label="Color" required error={errors.color}>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.color ?? '#3B82F6'}
                      onChange={e => patchDraft('color', e.target.value)}
                      className="h-10 w-20 rounded-md border border-slate-200 cursor-pointer"
                    />
                    <span className="text-xs text-slate-500">{draft.color}</span>
                  </div>
                </Field>

                {/* Weekly total (display only) */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="text-xs font-bold text-blue-700 uppercase tracking-widest">
                    Total hours per week
                  </div>
                  <div className="text-2xl font-bold text-blue-900 mt-1">
                    {weeklyTotal}h
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    {weeklyTotal > 168 && 'Too high: max 168h'}
                    {weeklyTotal <= 0 && 'Too low: min > 0h'}
                    {weeklyTotal > 0 && weeklyTotal <= 168 && 'Valid capacity'}
                  </div>
                </div>

                {/* Daily hours inputs */}
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                    Hours per day
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(day => {
                      const dayLabels: Record<string, string> = {
                        mon: 'Mon',
                        tue: 'Tue',
                        wed: 'Wed',
                        thu: 'Thu',
                        fri: 'Fri',
                        sat: 'Sat',
                        sun: 'Sun',
                      };
                      return (
                        <div key={day}>
                          <label className="text-xs text-slate-600 font-medium block mb-0.5">
                            {dayLabels[day]}
                          </label>
                          <NumericInput
                            min={0} max={24} step={0.5}
                            value={draft.hoursByWeekday?.[day] ?? 0}
                            onChange={v => patchDraftHours(day, v ?? 0)}
                            className={inputCls(errors[`hoursByWeekday.${day}`])}
                          />
                          {errors[`hoursByWeekday.${day}`] && (
                            <p className="text-xs text-red-600 mt-0.5">
                              {errors[`hoursByWeekday.${day}`]}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {errors.hoursByWeekday && (
                    <p className="text-xs text-red-600 mt-2">{errors.hoursByWeekday}</p>
                  )}
                </div>

                {/* Resources assigned */}
                {selectedId !== '__new__' && (
                  <div className="pt-4 border-t border-slate-200">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Resources
                    </div>
                    {resourcesInSelectedDept > 0 ? (
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-md">
                        {resourcesInSelectedDept} resource{resourcesInSelectedDept !== 1 ? 's' : ''} toegewezen
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">No resources assigned</div>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* Delete button */}
            {selectedId !== '__new__' && (
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50">
                {showDeleteConfirm ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-xs text-red-700 font-semibold mb-2">
                      Are you sure? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md transition-all"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-md hover:bg-slate-50 transition-all"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!canDelete}
                    className={`w-full px-3 py-2 flex items-center justify-center gap-2 text-xs font-semibold rounded-md transition-all ${
                      canDelete
                        ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Select a department to edit
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 bg-slate-800 text-white text-xs rounded-md shadow-lg">
          {toast}
        </div>
      )}

    </div>
  );
};
