# New Process Element Creation Flow (V2)

## Purpose and Scope
This document defines the UI/UX design specification for the **New Process Element Creation Flow (V2)**.

The flow is designed to transition element creation from open-form editing to a guided, step-based modeling experience.

### Scope Boundaries
This specification covers:
- Interaction flow and modal structure
- Visual hierarchy and component behavior
- User-facing terminology and micro-interactions
- UX rollout phases

This specification does **not** define:
- Domain contracts
- Engine logic
- Validation guarantees
- Backend behavior

---

## Design Objective
The flow should:
- Reduce friction during element creation
- Guide correct modeling decisions early
- Prevent avoidable early-stage mistakes through structured sequencing
- Feel professional, focused, and operationally oriented
- Serve operational users rather than developer workflows

---

## 1. Step-Based Modal Structure

### 1.1 Entry Trigger (Step 0)
- User action: `+ New Process Element`
- Result: Open a centered modal overlay
- Layout intent: focused, single-task creation context
- Side-panel editing is not shown at entry

### 1.2 Modal Behavior
- The modal follows a guided, linear step sequence
- A top progress indicator displays current position (example: `Step 1 of 4`)
- `Back` action is always available after the first step
- Step transitions use subtle fade animation

### 1.3 Step Sequence

#### Step 1 — Select Type
- Title: `Select Process Type`
- Subtitle: `What kind of operational step is this?`
- Main content: card grid selection (single choice)
- Rule: one click selects exactly one type
- Rule: `Next` remains disabled until a type is selected
- Special UX label: Delay option is visibly marked `No department required`

#### Step 2 — Basic Setup
- Title: `Define Basic Information`
- Fields:
  - `Name` (required in UI)
  - `Department` (required in UI, except Delay)
  - `Description` (optional)

Behavior by selected type:
- If type is **Technical Delay**:
  - Hide `Department`
  - Show helper note: `This element does not consume department time.`
- If type is **not** Technical Delay:
  - Show `Department` as required
  - Prefill with smart default using the last used department

#### Step 3 — Capacity Core Inputs
- Title: `Define Capacity Logic`
- Display only type-relevant input groups

Type-specific input sets:
- **Continuous / Machine**
  - `Output Rate (units/hour)`
  - `Parallel Units`
- **Manual / Labor**
  - `Cycle Time (minutes/unit)`
  - `Parallel Operators`
- **Batch**
  - `Batch Size`
  - `Batch Cycle Time`
  - `Parallel Units`
- **Transport**
  - `Capacity per Trip`
  - `Round Trip Time`
  - `Parallel Vehicles`
- **Technical Delay**
  - `Mode (per unit / per batch)`
  - `Delay Time`

#### Step 4 — Performance Factors (Advanced)
- Section style: collapsible block
- Label: `Performance Factors (Recommended)`
- Default state: visible but low-emphasis, non-intrusive presentation
- Fields and defaults:
  - `Availability` = `1.00`
  - `Yield` = `100%`
  - `Startup Loss` = `0`
- Include tooltip icons for factor definitions

#### Step 5 — Live Capacity Preview
- Placement: fixed lower section of the modal content area
- Label: `Capacity Preview`
- Display values:
  - `Theoretical Throughput`
  - `Effective Throughput`
  - `Weekly Capacity` (based on department hours)
- UX intent: immediate feedback to increase confidence before completion

#### Step 6 — Completion Options
Primary actions:
- `Create Element`
- `Create & Add to Flow`

Secondary action:
- `Cancel`

Post-create navigation:
- Redirect to library view when created normally
- Redirect to process builder when `Create & Add to Flow` is used

---

## 2. Type Selection Cards

### 2.1 Card Structure
Each card uses a consistent format:
1. Icon
2. Type name
3. One-line description

### 2.2 Type Definitions (UI Copy)

1. **Continuous / Machine**
   - Description: `Machine or station producing continuously`
   - Example text: `Roaster, Filling Line`

2. **Manual / Labor**
   - Description: `Manual work per unit`
   - Example text: `Assembly, Inspection`

3. **Batch**
   - Description: `Processes units in batches`
   - Example text: `Oven, Mixer`

4. **Transport**
   - Description: `Movement with capacity constraint`
   - Example text: `Forklift transport`

5. **Technical Delay**
   - Description: `Fixed technical time`
   - Example text: `Cooling, Drying`

### 2.3 Selection Behavior
- Single-select interaction only
- Selected card receives clear active state styling
- Keyboard focus and hover states follow the same visual language as click selection

---

## 3. Icon System Guidelines

### 3.1 Visual Style
- Use outline icons only (no filled style)
- Slightly rounded geometry
- Stroke width between `1.5px` and `2px`
- Stroke weight must be consistent across all type icons
- Color: neutral blue-gray palette
- Emoji are not used in production UI

### 3.2 Type-to-Icon Mapping
- **Continuous / Machine** → Gear concept
- **Manual / Labor** → User silhouette
- **Batch** → Stacked boxes/containers
- **Transport** → Horizontal arrows
- **Technical Delay** → Clock or hourglass

### 3.3 Recommended Libraries
- Lucide
- Heroicons
- Phosphor (light style)

---

## 4. Micro-Interactions
- Subtle fade animation between modal steps
- Persistent progress indicator with current step context
- `Back` action available on non-initial steps
- Real-time input feedback at field level
- Tooltip affordances beside `Performance Factors` labels

Interaction principles:
- Motion must support orientation, not decoration
- Feedback should be immediate and lightweight
- State changes should be clear without visual noise

---

## 5. Tone and Terminology Standards

### 5.1 Required Terminology
Use these terms consistently in labels, helper text, and previews:
- Process Element
- Parallel Units
- Availability
- Yield
- Startup Loss
- Round Trip Time
- Capacity Preview
- Effective Throughput

### 5.2 Terms to Avoid
Do not use the following as primary UI terminology:
- `Machine type`
- `Speed`
- `Efficiency`

### 5.3 Writing Style
- Use concise operational language
- Keep labels concrete and measurable
- Prefer neutral instructional phrasing over promotional tone

---

## 6. Implementation Phases (UX Rollout Plan)

### Phase 1
- Type selection modal step
- Basic setup step
- Capacity core inputs step
- Creation actions

### Phase 2
- Performance factors block
- Live capacity preview section

### Phase 3
- Templates
- Smart defaults expansion
- Advanced transport option enhancements

Rollout principle:
- Prioritize foundational guided flow first
- Add advanced assistive UX progressively without increasing early-step complexity

---

## 7. Expected UX Outcome
A structured modal flow should:
- Reduce creation errors caused by unstructured input order
- Reinforce correct operational modeling sequence
- Improve confidence through explicit steps and preview feedback
- Maintain a professional, consistent enterprise-oriented interaction standard
