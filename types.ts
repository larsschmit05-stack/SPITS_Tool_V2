
export enum NodeType {
  PROCESS = 'PROCESS',
  MACHINE = 'MACHINE',
  MIX = 'MIX',
  SOURCE = 'SOURCE',
  END = 'END'
}

export enum ScenarioStatus {
  SAVED = 'SAVED',
  UNSAVED = 'UNSAVED'
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  perUnit: number; // Consumption per finished unit
  initialInventory: number;
  replenishmentPerWeek: number;
  updatedAt: number;
}

export interface Department {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: number;
}

export type ProcessMode = 'continuous' | 'batch';

export interface ProcessNode {
  id: string;
  type: NodeType;
  name: string;
  position: NodePosition;
  
  // New linking fields
  nodeType?: 'start' | 'step' | 'end';
  resourceId?: string;

  // Machine Params (Fallback/Embedded)
  cycleTimeSec?: number;
  numMachines?: number;
  processMode?: ProcessMode;
  unitsPerCycle?: number;
  
  // Process/Labor Params (Fallback/Embedded)
  processingTimePerUnitSec?: number;
  operatorsRequired?: number;
  
  // Shared reliability params (Fallback/Embedded)
  availabilityPct?: number;
  yieldPct?: number;

  // Downtime & Setup
  plannedDowntimeMin?: number;
  unplannedDowntimeMin?: number;
  setupTimeMin?: number;
  setupTimePerBatchMin?: number;
  changeoversPerShift?: number;
  
  // Material links (primarily for SOURCE node)
  linkedMaterialIds?: string[];

  updatedAt?: number;
}

export interface ResourceData {
  id: string;
  name: string;
  type: NodeType;
  departmentId?: string; 
  processMode: ProcessMode;
  cycleTimeSec: number;
  unitsPerCycle: number;
  numMachines: number; // Also used as "Parallel stations"
  operatorsRequired: number;
  
  // Availability & Downtime
  availabilityPct: number;
  plannedDowntimeMin: number;
  unplannedDowntimeMin: number;
  
  // Setup & Changeover
  setupTimeMin: number;
  setupTimePerBatchMin: number;
  changeoversPerShift: number;
  
  // Quality
  yieldPct: number;

}

export interface Edge {
  id: string;
  source: string;
  target: string;
}

export interface ScenarioBatchInflow {
  id: string;
  day: number; // 0=Mon, 6=Sun
  time: string; // "HH:MM"
  quantity: number;
}

export interface ScenarioCalendarDay {
  day: number;
  enabled: boolean;
  shiftStart: string;
  shiftEnd: string;
}

export interface ScenarioStepConfig {
  capacityFactor: number; // Multiplier (0.1 - 2.0)
  operatingHoursPct: number; // % of scenario calendar hours (0 - 100)
}

export interface ScenarioDepartmentConfig {
  capacityFactor: number;      // "Efficiency %"
  operatingHoursPct: number;   // Global scale
  availabilityPct?: number;    // Dept availability override
  yieldPct?: number;           // Dept yield override
  operatorsAvailable?: number; // "Operators beschikbaar" - fixed FTE limit
  shiftStartOverride?: string; // Specific "Department schedules" override
  shiftEndOverride?: string;   // Specific "Department schedules" override
}

export interface Scenario {
  id: string;
  name: string;
  demandMode: "meet_demand" | "max_output";
  demandTarget: {
    unitsPerDay?: number;
    unitsPerWeek?: number;
  };
  inflowMode: "constant" | "batches";
  inflow: {
    constantRatePerHour?: number;
    batches?: ScenarioBatchInflow[];
  };
  calendar: {
    days: ScenarioCalendarDay[];
  };
  annualHolidays?: string[]; // Array of ISO strings (YYYY-MM-DD)
  weeksPerYear?: number;      // e.g. 52, 48 (adjusted for holidays)
  stepConfigs: Record<string, ScenarioStepConfig>;
  departmentConfigs: Record<string, ScenarioDepartmentConfig>; // Key is departmentId
  createdAt: number;
}

export interface ScenarioConfig {
  demandPerWeek: number;
  workingHoursPerDay: number;
  daysPerWeek: number;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  target?: number;
  secondary?: number;
}
