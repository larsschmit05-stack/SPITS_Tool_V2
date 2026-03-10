/**
 * ProcessElementCreationFlow Modal Component
 *
 * A 6-step guided wizard for creating resources in the Capaciteitstool.
 *
 * Steps:
 * 1. Class selection (processing, buffer, transport, delay)
 * 2. Basic information (name, department)
 * 3. Class-specific parameters
 * 4. Advanced settings (availability, yield, etc.)
 * 5. Capacity preview & validation
 * 6. Confirmation & save
 */

import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, AlertCircle, CheckCircle } from 'lucide-react';
import type { Resource, ResourceClass, Department } from './src/state/types';
import { computeCapacityPreview } from './src/utils/capacityCalculation';
import { validateResourceForCreation } from './src/engine/validators';

interface ProcessElementCreationFlowProps {
  departments: Department[];
  onCreateResource: (resource: Omit<Resource, 'id'>) => void;
  onClose: () => void;
}

type FlowStep = 1 | 2 | 3 | 4 | 5 | 6;

interface FormState {
  resourceClass?: ResourceClass;
  name?: string;
  departmentId?: string;
  // Processing
  processingMode?: 'continuous' | 'batch' | 'manual';
  outputPerHour?: number;
  batchSize?: number;
  cycleTimeMinutes?: number;
  batchSetupMinutes?: number;
  // Buffer
  slotCapacity?: number;
  dwellTimeMinutes?: number;
  safetyMarginPct?: number;
  // Transport
  transportMode?: 'continuous' | 'discrete';
  unitsPerTrip?: number;
  tripDurationMinutes?: number;
  // Delay
  delayTimeMinutes?: number;
  delayMode?: 'per_unit' | 'per_batch';
  // Advanced
  parallelUnits: number;
  availability: number;
  yieldPct: number;
  dailyStartupMinutes: number;
}

const CLASS_OPTIONS: { value: ResourceClass; label: string; description: string }[] = [
  { value: 'processing', label: 'Verwerking', description: 'Machine, lijn of handmatige bewerking' },
  { value: 'buffer', label: 'Buffer', description: 'Opslag- of wachtruimte' },
  { value: 'transport', label: 'Transport', description: 'Intern transport' },
  { value: 'delay', label: 'Technische Vertraging', description: 'Wachttijd (koelen, drogen, etc.)' },
];

const STEP_LABELS: Record<FlowStep, string> = {
  1: 'Type kiezen',
  2: 'Basisinformatie',
  3: 'Parameters',
  4: 'Geavanceerde instellingen',
  5: 'Capaciteit controleren',
  6: 'Bevestigen',
};

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, required, error, children }) => (
  <div>
    <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-1.5">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
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

// Step 1: Class Selection
const Step1_ClassSelection: React.FC<{
  form: FormState;
  errors: Record<string, string>;
  onUpdate: (cls: ResourceClass) => void;
}> = ({ form, onUpdate }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-slate-900 mb-4">Welk type proces-element wil je aanmaken?</h3>
    <div className="space-y-2">
      {CLASS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onUpdate(opt.value)}
          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
            form.resourceClass === opt.value
              ? 'border-brand-500 bg-brand-50'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="font-semibold text-sm text-slate-800">{opt.label}</div>
          <div className="text-xs text-slate-500 mt-0.5">{opt.description}</div>
        </button>
      ))}
    </div>
  </div>
);

// Step 2: Basic Information
const Step2_BasicInfo: React.FC<{
  form: FormState;
  errors: Record<string, string>;
  departments: Department[];
  onUpdate: (updates: Partial<FormState>) => void;
}> = ({ form, errors, departments, onUpdate }) => (
  <div className="space-y-4">
    <Field label="Naam" required error={errors.name}>
      <input
        type="text"
        value={form.name ?? ''}
        onChange={e => onUpdate({ name: e.target.value })}
        placeholder="bijv. Pakketteringsmachine"
        className={inputCls(errors.name)}
      />
    </Field>

    {form.resourceClass !== 'delay' && (
      <Field label="Afdeling" required error={errors.departmentId}>
        <select
          value={form.departmentId ?? ''}
          onChange={e => onUpdate({ departmentId: e.target.value })}
          className={inputCls(errors.departmentId)}
        >
          <option value="">— Selecteer afdeling —</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </Field>
    )}
  </div>
);

// Step 3: Class-Specific Parameters
const Step3_Parameters: React.FC<{
  form: FormState;
  errors: Record<string, string>;
  onUpdate: (updates: Partial<FormState>) => void;
}> = ({ form, errors, onUpdate }) => {
  if (!form.resourceClass) return <div>Select a class first</div>;

  if (form.resourceClass === 'processing') {
    return (
      <div className="space-y-4">
        <Field label="Verwerkingsmodus">
          <select
            value={form.processingMode ?? 'continuous'}
            onChange={e => onUpdate({
              processingMode: e.target.value as any,
              outputPerHour: undefined,
              batchSize: undefined,
              cycleTimeMinutes: undefined,
            })}
            className={inputCls()}
          >
            <option value="continuous">Continu (uursnelheid)</option>
            <option value="manual">Handmatig / Arbeid (cyclustijd)</option>
            <option value="batch">Batch (grootte + cyclustijd)</option>
          </select>
        </Field>

        {(form.processingMode === 'continuous' || form.processingMode === 'manual') && (
          <Field label={form.processingMode === 'manual' ? 'Cyclustijd (min/eenheid)' : 'Doorvoer (eenheden/uur)'} required error={errors.outputPerHour}>
            <input
              type="number"
              value={form.outputPerHour ?? ''}
              onChange={e => onUpdate({ outputPerHour: e.target.value ? parseFloat(e.target.value) : undefined })}
              placeholder={form.processingMode === 'manual' ? '0.5' : '100'}
              className={inputCls(errors.outputPerHour)}
            />
          </Field>
        )}

        {form.processingMode === 'batch' && (
          <>
            <Field label="Batchgrootte (eenheden)" required error={errors.batchSize}>
              <input
                type="number"
                value={form.batchSize ?? ''}
                onChange={e => onUpdate({ batchSize: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="50"
                className={inputCls(errors.batchSize)}
              />
            </Field>
            <Field label="Cyclustijd (minuten)" required error={errors.cycleTimeMinutes}>
              <input
                type="number"
                value={form.cycleTimeMinutes ?? ''}
                onChange={e => onUpdate({ cycleTimeMinutes: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="30"
                className={inputCls(errors.cycleTimeMinutes)}
              />
            </Field>
            <Field label="Voorbereidingstijd per batch (minuten)">
              <input
                type="number"
                value={form.batchSetupMinutes ?? ''}
                onChange={e => onUpdate({ batchSetupMinutes: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="5"
                className={inputCls()}
              />
            </Field>
          </>
        )}
      </div>
    );
  }

  if (form.resourceClass === 'buffer') {
    return (
      <div className="space-y-4">
        <Field label="Maximale capaciteit" required error={errors.slotCapacity}>
          <input
            type="number"
            value={form.slotCapacity ?? ''}
            onChange={e => onUpdate({ slotCapacity: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="100"
            className={inputCls(errors.slotCapacity)}
          />
        </Field>
        <Field label="Verblijftijd (minuten)" required error={errors.dwellTimeMinutes}>
          <input
            type="number"
            value={form.dwellTimeMinutes ?? ''}
            onChange={e => onUpdate({ dwellTimeMinutes: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="60"
            className={inputCls(errors.dwellTimeMinutes)}
          />
        </Field>
        <Field label="Veiligheidsmarge (%)">
          <input
            type="number"
            value={form.safetyMarginPct ?? 0}
            onChange={e => onUpdate({ safetyMarginPct: parseFloat(e.target.value) })}
            min="0"
            max="50"
            className={inputCls()}
          />
        </Field>
      </div>
    );
  }

  if (form.resourceClass === 'transport') {
    return (
      <div className="space-y-4">
        <Field label="Transporttype">
          <select
            value={form.transportMode ?? 'discrete'}
            onChange={e => onUpdate({
              transportMode: e.target.value as any,
              unitsPerTrip: undefined,
              tripDurationMinutes: undefined,
              outputPerHour: undefined,
            })}
            className={inputCls()}
          >
            <option value="discrete">Rit-gebaseerd (vracht + ritduur)</option>
            <option value="continuous">Continu (band/conveyor)</option>
          </select>
        </Field>

        {form.transportMode === 'discrete' && (
          <>
            <Field label="Lading per rit (eenheden)" required error={errors.unitsPerTrip}>
              <input
                type="number"
                value={form.unitsPerTrip ?? ''}
                onChange={e => onUpdate({ unitsPerTrip: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="50"
                className={inputCls(errors.unitsPerTrip)}
              />
            </Field>
            <Field label="Ritduur (minuten)" required error={errors.tripDurationMinutes}>
              <input
                type="number"
                value={form.tripDurationMinutes ?? ''}
                onChange={e => onUpdate({ tripDurationMinutes: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="15"
                className={inputCls(errors.tripDurationMinutes)}
              />
            </Field>
          </>
        )}

        {form.transportMode === 'continuous' && (
          <Field label="Doorvoer (eenheden/uur)" required error={errors.outputPerHour}>
            <input
              type="number"
              value={form.outputPerHour ?? ''}
              onChange={e => onUpdate({ outputPerHour: e.target.value ? parseFloat(e.target.value) : undefined })}
              placeholder="500"
              className={inputCls(errors.outputPerHour)}
            />
          </Field>
        )}
      </div>
    );
  }

  if (form.resourceClass === 'delay') {
    return (
      <div className="space-y-4">
        <Field label="Wachttijd (minuten)" required error={errors.delayTimeMinutes}>
          <input
            type="number"
            value={form.delayTimeMinutes ?? ''}
            onChange={e => onUpdate({ delayTimeMinutes: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="30"
            className={inputCls(errors.delayTimeMinutes)}
          />
        </Field>
        <Field label="Hoe geldt de vertraging?">
          <select
            value={form.delayMode ?? 'per_unit'}
            onChange={e => onUpdate({ delayMode: e.target.value as any })}
            className={inputCls()}
          >
            <option value="per_unit">Per eenheid</option>
            <option value="per_batch">Per batch</option>
          </select>
        </Field>
      </div>
    );
  }

  return <div>Unknown class</div>;
};

// Step 4: Advanced Settings
const Step4_AdvancedSettings: React.FC<{
  form: FormState;
  onUpdate: (updates: Partial<FormState>) => void;
}> = ({ form, onUpdate }) => {
  // Delay resources don't have these settings
  if (form.resourceClass === 'delay') {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <p className="text-sm text-slate-600">Technische vertragingen hebben geen geavanceerde instellingen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field
        label="Aantal gelijktijdig actief"
        tooltip="Hoeveel machines, medewerkers of middelen tegelijk deze stap uitvoeren"
      >
        <input
          type="number"
          value={form.parallelUnits}
          onChange={e => onUpdate({ parallelUnits: parseInt(e.target.value) || 1 })}
          min="1"
          className={inputCls()}
        />
      </Field>

      <Field label="Beschikbaarheid (%)">
        <input
          type="number"
          value={form.availability * 100}
          onChange={e => onUpdate({ availability: parseFloat(e.target.value) / 100 })}
          min="0"
          max="100"
          step="1"
          className={inputCls()}
        />
      </Field>

      {form.resourceClass !== 'buffer' && (
        <Field label="Uitvoering (%)">
          <input
            type="number"
            value={form.yieldPct}
            onChange={e => onUpdate({ yieldPct: parseFloat(e.target.value) || 100 })}
            min="0"
            max="100"
            step="0.1"
            className={inputCls()}
          />
        </Field>
      )}

      {form.resourceClass === 'processing' && (
        <Field label="Opstarttijd per dag (minuten)">
          <input
            type="number"
            value={form.dailyStartupMinutes}
            onChange={e => onUpdate({ dailyStartupMinutes: parseFloat(e.target.value) || 0 })}
            min="0"
            className={inputCls()}
          />
        </Field>
      )}
    </div>
  );
};

// Step 5: Capacity Preview & Validation
const Step5_CapacityPreview: React.FC<{
  form: FormState;
  departments: Department[];
  errors: Record<string, string>;
}> = ({ form, departments, errors }) => {
  const avgDeptHoursPerDay = (() => {
    if (!form.departmentId) return null;
    const dept = departments.find(d => d.id === form.departmentId);
    if (!dept) return null;
    const days = Object.values(dept.hoursByWeekday).filter(h => h > 0).length || 1;
    return dept.availableHoursPerWeek / days;
  })();

  const preview = computeCapacityPreview(form as any, avgDeptHoursPerDay);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border-2 p-4 ${hasErrors ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
        {hasErrors ? (
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-red-900 mb-2">Validatiefouten</h4>
              <ul className="text-sm text-red-800 space-y-1">
                {Object.entries(errors).map(([field, msg]) => (
                  <li key={field}>• {msg}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-green-900 mb-2">Validatie geslaagd</h4>
              <p className="text-sm text-green-800">Al je instellingen zijn correct ingesteld.</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h4 className="font-semibold text-sm text-slate-900 mb-3">Capaciteitsoverzicht</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Theoretische snelheid:</span>
            <span className="font-mono text-slate-900">
              {preview.theoreticalRate === null ? '—' : preview.theoreticalRate.toFixed(1)} /uur
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Effectieve snelheid:</span>
            <span className="font-mono text-slate-900">
              {preview.effectiveRate === null ? '—' : preview.effectiveRate.toFixed(1)} /uur
            </span>
          </div>
        </div>

        {preview.warnings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <h5 className="text-xs font-semibold text-slate-700 uppercase mb-2">Waarschuwingen</h5>
            {preview.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 mb-1">• {w}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Step 6: Confirmation
const Step6_Confirmation: React.FC<{
  form: FormState;
  departments: Department[];
}> = ({ form, departments }) => {
  const dept = form.departmentId ? departments.find(d => d.id === form.departmentId) : null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-900">Controleer je instellingen</h3>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Naam:</span>
          <span className="font-semibold text-slate-900">{form.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Type:</span>
          <span className="font-semibold text-slate-900">
            {CLASS_OPTIONS.find(o => o.value === form.resourceClass)?.label}
          </span>
        </div>
        {form.departmentId && (
          <div className="flex justify-between">
            <span className="text-slate-600">Afdeling:</span>
            <span className="font-semibold text-slate-900">{dept?.name}</span>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        Klik op "Aanmaken" om dit proces-element aan te maken.
      </div>
    </div>
  );
};

// Main Component
export const ProcessElementCreationFlow: React.FC<ProcessElementCreationFlowProps> = ({
  departments,
  onCreateResource,
  onClose,
}) => {
  const [step, setStep] = useState<FlowStep>(1);
  const [form, setForm] = useState<FormState>({
    parallelUnits: 1,
    availability: 1,
    yieldPct: 100,
    dailyStartupMinutes: 0,
  });

  const deptIds = departments.map(d => d.id);
  const errors = validateResourceForCreation(form, deptIds);

  const updateForm = (updates: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const canProceed = (): boolean => {
    if (step === 1) return !!form.resourceClass;
    if (step === 2) return !!(form.name && (form.resourceClass === 'delay' || form.departmentId));
    if (step === 3 || step === 4) return Object.keys(errors).length === 0;
    if (step === 5) return Object.keys(errors).length === 0;
    if (step === 6) return true;
    return false;
  };

  const handleCreate = () => {
    if (Object.keys(errors).length > 0) return;

    const resource: Omit<Resource, 'id'> = {
      name: form.name ?? 'Untitled',
      type: form.processingMode ?? 'continuous',
      resourceClass: form.resourceClass,
      departmentId: form.departmentId,
      processingMode: form.processingMode,
      outputPerHour: form.outputPerHour,
      batchSize: form.batchSize,
      cycleTimeMinutes: form.cycleTimeMinutes,
      batchSetupMinutes: form.batchSetupMinutes,
      slotCapacity: form.slotCapacity,
      dwellTimeMinutes: form.dwellTimeMinutes,
      safetyMarginPct: form.safetyMarginPct,
      transportMode: form.transportMode,
      unitsPerTrip: form.unitsPerTrip,
      tripDurationMinutes: form.tripDurationMinutes,
      delayTimeMinutes: form.delayTimeMinutes,
      delayMode: form.delayMode,
      parallelUnits: form.parallelUnits,
      availability: form.availability,
      yieldPct: form.yieldPct,
      dailyStartupMinutes: form.dailyStartupMinutes,
    };

    onCreateResource(resource);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Nieuw proces-element</h2>
            <p className="text-xs text-slate-500 mt-1">Stap {step} van 6: {STEP_LABELS[step]}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-200">
          <div
            className="h-full bg-brand-600 transition-all"
            style={{ width: `${(step / 6) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && <Step1_ClassSelection form={form} errors={errors} onUpdate={cls => updateForm({ resourceClass: cls })} />}
          {step === 2 && <Step2_BasicInfo form={form} errors={errors} departments={departments} onUpdate={updateForm} />}
          {step === 3 && <Step3_Parameters form={form} errors={errors} onUpdate={updateForm} />}
          {step === 4 && <Step4_AdvancedSettings form={form} onUpdate={updateForm} />}
          {step === 5 && <Step5_CapacityPreview form={form} departments={departments} errors={errors} />}
          {step === 6 && <Step6_Confirmation form={form} departments={departments} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => setStep(Math.max(1, step - 1) as FlowStep)}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Terug
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Annuleer
            </button>

            {step < 6 ? (
              <button
                onClick={() => setStep(Math.min(6, step + 1) as FlowStep)}
                disabled={!canProceed()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Volgende
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={!canProceed() || Object.keys(errors).length > 0}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Aanmaken
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
