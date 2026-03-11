import React, { useState } from 'react';
import { useAppState } from './src/state/store';
import { Search, Plus, Trash2, AlertCircle, Package } from 'lucide-react';
import type { Material } from './src/state/types';

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
// Draft validation
// ---------------------------------------------------------------------------

function validateDraft(draft: Partial<Material>): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!draft.name?.trim()) errs.name = 'Name is required';
  if (!draft.unit?.trim()) errs.unit = 'Unit is required';
  return errs;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const Materials: React.FC = () => {
  const { state, addMaterial, updateMaterial, deleteMaterial } = useAppState();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Material> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const materials = state.materials ?? [];

  const filteredMaterials = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.unit.toLowerCase().includes(search.toLowerCase())
  );

  /** Count how many flow nodes reference this material */
  const usageCount = (materialId: string): number => {
    return state.nodes.filter(n =>
      n.inputMaterialId === materialId ||
      n.outputMaterialId === materialId ||
      n.productMix?.some(e => e.materialId === materialId)
    ).length;
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const patchDraft = <K extends keyof Material>(key: K, value: Material[K]) => {
    if (!draft) return;
    const updated = { ...draft, [key]: value };
    setDraft(updated);
    setIsDirty(true);
    setErrors(validateDraft(updated));
  };

  const handleAddMaterial = () => {
    const newDraft: Partial<Material> = { name: 'New Material', unit: 'st' };
    setDraft(newDraft);
    setSelectedId('__new__');
    setIsDirty(true);
    setErrors(validateDraft(newDraft));
    setShowDeleteConfirm(false);
  };

  const handleSelect = (id: string) => {
    const mat = materials.find(m => m.id === id);
    if (!mat) return;
    setSelectedId(id);
    setDraft({ ...mat });
    setErrors({});
    setIsDirty(false);
    setShowDeleteConfirm(false);
  };

  const handleSave = () => {
    if (!draft) return;
    const newErrors = validateDraft(draft);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    if (selectedId === '__new__') {
      addMaterial({ name: draft.name!.trim(), unit: draft.unit!.trim(), description: draft.description });
      showToast('Material added');
    } else if (selectedId) {
      updateMaterial({ ...(draft as Material), name: draft.name!.trim(), unit: draft.unit!.trim() });
      showToast('Material updated');
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
    if (!selectedId || selectedId === '__new__') return;
    const inUse = usageCount(selectedId);
    if (inUse > 0) {
      setErrors({ _delete: `Cannot delete: material is used in ${inUse} step${inUse !== 1 ? 's' : ''}` });
      return;
    }
    deleteMaterial(selectedId);
    showToast('Material deleted');
    setSelectedId(null);
    setDraft(null);
    setErrors({});
    setIsDirty(false);
    setShowDeleteConfirm(false);
  };

  const hasErrors = Object.keys(errors).length > 0;
  const canSave = isDirty && !hasErrors;
  const canDelete = selectedId !== '__new__' && selectedId !== null && usageCount(selectedId) === 0;

  return (
    <div className="flex h-full gap-0 overflow-hidden">

      {/* Sidebar */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
              Materials
            </h3>
            <button
              onClick={handleAddMaterial}
              title="New material"
              className="p-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-md transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

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

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredMaterials.length > 0 ? (
            filteredMaterials.map(mat => (
              <div
                key={mat.id}
                onClick={() => handleSelect(mat.id)}
                className={`p-3 cursor-pointer transition-all border-l-4 hover:bg-slate-50 ${
                  selectedId === mat.id
                    ? 'bg-brand-50/30 border-l-brand-600'
                    : 'border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="font-semibold text-sm truncate text-slate-800">{mat.name}</div>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 ml-5">{mat.unit}</div>
                  </div>
                  {usageCount(mat.id) > 0 && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                      {usageCount(mat.id)}×
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs">
              {materials.length === 0 ? 'No materials created yet' : 'No materials found'}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        {draft ? (
          <>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                  <Package className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {draft.name || 'New Material'}
                  </div>
                  <div className="text-xs text-slate-500">{draft.unit || '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscard}
                  className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-all"
                >
                  Cancel
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

            {errors._delete && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{errors._delete}</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">

                <Field label="Name" required error={errors.name}>
                  <input
                    type="text"
                    value={draft.name ?? ''}
                    onChange={e => patchDraft('name', e.target.value)}
                    className={inputCls(errors.name)}
                    placeholder="e.g. Medicine box, Jar, Sachet..."
                  />
                </Field>

                <Field label="Unit" required error={errors.unit}>
                  <input
                    type="text"
                    value={draft.unit ?? ''}
                    onChange={e => patchDraft('unit', e.target.value)}
                    className={inputCls(errors.unit)}
                    placeholder="e.g. box, jar, sachet, kg..."
                  />
                </Field>

                <Field label="Description" error={errors.description}>
                  <textarea
                    value={draft.description ?? ''}
                    onChange={e => patchDraft('description', e.target.value)}
                    className={`${inputCls()} resize-none`}
                    rows={3}
                    placeholder="Optional notes..."
                  />
                </Field>

                {selectedId !== '__new__' && (
                  <div className="pt-4 border-t border-slate-200">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Usage
                    </div>
                    {usageCount(selectedId!) > 0 ? (
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-md">
                        {usageCount(selectedId!)} step${usageCount(selectedId!) !== 1 ? 's' : ''} reference this material
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">Not used in the flow</div>
                    )}
                  </div>
                )}

              </div>
            </div>

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
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setErrors({});
                      setShowDeleteConfirm(true);
                    }}
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
            Select a material or create a new one
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 bg-slate-800 text-white text-xs rounded-md shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
};
