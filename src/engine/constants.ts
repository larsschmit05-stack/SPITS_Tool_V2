/**
 * Shared validation constants for the capacity engine.
 *
 * Single source of truth for all numeric limits.
 * Imported by:
 *   - validators.ts   (engine-layer validation rules)
 *   - preview.ts      (live preview calculations & guard clauses)
 *   - UI form components (input range constraints — import from here, not hardcoded)
 *
 * Changing a limit here automatically updates validators AND UI in one place.
 */
export const VALIDATION_CONSTANTS = {
  availability: {
    min: 0.01,   // 1 % — 0 means never available (invalid)
    max: 1.0,
    warnBelow: 0.5, // < 50 % triggers WARN_SUSPICIOUS_AVAILABILITY
  },

  yieldPct: {
    min: 0.1,    // 0.1 % — 0 means nothing passes (invalid)
    max: 100.0,
    warnBelow: 50.0, // < 50 % triggers WARN_SUSPICIOUS_YIELD
  },

  safetyMarginPct: {
    min: 0,
    max: 50,     // > 50 % means more than half the buffer is unusable — unrealistic
  },

  parallelUnits: {
    min: 1,
    max: 99,     // > 99 is almost certainly an input error
  },

  outputPerHour: {
    min: 0.001,  // Must produce at least something
  },

  batchSize: {
    min: 0.001,
  },

  cycleTimeMinutes: {
    min: 0.1,    // 6 seconds minimum cycle time
  },

  dwellTimeMinutes: {
    min: 1,          // At least 1 minute in buffer
    max: 10_080,     // 7 days (7 × 24 × 60) — maximum meaningful hold time
  },

  tripDurationMinutes: {
    min: 1,      // At least 1 minute round-trip
    max: 480,    // 8 hours — a full shift; longer trips are a planning problem
  },

  dailyStartupMinutes: {
    min: 0,
    max: 240,    // 4 hours of startup per day is already extreme
  },

  unitsPerTrip: {
    min: 0.001,
  },
} as const;
