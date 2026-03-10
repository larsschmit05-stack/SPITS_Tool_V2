import type { ProjectState, ResourceTemplate } from './types';

const SEED_TIMESTAMP = 1740000000000; // Fixed timestamp for reproducible seed data

/**
 * Seed system templates — provided by the platform as starting points.
 * These live in templates[], NOT in resources[].
 */
const SEED_TEMPLATES: ResourceTemplate[] = [
  {
    id: 'tpl-cnc-standard',
    name: 'Standaard CNC',
    resourceClass: 'processing',
    processingMode: 'continuous',
    industry: 'discrete',
    isSystemTemplate: true,
    defaultConfig: {
      type: 'continuous',
      processingMode: 'continuous',
      outputPerHour: 50,
      parallelUnits: 1,
      yieldPct: 95,
      availability: 0.9,
      dailyStartupMinutes: 15,
      description: 'Standaard CNC-bewerkingscentrum. Gebruik als basis voor freesmachines en draaibanken.',
    },
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'tpl-batch-oven',
    name: 'Batch Oven',
    resourceClass: 'processing',
    processingMode: 'batch',
    industry: 'process',
    isSystemTemplate: true,
    defaultConfig: {
      type: 'batch',
      processingMode: 'batch',
      batchSize: 100,
      cycleTimeMinutes: 30,
      parallelUnits: 1,
      yieldPct: 98,
      availability: 0.92,
      dailyStartupMinutes: 20,
      description: 'Standaard batch-oven voor warmtebehandeling.',
    },
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'tpl-quality-check',
    name: 'Kwaliteitscontrole',
    resourceClass: 'processing',
    processingMode: 'manual',
    industry: null,
    isSystemTemplate: true,
    defaultConfig: {
      type: 'manual',
      processingMode: 'manual',
      outputPerHour: 10,
      parallelUnits: 1,
      yieldPct: 100,
      availability: 0.95,
      dailyStartupMinutes: 5,
      description: 'Handmatige kwaliteitscontrole. Gebruik als startpunt voor inspectie- en meetstations.',
    },
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'tpl-koelcel-standaard',
    name: 'Koelcel Standaard',
    resourceClass: 'buffer',
    industry: 'food',
    isSystemTemplate: true,
    defaultConfig: {
      type: 'continuous',
      slotCapacity: 500,
      slotUnit: 'kg',
      safetyMarginPct: 10,
      dwellTimeMinutes: 120,
      availability: 1.0,
      dailyStartupMinutes: 0,
      parallelUnits: 1,
      yieldPct: 100,
      description: 'Standaard koelcel. Pas slotcapaciteit en verblijftijd aan op uw situatie.',
    },
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'tpl-heftruck',
    name: 'Heftruck (intern)',
    resourceClass: 'transport',
    transportMode: 'discrete',
    industry: null,
    isSystemTemplate: true,
    defaultConfig: {
      type: 'continuous',
      transportMode: 'discrete',
      unitsPerTrip: 200,
      tripDurationMinutes: 8,
      parallelUnits: 1,
      availability: 0.9,
      dailyStartupMinutes: 0,
      yieldPct: 100,
      description: 'Intern transport per heftruck. Pas ritduur en laadvermogen aan.',
    },
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'tpl-cooling-delay',
    name: 'Koelpauze',
    resourceClass: 'delay',
    industry: 'food',
    isSystemTemplate: true,
    defaultConfig: {
      type: 'continuous',
      delayTimeMinutes: 120,
      delayMode: 'per_unit',
      parallelUnits: 1,
      yieldPct: 100,
      availability: 1,
      dailyStartupMinutes: 0,
      description: 'Standaard koelpauze (bijv. na pasteurisatie). Pas wachttijd aan op uw proces.',
    },
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

/**
 * Default project state with realistic capacity data for development/demo.
 *
 * Verification values (corrected — availability applied once, to hours):
 *   Dept "Productie": Mon–Fri 8h → 10 working days in a 2-week horizon = 80h/dept
 *   CNC:      startup 15min×10d = 2.5h → net 77.5h → effective 69.75h (×0.90)
 *             rate 50 u/hr × 1 unit = 50 u/hr, cumYield 0.95×0.98=0.931
 *             → maxGood/hr 46.55 → maxGood 3247 units
 *   Assembly: startup 10min×10d = 1.67h → net 78.33h → effective 74.42h (×0.95)
 *             rate 25 u/hr × 1 unit = 25 u/hr, cumYield 0.98
 *             → maxGood/hr 24.5 → maxGood 1823 units
 *   Bottleneck: Assembly (lowest horizon throughput)
 *   Target 500 → feasible = true
 */
export const DEFAULT_PROJECT_STATE: ProjectState = {
  resources: [
    {
      id: 'res-cnc-01',
      name: 'CNC Machine 01',
      type: 'continuous',
      resourceClass: 'processing',
      processingMode: 'continuous',
      departmentId: 'dept-productie',
      outputPerHour: 50,
      parallelUnits: 1,
      yieldPct: 95,
      availability: 0.9,
      dailyStartupMinutes: 15,
    },
    {
      id: 'res-assembly-01',
      name: 'Assembly Station',
      type: 'manual',
      resourceClass: 'processing',
      processingMode: 'manual',
      departmentId: 'dept-productie',
      outputPerHour: 25,
      parallelUnits: 1,
      yieldPct: 98,
      availability: 0.95,
      dailyStartupMinutes: 10,
    },
  ],

  templates: SEED_TEMPLATES,

  departments: [
    {
      id: 'dept-productie',
      name: 'Productie',
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
    },
    {
      id: 'dept-montage',
      name: 'Montage',
      color: '#10B981',
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
    },
    {
      id: 'dept-logistiek',
      name: 'Logistiek',
      color: '#F59E0B',
      hoursByWeekday: {
        mon: 7,
        tue: 7,
        wed: 7,
        thu: 7,
        fri: 7,
        sat: 0,
        sun: 0,
      },
      availableHoursPerWeek: 35,
    },
  ],

  steps: [
    {
      id: 'step-cnc-01',
      name: 'CNC Bewerking',
      resourceId: 'res-cnc-01',
    },
    {
      id: 'step-assembly-01',
      name: 'Assemblage',
      resourceId: 'res-assembly-01',
    },
  ],

  scenarios: [
    {
      id: 'scenario-baseline',
      name: 'Baseline',
      createdAt: Date.now(),
      demand: {
        targetGoodUnits: 500,
        horizonCalendarDays: 14,
        startDateISO: '2026-03-02', // Monday
        timezone: 'Europe/Amsterdam',
      },
    },
  ],

  activeScenarioId: 'scenario-baseline',

  nodes: [
    {
      id: 'node-start',
      nodeType: 'start',
      name: 'Bron',
      position: { x: 60, y: 200 },
    },
    {
      id: 'node-cnc',
      nodeType: 'resourceStep',
      name: 'CNC Bewerking',
      position: { x: 280, y: 200 },
      resourceId: 'res-cnc-01',
      enabled: true,
    },
    {
      id: 'node-transport',
      nodeType: 'timeStep',
      name: 'Transport naar Montage',
      position: { x: 500, y: 200 },
      durationMinutesPerUnit: 15,
      enabled: true,
    },
    {
      id: 'node-assembly',
      nodeType: 'resourceStep',
      name: 'Assemblage',
      position: { x: 720, y: 200 },
      resourceId: 'res-assembly-01',
      enabled: true,
    },
    {
      id: 'node-qc-wait',
      nodeType: 'timeStep',
      name: 'Wachttijd Kwaliteitscontrole',
      position: { x: 940, y: 200 },
      durationMinutesPerUnit: 8,
      enabled: true,
    },
    {
      id: 'node-end',
      nodeType: 'end',
      name: 'Sink',
      position: { x: 1160, y: 200 },
    },
  ],

  lastUsedDepartmentId: 'dept-productie',

  edges: [
    { id: 'edge-start-cnc', source: 'node-start', target: 'node-cnc' },
    { id: 'edge-cnc-transport', source: 'node-cnc', target: 'node-transport' },
    { id: 'edge-transport-assembly', source: 'node-transport', target: 'node-assembly' },
    { id: 'edge-assembly-qc', source: 'node-assembly', target: 'node-qc-wait' },
    { id: 'edge-qc-end', source: 'node-qc-wait', target: 'node-end' },
  ],

  isDirty: false,
  latestRunResult: null,
};
