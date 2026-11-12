# Visual Reference and UI State: C2 Closure Modifications

## 1. Overview and Scope of UI Edits
In accordance with Work Item A (Elimination of Fixed-Area Assumptions) and Work Item F (Preserve Truthful Provenance of Modeled Heat), the following two frontend components are being modified:
1. `frontend/src/app/page.tsx` (Landing Page):
   - Replace the ungrounded constant `250000` in `liveCapEx` and `liveWaterM3` formulas.
   - Bind calculations to the actively selected archetype extent (`ARCHETYPE_AREAS_M2` derived from bounding boxes: Delhi ~211 ha, Mumbai ~279 ha, Singapore ~277 ha, Phoenix ~231 ha, Tokyo ~225 ha).
   - Display dynamic area annotation in the illustrative preview ribbon and card description.
2. `frontend/src/app/intervention-studio/page.tsx` (Intervention Studio):
   - Replace `const studyAreaM2 = 250000;` with dynamic area calculation based on `grid.metadata` (total cells × effective resolution X × effective resolution Y) or configured bounding box coordinates (`fallbackAreaM2`).
   - Derive building fraction dynamically from `grid.layers.building_density` when available, or explicitly label the 45% assumption in the UI.
   - Update CapEx ledger headings and footnotes to display grounded area in hectares and square meters instead of "fixed 25 ha".

## 2. Intended Visual State

### Landing Page (`/`)
- **Interactive Simulator Card Header**:
  - Badge: "Illustrative Interactive Preview"
  - Title: "Explore district-cooling assumptions"
  - Subtitle: "Adjust intervention assumptions to explore planning estimates scaled to the active archetype ({currentArchetype.name}, ~{Math.round(activeDistrictM2 / 10000)} ha). These browser-side formulas are illustrative planning models, not a live physics-solver result."
- **Metrics Ribbon**:
  - Displays dynamic illustrative CapEx and utility savings reflecting the selected archetype's geographic scale.

### Intervention Studio (`/intervention-studio`)
- **Header & Ticker**:
  - Ticker metrics (Estimated CapEx, Water) dynamically scale with the actual study area dimensions.
- **CapEx Ledger**:
  - Header displays grounded district area: `Illustrative CapEx & Resource Estimate ({area_ha} ha / {studyAreaM2} m²)`.
  - Line items clearly display actual computed square meters for each intervention type based on real or clearly labeled building density.
  - Footnote clearly states: `Calculated from active digital twin grid footprint ({total_cells} cells at {res_x}m × {res_y}m) and local unit rates.`

## 3. Visual Regression Guardrails
- No alterations to layout structure, colour palette, typography, or component hierarchy.
- Typography retains standard design tokens (`editorial-headline`, `text-label`, `tabular-nums`, `graphite-card`).
- Contrast ratios and responsive layout breakpoints remain strictly intact.
