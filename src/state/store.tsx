import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type {
  ProjectState,
  Material,
  Resource,
  ResourceTemplate,
  Department,
  ProcessStep,
  Scenario,
  ScenarioPatch,
  FlowNode,
  FlowEdge,
  ProductMixEntry,
} from './types';
import type { RunBundle } from '../engine/types';
import { DEFAULT_PROJECT_STATE } from './seed';

const STORAGE_KEY = 'capaciteitstool_state_v2';

/** State keys that are persisted to localStorage. Runtime-only keys are excluded. */
const PERSISTED_STATE_KEYS: (keyof ProjectState)[] = [
  'materials',
  'resources',
  'templates',
  'departments',
  'steps',
  'scenarios',
  'activeScenarioId',
  'nodes',
  'edges',
  'lastUsedDepartmentId',
  // 'latestRunResult' → runtime-only, NOT persisted
  // 'isDirty' → runtime-only, NOT persisted
];

function persistState(state: ProjectState): void {
  const toPersist = Object.fromEntries(
    PERSISTED_STATE_KEYS.map(k => [k, state[k]])
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
}

/** Utility to generate unique IDs */
const uid = () => Math.random().toString(36).slice(2, 11);

/** Calculate total hours from hoursByWeekday */
function sumHoursByWeekday(hoursByWeekday: Department['hoursByWeekday']): number {
  return (
    hoursByWeekday.mon +
    hoursByWeekday.tue +
    hoursByWeekday.wed +
    hoursByWeekday.thu +
    hoursByWeekday.fri +
    hoursByWeekday.sat +
    hoursByWeekday.sun
  );
}

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type AppAction =
  // Materials
  | { type: 'ADD_MATERIAL'; payload: Material }
  | { type: 'UPDATE_MATERIAL'; payload: Material }
  | { type: 'DELETE_MATERIAL'; payload: string }
  // Node material conversion
  | { type: 'SET_NODE_MATERIAL_CONVERSION'; payload: { nodeId: string; inputMaterialId: string; outputMaterialId: string; conversionRatio: number } }
  | { type: 'CLEAR_NODE_MATERIAL_CONVERSION'; payload: { nodeId: string } }
  // Source product mix
  | { type: 'SET_SOURCE_PRODUCT_MIX'; payload: { nodeId: string; entries: ProductMixEntry[] } }
  // Resources
  | { type: 'ADD_RESOURCE'; payload: Resource }
  | { type: 'SET_LAST_USED_DEPARTMENT'; payload: string | null }
  | { type: 'UPDATE_RESOURCE'; payload: Resource }
  | { type: 'DELETE_RESOURCE'; payload: string }
  // Resource library (legacy — kept for backward compat)
  | { type: 'MARK_AS_TEMPLATE'; payload: string }
  | { type: 'UNMARK_TEMPLATE'; payload: string }
  | { type: 'INSTANTIATE_FROM_TEMPLATE'; payload: { templateId: string; newName: string; newId: string } }
  | { type: 'ASSIGN_TAG_TO_RESOURCE'; payload: { resourceId: string; tag: string } }
  | { type: 'REMOVE_TAG_FROM_RESOURCE'; payload: { resourceId: string; tag: string } }
  // Template management (v2 — templates[] is the source of truth)
  | { type: 'SAVE_AS_TEMPLATE'; payload: ResourceTemplate }
  | { type: 'UPDATE_TEMPLATE'; payload: { id: string; patch: Partial<Pick<ResourceTemplate, 'name' | 'industry' | 'defaultConfig'>> } }
  | { type: 'DELETE_TEMPLATE'; payload: string }
  // Departments
  | { type: 'ADD_DEPARTMENT'; payload: Department }
  | { type: 'UPDATE_DEPARTMENT'; payload: Department }
  | { type: 'DELETE_DEPARTMENT'; payload: string }
  // Steps
  | { type: 'ADD_STEP'; payload: ProcessStep }
  | { type: 'UPDATE_STEP'; payload: ProcessStep }
  | { type: 'DELETE_STEP'; payload: string }
  // Scenarios
  | { type: 'ADD_SCENARIO'; payload: { name: string } }
  | { type: 'UPDATE_SCENARIO'; payload: { id: string; patch: ScenarioPatch } }
  | { type: 'DELETE_SCENARIO'; payload: string }
  | { type: 'DUPLICATE_SCENARIO'; payload: string }
  | { type: 'SET_ACTIVE_SCENARIO'; payload: string }
  | { type: 'SET_RESOURCE_OVERRIDE'; payload: { scenarioId: string; resourceId: string; override: Partial<Omit<Resource, 'id' | 'departmentId'>> } }
  | { type: 'CLEAR_RESOURCE_OVERRIDE'; payload: { scenarioId: string; resourceId: string } }
  | { type: 'SET_DEPARTMENT_SCHEDULE_OVERRIDE'; payload: { scenarioId: string; departmentId: string; override: Partial<Department['hoursByWeekday']> } }
  | { type: 'CLEAR_DEPARTMENT_SCHEDULE_OVERRIDE'; payload: { scenarioId: string; departmentId: string } }
  // Flow nodes
  | { type: 'ADD_NODE'; payload: FlowNode }
  | { type: 'UPDATE_NODE'; payload: { id: string; patch: Partial<FlowNode> } }
  | { type: 'DELETE_NODE'; payload: string }
  | { type: 'DELETE_NODES'; payload: string[] }
  | { type: 'DUPLICATE_NODE'; payload: string }
  | { type: 'SET_NODE_RESOURCE'; payload: { nodeId: string; resourceId: string } }
  | { type: 'SET_NODE_DURATION'; payload: { nodeId: string; durationMinutesPerUnit: number } }
  | { type: 'ENSURE_SOURCE_AND_SINK' }
  // Flow edges
  | { type: 'ADD_EDGE'; payload: FlowEdge }
  | { type: 'DELETE_EDGE'; payload: string }
  // Run result (runtime-only)
  | { type: 'SET_RUN_RESULT'; payload: RunBundle | null }
  | { type: 'LOAD_STATE'; payload: ProjectState };

// ---------------------------------------------------------------------------
// Domain helpers for testability and pure logic
// ---------------------------------------------------------------------------

export function createScenario(name: string): Scenario {
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    tags: [],
  };
}

export function patchScenario(scenario: Scenario, patch: ScenarioPatch): Scenario {
  return { ...scenario, ...patch };
}

export function duplicateScenarioFn(scenario: Scenario): Scenario {
  return {
    ...scenario,
    id: uid(),
    name: `${scenario.name} (Copy)`,
    createdAt: Date.now(),
  };
}

export function enforceScenarioConstraints(scenarios: Scenario[]): Array<{ type: string; message: string }> {
  const violations: Array<{ type: string; message: string }> = [];
  if (scenarios.length > 2) {
    violations.push({ type: 'MAX_SCENARIOS_EXCEEDED', message: 'Cannot exceed 2 scenarios' });
  }
  const ids = new Set(scenarios.map(s => s.id));
  if (ids.size !== scenarios.length) {
    violations.push({ type: 'DUPLICATE_SCENARIO_ID', message: 'Duplicate scenario IDs detected' });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function appReducer(state: ProjectState, action: AppAction): ProjectState {
  switch (action.type) {
    // --- Materials ---
    case 'ADD_MATERIAL':
      return { ...state, materials: [...(state.materials ?? []), action.payload], isDirty: true };

    case 'UPDATE_MATERIAL':
      return {
        ...state,
        materials: (state.materials ?? []).map(m =>
          m.id === action.payload.id ? action.payload : m
        ),
        isDirty: true,
      };

    case 'DELETE_MATERIAL':
      return {
        ...state,
        materials: (state.materials ?? []).filter(m => m.id !== action.payload),
        isDirty: true,
      };

    case 'SET_NODE_MATERIAL_CONVERSION': {
      const { nodeId, inputMaterialId, outputMaterialId, conversionRatio } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === nodeId
            ? { ...n, inputMaterialId, outputMaterialId, conversionRatio, updatedAt: Date.now() }
            : n
        ),
        isDirty: true,
      };
    }

    case 'CLEAR_NODE_MATERIAL_CONVERSION': {
      const { nodeId } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map(n => {
          if (n.id !== nodeId) return n;
          const { inputMaterialId: _i, outputMaterialId: _o, conversionRatio: _c, ...rest } = n;
          return { ...rest, updatedAt: Date.now() };
        }),
        isDirty: true,
      };
    }

    case 'SET_SOURCE_PRODUCT_MIX': {
      const { nodeId, entries } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === nodeId && n.nodeType === 'start'
            ? { ...n, productMix: entries, updatedAt: Date.now() }
            : n
        ),
        isDirty: true,
      };
    }

    // --- Resources ---
    case 'ADD_RESOURCE':
      return { ...state, resources: [...state.resources, action.payload], isDirty: true };

    case 'SET_LAST_USED_DEPARTMENT':
      return { ...state, lastUsedDepartmentId: action.payload, isDirty: true };

    case 'UPDATE_RESOURCE':
      return {
        ...state,
        resources: state.resources.map(r =>
          r.id === action.payload.id ? action.payload : r
        ),
        isDirty: true,
      };

    case 'DELETE_RESOURCE':
      return {
        ...state,
        resources: state.resources.filter(r => r.id !== action.payload),
        isDirty: true,
      };

    // --- Resource library (legacy actions kept for backward compat) ---
    case 'MARK_AS_TEMPLATE':
      return {
        ...state,
        resources: state.resources.map(r =>
          r.id === action.payload ? { ...r, isTemplate: true } : r
        ),
        isDirty: true,
      };

    case 'UNMARK_TEMPLATE':
      return {
        ...state,
        resources: state.resources.map(r =>
          r.id === action.payload ? { ...r, isTemplate: false } : r
        ),
        isDirty: true,
      };

    case 'INSTANTIATE_FROM_TEMPLATE': {
      // Support both legacy (resource-based) and v2 (templates[]) templates
      const tmpl = state.templates.find(t => t.id === action.payload.templateId);
      if (tmpl) {
        // v2 path: instantiate from ResourceTemplate
        const instance: Resource = {
          id: action.payload.newId,
          name: action.payload.newName,
          type: (tmpl.defaultConfig.type as Resource['type']) ?? 'continuous',
          resourceClass: tmpl.resourceClass,
          processingMode: tmpl.processingMode,
          transportMode: tmpl.transportMode,
          departmentId: '', // caller must set departmentId after instantiation
          parallelUnits: tmpl.defaultConfig.parallelUnits ?? 1,
          yieldPct: tmpl.defaultConfig.yieldPct ?? 100,
          availability: tmpl.defaultConfig.availability ?? 1,
          dailyStartupMinutes: tmpl.defaultConfig.dailyStartupMinutes ?? 0,
          ...tmpl.defaultConfig,
          templateSourceId: tmpl.id,
          isTemplate: false,
          tags: [],
        };
        return { ...state, resources: [...state.resources, instance], isDirty: true };
      }

      // Legacy path: instantiate from resource with isTemplate = true
      const legacyTemplate = state.resources.find(r => r.id === action.payload.templateId);
      if (!legacyTemplate) return state;
      const instance: Resource = {
        ...legacyTemplate,
        id: action.payload.newId,
        name: action.payload.newName,
        templateSourceId: legacyTemplate.id,
        isTemplate: false,
        tags: legacyTemplate.tags ? [...legacyTemplate.tags] : [],
      };
      return { ...state, resources: [...state.resources, instance], isDirty: true };
    }

    // --- Template management (v2) ---
    case 'SAVE_AS_TEMPLATE':
      return {
        ...state,
        templates: [...state.templates, action.payload],
        isDirty: true,
      };

    case 'UPDATE_TEMPLATE': {
      const { id, patch } = action.payload;
      return {
        ...state,
        templates: state.templates.map(t =>
          t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
        ),
        isDirty: true,
      };
    }

    case 'DELETE_TEMPLATE': {
      return {
        ...state,
        templates: state.templates.filter(t => t.id !== action.payload),
        // Orphan references in resources are acceptable — templateSourceId becomes a dead ref
        isDirty: true,
      };
    }

    case 'ASSIGN_TAG_TO_RESOURCE':
      return {
        ...state,
        resources: state.resources.map(r => {
          if (r.id !== action.payload.resourceId) return r;
          const existing = r.tags ?? [];
          if (existing.includes(action.payload.tag)) return r;
          return { ...r, tags: [...existing, action.payload.tag] };
        }),
        isDirty: true,
      };

    case 'REMOVE_TAG_FROM_RESOURCE':
      return {
        ...state,
        resources: state.resources.map(r => {
          if (r.id !== action.payload.resourceId) return r;
          return { ...r, tags: (r.tags ?? []).filter(t => t !== action.payload.tag) };
        }),
        isDirty: true,
      };

    // --- Departments ---
    case 'ADD_DEPARTMENT':
      return {
        ...state,
        departments: [...state.departments, action.payload],
        isDirty: true,
      };

    case 'UPDATE_DEPARTMENT':
      return {
        ...state,
        departments: state.departments.map(d =>
          d.id === action.payload.id ? action.payload : d
        ),
        isDirty: true,
      };

    case 'DELETE_DEPARTMENT': {
      const deptId = action.payload;
      const resourcesInDept = state.resources.filter(r => r.departmentId === deptId).length;

      if (resourcesInDept > 0) {
        console.warn(
          `Cannot delete department ${deptId}: ${resourcesInDept} resources assigned`
        );
        return state; // Silently reject
      }

      return {
        ...state,
        departments: state.departments.filter(d => d.id !== deptId),
        isDirty: true,
      };
    }

    // --- Steps ---
    case 'ADD_STEP':
      return { ...state, steps: [...state.steps, action.payload], isDirty: true };

    case 'UPDATE_STEP':
      return {
        ...state,
        steps: state.steps.map(s =>
          s.id === action.payload.id ? action.payload : s
        ),
        isDirty: true,
      };

    case 'DELETE_STEP':
      return {
        ...state,
        steps: state.steps.filter(s => s.id !== action.payload),
        isDirty: true,
      };

    // --- Scenarios ---
    case 'ADD_SCENARIO': {
      // Enforce max 2 scenarios
      if (state.scenarios.length >= 2) {
        console.warn('Cannot add scenario: max 2 reached');
        return state;
      }
      const newScenario = createScenario(action.payload.name);
      return {
        ...state,
        scenarios: [...state.scenarios, newScenario],
        isDirty: true,
      };
    }

    case 'UPDATE_SCENARIO': {
      const { id, patch } = action.payload;
      // Warn if override IDs don't exist (soft validation at state level)
      if (patch.resourceOverrides) {
        for (const resourceId of Object.keys(patch.resourceOverrides)) {
          if (!state.resources.some(r => r.id === resourceId)) {
            console.warn(`UPDATE_SCENARIO: unknown resource ID in overrides: ${resourceId}`);
          }
        }
      }
      if (patch.departmentScheduleOverrides) {
        for (const deptId of Object.keys(patch.departmentScheduleOverrides)) {
          if (!state.departments.some(d => d.id === deptId)) {
            console.warn(`UPDATE_SCENARIO: unknown department ID in overrides: ${deptId}`);
          }
        }
      }
      return {
        ...state,
        scenarios: state.scenarios.map(s =>
          s.id === id ? patchScenario(s, patch) : s
        ),
        isDirty: true,
      };
    }

    case 'DELETE_SCENARIO': {
      const remaining = state.scenarios.filter(s => s.id !== action.payload);
      if (remaining.length === 0) return state;
      return {
        ...state,
        scenarios: remaining,
        activeScenarioId:
          state.activeScenarioId === action.payload
            ? remaining[0].id
            : state.activeScenarioId,
        isDirty: true,
      };
    }

    case 'DUPLICATE_SCENARIO': {
      // Enforce max 2 scenarios
      if (state.scenarios.length >= 2) {
        console.warn('Cannot duplicate scenario: max 2 reached');
        return state;
      }
      const src = state.scenarios.find(s => s.id === action.payload);
      if (!src) return state;
      const duplicated = duplicateScenarioFn(src);
      return {
        ...state,
        scenarios: [...state.scenarios, duplicated],
        isDirty: true,
      };
    }

    case 'SET_ACTIVE_SCENARIO':
      if (!state.scenarios.some(s => s.id === action.payload)) return state;
      return { ...state, activeScenarioId: action.payload };

    case 'SET_RESOURCE_OVERRIDE': {
      const { scenarioId, resourceId, override } = action.payload;
      const scenario = state.scenarios.find(s => s.id === scenarioId);
      if (!scenario) return state;
      const updated = patchScenario(scenario, {
        resourceOverrides: {
          ...(scenario.resourceOverrides ?? {}),
          [resourceId]: {
            ...(scenario.resourceOverrides?.[resourceId] ?? {}),
            ...override,
          },
        },
      });
      return {
        ...state,
        scenarios: state.scenarios.map(s => (s.id === scenarioId ? updated : s)),
        isDirty: true,
      };
    }

    case 'CLEAR_RESOURCE_OVERRIDE': {
      const { scenarioId, resourceId } = action.payload;
      const scenario = state.scenarios.find(s => s.id === scenarioId);
      if (!scenario) return state;
      const overrides = { ...(scenario.resourceOverrides ?? {}) };
      delete overrides[resourceId];
      const updated = patchScenario(scenario, { resourceOverrides: overrides });
      return {
        ...state,
        scenarios: state.scenarios.map(s => (s.id === scenarioId ? updated : s)),
        isDirty: true,
      };
    }

    case 'SET_DEPARTMENT_SCHEDULE_OVERRIDE': {
      const { scenarioId, departmentId, override } = action.payload;
      const scenario = state.scenarios.find(s => s.id === scenarioId);
      if (!scenario) return state;
      // Validate hours [0, 24]
      for (const [day, hours] of Object.entries(override)) {
        if (typeof hours === 'number' && (hours < 0 || hours > 24)) {
          console.warn(`SET_DEPARTMENT_SCHEDULE_OVERRIDE: invalid hours for ${day}: ${hours}`);
          return state;
        }
      }
      const updated = patchScenario(scenario, {
        departmentScheduleOverrides: {
          ...(scenario.departmentScheduleOverrides ?? {}),
          [departmentId]: {
            ...(scenario.departmentScheduleOverrides?.[departmentId] ?? {}),
            ...override,
          },
        },
      });
      return {
        ...state,
        scenarios: state.scenarios.map(s => (s.id === scenarioId ? updated : s)),
        isDirty: true,
      };
    }

    case 'CLEAR_DEPARTMENT_SCHEDULE_OVERRIDE': {
      const { scenarioId, departmentId } = action.payload;
      const scenario = state.scenarios.find(s => s.id === scenarioId);
      if (!scenario) return state;
      const overrides = { ...(scenario.departmentScheduleOverrides ?? {}) };
      delete overrides[departmentId];
      const updated = patchScenario(scenario, { departmentScheduleOverrides: overrides });
      return {
        ...state,
        scenarios: state.scenarios.map(s => (s.id === scenarioId ? updated : s)),
        isDirty: true,
      };
    }

    // --- Flow nodes ---
    case 'ADD_NODE': {
      const newNodes = [...state.nodes, action.payload];
      return { ...state, nodes: newNodes, isDirty: true };
    }

    case 'UPDATE_NODE':
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.payload.id
            ? { ...n, ...action.payload.patch, updatedAt: Date.now() }
            : n
        ),
        isDirty: true,
      };

    case 'DELETE_NODE':
      return {
        ...state,
        nodes: state.nodes.filter(n => n.id !== action.payload),
        edges: state.edges.filter(
          e => e.source !== action.payload && e.target !== action.payload
        ),
        isDirty: true,
      };

    case 'DELETE_NODES': {
      const idSet = new Set(action.payload);
      return {
        ...state,
        nodes: state.nodes.filter(n => !idSet.has(n.id)),
        edges: state.edges.filter(e => !idSet.has(e.source) && !idSet.has(e.target)),
        isDirty: true,
      };
    }

    case 'DUPLICATE_NODE': {
      const src = state.nodes.find(n => n.id === action.payload);
      if (!src) return state;
      const newNode: FlowNode = {
        ...src,
        id: uid(),
        name: `${src.name} (Copy)`,
        position: { x: src.position.x + 30, y: src.position.y + 30 },
        updatedAt: Date.now(),
      };
      return { ...state, nodes: [...state.nodes, newNode], isDirty: true };
    }

    case 'SET_NODE_RESOURCE': {
      const { nodeId, resourceId } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === nodeId && n.nodeType === 'resourceStep'
            ? { ...n, resourceId, updatedAt: Date.now() }
            : n
        ),
        isDirty: true,
      };
    }

    case 'SET_NODE_DURATION': {
      const { nodeId, durationMinutesPerUnit } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === nodeId && n.nodeType === 'timeStep'
            ? { ...n, durationMinutesPerUnit, updatedAt: Date.now() }
            : n
        ),
        isDirty: true,
      };
    }

    case 'ENSURE_SOURCE_AND_SINK': {
      const hasStart = state.nodes.some(n => n.nodeType === 'start');
      const hasEnd = state.nodes.some(n => n.nodeType === 'end');
      if (hasStart && hasEnd) return state; // Nothing to do
      let nodes = [...state.nodes];
      if (!hasStart) {
        nodes = [...nodes, { id: uid(), nodeType: 'start' as const, name: 'Bron', position: { x: 60, y: 200 } }];
      }
      if (!hasEnd) {
        const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 0);
        nodes = [...nodes, { id: uid(), nodeType: 'end' as const, name: 'Sink', position: { x: maxX + 240, y: 200 } }];
      }
      return { ...state, nodes, isDirty: true };
    }

    // --- Flow edges ---
    case 'ADD_EDGE':
      return { ...state, edges: [...state.edges, action.payload], isDirty: true };

    case 'DELETE_EDGE':
      return {
        ...state,
        edges: state.edges.filter(e => e.id !== action.payload),
        isDirty: true,
      };

    // --- Run result (runtime-only, not persisted) ---
    case 'SET_RUN_RESULT':
      return { ...state, latestRunResult: action.payload };

    case 'LOAD_STATE':
      return action.payload;

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

interface AppContextType {
  state: ProjectState;
  // Materials
  addMaterial: (material: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateMaterial: (material: Material) => void;
  deleteMaterial: (id: string) => void;
  setNodeMaterialConversion: (nodeId: string, inputMaterialId: string, outputMaterialId: string, conversionRatio: number) => void;
  clearNodeMaterialConversion: (nodeId: string) => void;
  setSourceProductMix: (nodeId: string, entries: ProductMixEntry[]) => void;
  // Resources
  addResource: (resource: Omit<Resource, 'id'>) => string;
  updateResource: (resource: Resource) => void;
  deleteResource: (id: string) => void;
  // Resource library (legacy)
  markAsTemplate: (resourceId: string) => void;
  unmarkTemplate: (resourceId: string) => void;
  instantiateFromTemplate: (templateId: string, newName: string) => string;
  assignTagToResource: (resourceId: string, tag: string) => void;
  removeTagFromResource: (resourceId: string, tag: string) => void;
  // Template management (v2)
  saveAsTemplate: (template: Omit<ResourceTemplate, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTemplate: (id: string, patch: Partial<Pick<ResourceTemplate, 'name' | 'industry' | 'defaultConfig'>>) => void;
  deleteTemplate: (id: string) => void;
  // Departments
  addDepartment: (department: Omit<Department, 'id'>) => void;
  updateDepartment: (department: Department) => void;
  deleteDepartment: (id: string) => void;
  // Steps
  addStep: (name: string, resourceId: string) => void;
  updateStep: (id: string, name: string, resourceId: string) => void;
  deleteStep: (id: string) => void;
  // Scenarios
  addScenario: (name: string) => void;
  updateScenario: (id: string, patch: ScenarioPatch) => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (id: string) => void;
  setActiveScenario: (id: string) => boolean;
  // Scenario overrides
  setResourceOverride: (scenarioId: string, resourceId: string, override: Partial<Omit<Resource, 'id' | 'departmentId'>>) => void;
  clearResourceOverride: (scenarioId: string, resourceId: string) => void;
  setDepartmentScheduleOverride: (scenarioId: string, departmentId: string, override: Partial<Department['hoursByWeekday']>) => void;
  clearDepartmentScheduleOverride: (scenarioId: string, departmentId: string) => void;
  // Flow nodes
  addNode: (nodePartial: Partial<FlowNode>) => void;
  updateNode: (id: string, patch: Partial<FlowNode>) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  duplicateNode: (id: string) => void;
  setNodeResource: (nodeId: string, resourceId: string) => void;
  setNodeDuration: (nodeId: string, durationMinutesPerUnit: number) => void;
  ensureSourceAndSink: () => void;
  // Flow edges
  addEdge: (sourceId: string, targetId: string) => void;
  deleteEdge: (id: string) => void;
  // Run result
  setRunResult: (result: RunBundle | null) => void;
}

const AppStateContext = createContext<AppContextType | undefined>(undefined);

export const useAppState = (): AppContextType => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const getInitialState = (): ProjectState => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectState>;

        // --- Migration: v1 → v2 ---
        // 1. Resources without resourceClass default to 'processing'.
        // 2. Resources with isTemplate=true are moved to templates[].
        const migratedResources: Resource[] = [];
        const migratedFromIsTemplate: ResourceTemplate[] = [];

        for (const r of (parsed.resources ?? [])) {
          if (r.isTemplate) {
            // Convert legacy template resource → ResourceTemplate
            const now = Date.now();
            const tmpl: ResourceTemplate = {
              id: r.id,
              name: r.name.replace(/\s*\(Template\)\s*/i, '').trim(),
              resourceClass: r.resourceClass ?? 'processing',
              processingMode: r.processingMode ?? (r.type as ResourceTemplate['processingMode']),
              industry: null,
              isSystemTemplate: false,
              defaultConfig: {
                type: r.type,
                processingMode: r.processingMode ?? (r.type as ResourceTemplate['processingMode']),
                outputPerHour: r.outputPerHour,
                batchSize: r.batchSize,
                cycleTimeMinutes: r.cycleTimeMinutes,
                parallelUnits: r.parallelUnits,
                yieldPct: r.yieldPct,
                availability: r.availability,
                dailyStartupMinutes: r.dailyStartupMinutes,
                description: r.description,
              },
              createdAt: now,
              updatedAt: now,
            };
            migratedFromIsTemplate.push(tmpl);
            // Do NOT add to migratedResources — templates live in templates[], not resources[]
          } else {
            // Ensure resourceClass is set
            migratedResources.push({
              ...r,
              resourceClass: r.resourceClass ?? 'processing',
              processingMode: r.processingMode ?? (r.type as Resource['processingMode']),
            });
          }
        }

        // Merge templates: start with seed system templates, add persisted user templates,
        // add any migrated-from-isTemplate templates (dedup by id)
        const existingTemplateIds = new Set([
          ...DEFAULT_PROJECT_STATE.templates.map(t => t.id),
          ...(parsed.templates ?? []).map(t => t.id),
        ]);
        const dedupedMigrated = migratedFromIsTemplate.filter(t => !existingTemplateIds.has(t.id));

        const mergedTemplates: ResourceTemplate[] = [
          // System templates from seed (always present)
          ...DEFAULT_PROJECT_STATE.templates.filter(t => t.isSystemTemplate),
          // User-created templates from persisted state
          ...(parsed.templates ?? []).filter(t => !t.isSystemTemplate),
          // Newly migrated templates
          ...dedupedMigrated,
        ];

        return {
          ...DEFAULT_PROJECT_STATE,
          ...parsed,
          resources: migratedResources,
          templates: mergedTemplates,
          materials: parsed.materials ?? [],
          latestRunResult: null, // never restore from localStorage
          isDirty: false,
        };
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }
    return DEFAULT_PROJECT_STATE;
  };

  const [state, dispatch] = useReducer(appReducer, getInitialState());

  useEffect(() => {
    persistState(state);
  }, [state]);

  // --- Materials ---
  const addMaterial = (material: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>): string => {
    const id = uid();
    const now = Date.now();
    dispatch({ type: 'ADD_MATERIAL', payload: { id, ...material, createdAt: now, updatedAt: now } });
    return id;
  };
  const updateMaterial = (material: Material) => {
    dispatch({ type: 'UPDATE_MATERIAL', payload: { ...material, updatedAt: Date.now() } });
  };
  const deleteMaterial = (id: string) => {
    dispatch({ type: 'DELETE_MATERIAL', payload: id });
  };
  const setNodeMaterialConversion = (nodeId: string, inputMaterialId: string, outputMaterialId: string, conversionRatio: number) => {
    dispatch({ type: 'SET_NODE_MATERIAL_CONVERSION', payload: { nodeId, inputMaterialId, outputMaterialId, conversionRatio } });
  };
  const clearNodeMaterialConversion = (nodeId: string) => {
    dispatch({ type: 'CLEAR_NODE_MATERIAL_CONVERSION', payload: { nodeId } });
  };
  const setSourceProductMix = (nodeId: string, entries: ProductMixEntry[]) => {
    dispatch({ type: 'SET_SOURCE_PRODUCT_MIX', payload: { nodeId, entries } });
  };

  // --- Resources ---
  const addResource = (resource: Omit<Resource, 'id'>): string => {
    const id = uid();
    dispatch({ type: 'ADD_RESOURCE', payload: { id, ...resource } });
    return id;
  };
  const updateResource = (resource: Resource) => {
    dispatch({ type: 'UPDATE_RESOURCE', payload: resource });
  };
  const deleteResource = (id: string) => {
    dispatch({ type: 'DELETE_RESOURCE', payload: id });
  };

  // --- Resource library (legacy) ---
  const markAsTemplate = (resourceId: string) => {
    dispatch({ type: 'MARK_AS_TEMPLATE', payload: resourceId });
  };
  const unmarkTemplate = (resourceId: string) => {
    dispatch({ type: 'UNMARK_TEMPLATE', payload: resourceId });
  };
  const instantiateFromTemplate = (templateId: string, newName: string): string => {
    const newId = uid();
    dispatch({ type: 'INSTANTIATE_FROM_TEMPLATE', payload: { templateId, newName, newId } });
    return newId;
  };
  const assignTagToResource = (resourceId: string, tag: string) => {
    dispatch({ type: 'ASSIGN_TAG_TO_RESOURCE', payload: { resourceId, tag } });
  };
  const removeTagFromResource = (resourceId: string, tag: string) => {
    dispatch({ type: 'REMOVE_TAG_FROM_RESOURCE', payload: { resourceId, tag } });
  };

  // --- Template management (v2) ---
  const saveAsTemplate = (templateData: Omit<ResourceTemplate, 'id' | 'createdAt' | 'updatedAt'>): string => {
    const id = uid();
    const now = Date.now();
    const template: ResourceTemplate = { ...templateData, id, createdAt: now, updatedAt: now };
    dispatch({ type: 'SAVE_AS_TEMPLATE', payload: template });
    return id;
  };
  const updateTemplate = (id: string, patch: Partial<Pick<ResourceTemplate, 'name' | 'industry' | 'defaultConfig'>>) => {
    dispatch({ type: 'UPDATE_TEMPLATE', payload: { id, patch } });
  };
  const deleteTemplate = (id: string) => {
    dispatch({ type: 'DELETE_TEMPLATE', payload: id });
  };

  // --- Departments ---
  const addDepartment = (department: Omit<Department, 'id'>) => {
    // Validate at store level
    if (!department.name || !department.name.trim()) {
      console.error('Department name is required');
      return;
    }
    if (sumHoursByWeekday(department.hoursByWeekday) <= 0) {
      console.error('Department must have hours > 0');
      return;
    }

    const withComputed = {
      ...department,
      availableHoursPerWeek: sumHoursByWeekday(department.hoursByWeekday),
    };
    dispatch({ type: 'ADD_DEPARTMENT', payload: { id: uid(), ...withComputed } });
  };
  const updateDepartment = (department: Department) => {
    // Validate at store level
    if (sumHoursByWeekday(department.hoursByWeekday) <= 0) {
      console.error('Department must have hours > 0');
      return;
    }

    const withComputed = {
      ...department,
      availableHoursPerWeek: sumHoursByWeekday(department.hoursByWeekday),
    };
    dispatch({ type: 'UPDATE_DEPARTMENT', payload: withComputed });
  };
  const deleteDepartment = (id: string) => {
    dispatch({ type: 'DELETE_DEPARTMENT', payload: id });
  };

  // --- Steps ---
  const addStep = (name: string, resourceId: string) => {
    dispatch({ type: 'ADD_STEP', payload: { id: uid(), name, resourceId } });
  };
  const updateStep = (id: string, name: string, resourceId: string) => {
    dispatch({ type: 'UPDATE_STEP', payload: { id, name, resourceId } });
  };
  const deleteStep = (id: string) => {
    dispatch({ type: 'DELETE_STEP', payload: id });
  };

  // --- Scenarios ---
  const addScenario = (name: string) => {
    dispatch({ type: 'ADD_SCENARIO', payload: { name } });
  };
  const updateScenario = (id: string, patch: ScenarioPatch) => {
    dispatch({ type: 'UPDATE_SCENARIO', payload: { id, patch } });
  };
  const deleteScenario = (id: string) => {
    dispatch({ type: 'DELETE_SCENARIO', payload: id });
  };
  const duplicateScenario = (id: string) => {
    dispatch({ type: 'DUPLICATE_SCENARIO', payload: id });
  };
  const setActiveScenario = (id: string): boolean => {
    if (!state.scenarios.some(s => s.id === id)) return false;
    dispatch({ type: 'SET_ACTIVE_SCENARIO', payload: id });
    return true;
  };

  // --- Scenario overrides ---
  const setResourceOverride = (
    scenarioId: string,
    resourceId: string,
    override: Partial<Omit<Resource, 'id' | 'departmentId'>>
  ) => {
    dispatch({
      type: 'SET_RESOURCE_OVERRIDE',
      payload: { scenarioId, resourceId, override },
    });
  };
  const clearResourceOverride = (scenarioId: string, resourceId: string) => {
    dispatch({
      type: 'CLEAR_RESOURCE_OVERRIDE',
      payload: { scenarioId, resourceId },
    });
  };
  const setDepartmentScheduleOverride = (
    scenarioId: string,
    departmentId: string,
    override: Partial<Department['hoursByWeekday']>
  ) => {
    dispatch({
      type: 'SET_DEPARTMENT_SCHEDULE_OVERRIDE',
      payload: { scenarioId, departmentId, override },
    });
  };
  const clearDepartmentScheduleOverride = (scenarioId: string, departmentId: string) => {
    dispatch({
      type: 'CLEAR_DEPARTMENT_SCHEDULE_OVERRIDE',
      payload: { scenarioId, departmentId },
    });
  };

  // --- Nodes ---
  const addNode = (nodePartial: Partial<FlowNode>) => {
    const newNode: FlowNode = {
      id: uid(),
      nodeType: nodePartial.nodeType ?? 'resourceStep',
      name: nodePartial.name ?? 'New Node',
      position: nodePartial.position ?? { x: 300, y: 300 },
      resourceId: nodePartial.resourceId,
      durationMinutesPerUnit: nodePartial.durationMinutesPerUnit,
      enabled: nodePartial.enabled,
      outputMaterialId: nodePartial.outputMaterialId,
      supplyMode: nodePartial.supplyMode,
      fixedSupplyAmount: nodePartial.fixedSupplyAmount,
      fixedSupplyPeriodUnit: nodePartial.fixedSupplyPeriodUnit,
      updatedAt: Date.now(),
    };
    dispatch({ type: 'ADD_NODE', payload: newNode });
  };
  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    dispatch({ type: 'UPDATE_NODE', payload: { id, patch } });
  };
  const deleteNode = (id: string) => {
    dispatch({ type: 'DELETE_NODE', payload: id });
  };
  const deleteNodes = (ids: string[]) => {
    dispatch({ type: 'DELETE_NODES', payload: ids });
  };
  const duplicateNode = (id: string) => {
    dispatch({ type: 'DUPLICATE_NODE', payload: id });
  };
  const setNodeResource = (nodeId: string, resourceId: string) => {
    dispatch({ type: 'SET_NODE_RESOURCE', payload: { nodeId, resourceId } });
  };
  const setNodeDuration = (nodeId: string, durationMinutesPerUnit: number) => {
    if (durationMinutesPerUnit <= 0) return;
    dispatch({ type: 'SET_NODE_DURATION', payload: { nodeId, durationMinutesPerUnit } });
  };
  const ensureSourceAndSink = () => {
    dispatch({ type: 'ENSURE_SOURCE_AND_SINK' });
  };

  // --- Edges ---
  const addEdge = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    if (state.edges.some(e => e.source === sourceId && e.target === targetId)) return;
    dispatch({ type: 'ADD_EDGE', payload: { id: uid(), source: sourceId, target: targetId } });
  };
  const deleteEdge = (id: string) => {
    dispatch({ type: 'DELETE_EDGE', payload: id });
  };

  // --- Run result ---
  const setRunResult = (result: RunBundle | null) => {
    dispatch({ type: 'SET_RUN_RESULT', payload: result });
  };

  const value: AppContextType = {
    state,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    setNodeMaterialConversion,
    clearNodeMaterialConversion,
    setSourceProductMix,
    addResource,
    updateResource,
    deleteResource,
    markAsTemplate,
    unmarkTemplate,
    instantiateFromTemplate,
    assignTagToResource,
    removeTagFromResource,
    saveAsTemplate,
    updateTemplate,
    deleteTemplate,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    addStep,
    updateStep,
    deleteStep,
    addScenario,
    updateScenario,
    deleteScenario,
    duplicateScenario,
    setActiveScenario,
    setResourceOverride,
    clearResourceOverride,
    setDepartmentScheduleOverride,
    clearDepartmentScheduleOverride,
    addNode,
    updateNode,
    deleteNode,
    deleteNodes,
    duplicateNode,
    setNodeResource,
    setNodeDuration,
    ensureSourceAndSink,
    addEdge,
    deleteEdge,
    setRunResult,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};
