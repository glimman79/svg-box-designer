# SVG Box Designer roadmap

This document is the forward-looking product plan. It records intended extensions and
open design work; it is not an inventory of current behavior or a history of completed
work. See [PROJECT_MASTER.md](PROJECT_MASTER.md) for the current product and architecture,
[PROJECT_HISTORY.md](PROJECT_HISTORY.md) for its evolution, and
[CHANGELOG.md](CHANGELOG.md) for completed changes.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **IMPLEMENTED** | Verified foundation available on the current main branch. |
| **PARTIALLY IMPLEMENTED** | A useful verified foundation exists, with further product capability still planned. |
| **PLANNED** | Intended product work whose scope is sufficiently clear to record. |
| **LATER** | Intentionally deferred to a later roadmap pass. |
| **DESIGN REQUIRED** | Goal is known, but important interaction, data, geometry, or solver decisions remain open. |

For Arc work, the more precise labels **LOCKED PRODUCT REQUIREMENT**, **IMPLEMENTED
AND VERIFIED**, **IMPLEMENTED BUT NOT YET VERIFIED**, **KNOWN GAP**, **LOCKED ARCHITECTURE DECISION**, **IMPLEMENTATION PENDING**,
and **PLANNED FUTURE FEATURE** are used below. A locked
requirement states required behavior, not implementation or acceptance status.

# 1. 2D Drawing

## A. Existing foundation

The roadmap builds on these verified capabilities without treating completed work as a
future task:

| Foundation | Status | Current baseline |
| --- | --- | --- |
| Chained straight-segment authoring | **IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED** | The `Profile` tool creates connected straight Line segments, continues from each committed endpoint, and shares that endpoint `SketchPoint` with the next segment. Profile is an authoring workflow, not a separate persistent entity. |
| Standalone straight-segment authoring | **IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED** | The `Line` tool creates exactly one straight Line from P1 to P2 and then completes. Normal activation returns to Select; persistent activation remains in Line but resets fully so the next click starts a fresh independent P1. |
| Topology | **IMPLEMENTED** | Stable `SketchPoint` records own point identity and coordinates; connected Lines share point identity. |
| Inference and snapping | **IMPLEMENTED** | Endpoint, Midpoint, finite-Line, alignment, angular, Parallel, Perpendicular, and Point Reference candidates feed the shared Profile and Line straight-segment foundation. |
| Geometric constraints and solver | **IMPLEMENTED** | Midpoint, Coincidence, Parallelism, Perpendicular, Horizontal, Vertical, and Radius / Diameter are implemented operations. Radius / Diameter creates the existing circular-size Dimension model; Concentricity and Tangency remain inactive placeholders and are not implemented. |
| Dimensions | **IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED** | Driving and reference distance, length, and Line-to-Line angle forms, ordinary dimensions to supported Circle/Arc semantic points, and geometry-selected circular size dimensions (Circle diameter Ø; Arc radius R) have shared solver and annotation paths. |
| Authority model | **IMPLEMENTED** | Position, direction, and topology authority are distinct; compatible directional and positional truths can coexist. |
| Presentation | **IMPLEMENTED** | Transient inference and persistent constraint layers exist. Midpoint and Parallel share Line-marker layout between live and persistent presentation; Perpendicular shares presentation geometry derivation. Other relations still need convergence. |

Midpoint is the reference implementation for the intended presentation direction. Its
browser-verified flow is:

```text
accepted inference
  -> shared presentation derivation
  -> transient inference overlay

persistent semantic constraint
  -> shared presentation derivation/layout
  -> persistent constraint overlay
```

Where the same geometric relation is shown transiently and persistently, both states
should reuse the same fundamental marker layout when appropriate. This roadmap does not
redesign the current Midpoint behavior.

## B. Dimensions

Dimensions and Constraints are separate Drawing tools and systems. A Dimension measures,
displays, and, when driving, controls a value through the dimension solver path. It is
not the same user-facing operation as a Constraint merely because the Constraints panel
contains a choice with the same label. The current primary Dimensions authoring flow is
tool-first:

```text
activate Dimensions
  -> select the required geometry on the canvas
  -> choose / apply the relevant dimensional operation
```

| Dimension | Status | Presentation |
| --- | --- | --- |
| Distance | **IMPLEMENTED** | Point-to-point, point-to-Line, and Line-to-Line distance forms use live placement preview, dimension lines and arrows, applicable extension/witness geometry, and displayed measured values. |
| Length | **IMPLEMENTED** | Selecting a Line supports an aligned Line-length dimension with live placement preview, dimension graphics, and a displayed measured value. |
| Angle | **IMPLEMENTED** | Line-to-Line angle uses live placement preview, an angle arc with arrows, applicable support extensions, and a displayed measured value. |
| Circular size | **IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED** | Selecting a full Circle creates a diameter (Ø) Dimension; selecting an Arc creates a radius (R) Dimension. Geometry type decides the form in Stage 1, with no R/Ø chooser. These are persistent Dimensions with shared solving, value editing, and placement interaction—not Radius/Diameter Constraints. |
| Curve semantic points | **IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED** | Ordinary Dimensions can use a Circle’s persistent center, an Arc’s persistent P1/P2 endpoints, and an Arc’s persistent semantic center; origin remains the fixed datum where supported. |

Distance, Length, and Angle in this table describe currently implemented **Dimension**
functionality. Their integration into the Constraints selection, applicability, and
authoring workflow is not yet developed. That future integration must reuse their common
geometric and semantic basis rather than recreate three independent Constraint-only
implementations.

### Shared dimensional capability across the two tools

Distance, Length, and Angle are one set of reusable geometric/semantic capabilities
consumed from two distinct tool contexts. They must **not** be independently implemented
once for Dimensions and again for Constraints. Their common representation and
evaluation functionality should be reusable by both tools where appropriate, while each
tool retains its own authoring workflow and presentation requirements.

This sharing does not merge the tools or their presentation systems. Dimensions may
continue to present these relationships primarily as dimensional annotations through
the Dimension presentation system. Constraints may expose the same underlying
relationships among the applicable choices for selected geometry and use the Constraint
presentation architecture. Shared geometric/semantic capability does not require
identical UI or presentation. Concrete types, APIs, solver equations, and ownership
boundaries remain later architecture and implementation decisions.

Where appropriate, future work should also reuse geometry-selection and applicability
infrastructure between Dimensions and Constraints instead of building unrelated ways to
understand the same selected Drawing geometry. Constraints still has the broader
applicability problem because one selection can support many different relationships.

### Planned preselection workflow

Canvas preselection before opening Dimensions is **PLANNED / NOT YET IMPLEMENTED** as a
supported authoring workflow:

```text
select geometry directly on the canvas
  -> activate / open Dimensions
  -> Dimensions evaluates the existing selection
  -> use an applicable dimensional operation
```

The current primary workflow remains tool-first; this planned path is an additional
authoring convenience, not a replacement for the separate Dimensions tool.

## C. Constraints

Constraints is a separate, selection-driven Drawing tool with a broader catalog of
relationships than Dimensions. Both supported selection orders are browser-verified for
points and Lines. Geometry may be selected before the panel opens:

```text
select geometry on the canvas
  -> activate / open Constraints
  -> Constraints immediately evaluates the existing selection
  -> expose all valid choices and keep non-applicable choices disabled
```

Geometry may also be selected or changed while the panel remains active:

```text
activate / open Constraints
  -> select the required geometry on the canvas
  -> determine applicable constraints
  -> expose all valid choices and keep non-applicable choices disabled
  -> user chooses the desired Constraint or Constraints
  -> apply the chosen relationships to the selected geometry
```

Depending on the Constraint, selection can involve a Line, two Lines, a point, two
points, or a point and a Line. The production applicability policy remains the authority
for exact selection contracts; this roadmap does not define an applicability matrix.
One selection can make multiple choices valid, and the panel must not assume that there
is only one correct operation. For example, two Lines may, depending on their geometry
and the operation's semantics, offer choices such as Length, Angle, Parallelism, and
Perpendicular. The same multiple-possibility principle applies to other supported
selection combinations:

```text
selected geometry
  -> evaluate applicability
  -> expose all valid choices
  -> user chooses the desired relationship or relationships
```

A disabled panel choice does **not** by itself mean that the Constraint is
unimplemented: an implemented choice is also disabled when it is not applicable to the
current selection, is already present, or conflicts with an existing
Horizontal/Vertical choice. Separately, the panel deliberately shows choices whose
Constraint behavior has not yet been developed.

These workflows describe the browser-verified selection behavior for points and Lines;
they do not establish additional selection combinations beyond current applicability.

### Constraint semantics and presentation status

Constraint semantic implementation and presentation-architecture completion are
independent statuses. An implemented Constraint can have geometric semantics, solver
behavior, and a persistent representation while its transient inference, persistent
glyph, relation/support visualization, or migration to shared presentation derivation
still has work remaining.

| Constraint | Constraint status | Presentation / roadmap status |
| --- | --- | --- |
| Horizontal | **IMPLEMENTED** (`HORIZONTAL`) | Persistent H glyph exists; transient presentation still needs to converge on the shared inference model. |
| Vertical | **IMPLEMENTED** (`VERTICAL`) | Persistent V glyph exists; transient presentation still needs to converge on the shared inference model. |
| Parallelism | **IMPLEMENTED** (`PARALLEL`) | Transient and persistent markers derive through shared Line-marker layout; relation/support presentation can be extended where useful. |
| Perpendicular | **IMPLEMENTED** (`PERPENDICULAR`) | Transient and persistent right-angle presentation share geometry derivation, including support extensions when needed. |
| Coincidence | **IMPLEMENTED** (`COINCIDENT`) | Persistent square marker and selected-relation reference presentation exist; transient presentation still needs to converge on the shared model. |
| Midpoint | **IMPLEMENTED** (`MIDPOINT`) | Browser-verified reference path: transient and persistent `—□—` presentation uses the shared Line-marker layout. |
| Concentricity | **PLANNED / NOT IMPLEMENTED** | Inactive panel placeholder only. Implement later as a global Constraint using semantic geometry centers; it is not solver-supported or currently usable. |
| Tangency | **PLANNED / NOT IMPLEMENTED** | Inactive panel placeholder only. Implement later through the global Constraints architecture over true semantic geometry; it is not solver-supported or currently usable. |
| Distance | **DESIGN REQUIRED** | Present in the panel, but Constraints integration, applicability, authoring, and presentation are not yet developed. Reuse the implemented Dimension capability's common geometric/semantic basis rather than creating an independent Distance implementation. |
| Length | **DESIGN REQUIRED** | Present in the panel, but Constraints integration, applicability, authoring, and presentation are not yet developed. Reuse the implemented Dimension capability's common geometric/semantic basis rather than creating an independent Length implementation. |
| Angle | **DESIGN REQUIRED** | Present in the panel, but Constraints integration, applicability, authoring, and presentation are not yet developed. Reuse the implemented Dimension capability's common geometric/semantic basis rather than creating an independent Angle implementation. |
| Radius / Diameter | **IMPLEMENTED** | One unary operation creates Circle diameter Ø and Arc radius R `CIRCULAR_SIZE` Dimensions. It accepts compatible preselection or live selection, batches uncovered curves, ignores unrelated geometry, and disables/no-ops when every compatible curve is already covered; it creates no separate geometric-constraint entity. |
| Symmetry | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Fix | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |

Coincidence is one Constraint choice/family in the UI. Selection determines whether its
applicable relationship is point-to-point or point-to-Line; those relationships are not
separate top-level tools.

The long-term direction is one shared presentation architecture rather than unrelated
JSX/SVG implementations for every Constraint or relation:

```text
accepted inference
  -> shared presentation derivation
  -> transient inference overlay

persistent semantic constraint
  -> shared presentation derivation / layout
  -> persistent constraint overlay
```

`DrawingInferencePresentation` is an existing, partial shared transient-presentation
model. Names such as `DrawingConstraintPresentation`, `DrawingConstraintGlyph`, and
presentation-only `supportGeometry` describe possible future concepts, not current
production types or locked API names. Midpoint remains the browser-verified reference
implementation for this direction; this roadmap does not redesign its behavior.

Any support geometry introduced solely to explain a relation must remain presentation
only. It must not become a Drawing entity, solver authority, exported geometry, or
History state.

The not-yet-developed Constraints should eventually follow the common sequence:

```text
geometric semantics
  -> solver / topology where applicable
  -> presentation derivation
  -> transient and persistent presentation
```

Their equations, degrees of freedom, failure behavior, exact selection contracts,
semantic identifiers, and glyph details remain **DESIGN REQUIRED**.

## D. Common authoring controls and selection

### Snap / Constraint / Inference filter

**Status: PLANNED / NOT YET IMPLEMENTED.** Add a configurable Drawing-level
filter/settings panel that can be opened while authoring in 2D Drawing. It will let the
user enable or disable individual relevant types of snapping, automatic inference, and
automatic constraint/inference behavior. The final panel structure and complete set of
switches remain later interaction-design decisions; this roadmap does not prescribe a
checkbox catalog.

The current implementation has shared snap/inference candidate and arbitration
infrastructure, but no user-configurable filter for enabling or disabling relation
types. That infrastructure is a foundation for this plan, not completion of it.

This is one common Drawing capability, not a separate filter implemented inside
Profile, Line, Circle, Rectangle, or any other tool. Its intended authoring flow is:

```text
available Drawing geometry
  -> candidate snap / inference relations
  -> filter to types enabled in Drawing settings
  -> compatibility / authority evaluation
  -> accepted authoring result
  -> presentation
```

The filter must control whether a relation type participates before an accepted
authoring result is produced. It must not merely hide a marker after that relation has
already influenced geometry. Exact pipeline placement and APIs remain implementation
design work.

Filtering does not redefine inference semantics. Compatibility remains more important
than priority: multiple geometrically compatible relations may coexist, and priority
resolves only genuinely incompatible alternatives. Position authority remains separate
from semantic relations. Ctrl also remains the existing temporary bypass for automatic
snap/inference behavior, while the planned filter represents persistent user-configured
Drawing behavior. An accepted placement must not be reinterpreted during commit, and
transient inference presentation remains separate from persistent Constraint
presentation, with Midpoint as the browser-verified presentation reference case.

#### Snap to Grid

**Status: PLANNED / NOT YET IMPLEMENTED.** Snap to Grid will be one configurable snap
capability in the Drawing filter/settings system. When enabled, grid positions may be
offered as candidates while authoring Drawing geometry; when disabled, grid positions
must not participate as Snap to Grid candidates merely because the grid is visible.
Grid visibility and Snap to Grid activation are separate concepts.

The current grid is presentation and viewport infrastructure; it does not establish
Snap to Grid behavior. Grid spacing, adaptive behavior, origin, zoom behavior,
rendering, tolerance, priority relative to other snaps, and implementation APIs remain
for later design.

### Directional drag-box selection

**Status: IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED FOR LINES, CIRCLES, AND ARCS.** Directional drag-box
multi-selection supplements direct click selection in the common 2D Drawing selection
system. In Select, a primary-button drag from empty canvas becomes a box after the
existing 4 CSS-pixel client-space drag threshold. Geometry hits remain authoritative
for ordinary selection and Direct Manipulation. Horizontal direction continuously
determines the mode, including immediate Window/Crossing switching if the pointer moves
back across the origin; the visually distinct transient rectangle follows the raw
pointer in Drawing model coordinates and commits selection only on release.

| Mode | Status | Direction and qualification |
| --- | --- | --- |
| Window / containment selection | **IMPLEMENTED FOR LINES** | A left-to-right drag qualifies a finite Line only when both endpoints are strictly inside the rectangle. Partial containment, crossing, and boundary contact do not qualify. |
| Crossing / intersection selection | **IMPLEMENTED FOR LINES** | A right-to-left drag qualifies Lines that are contained, partly contained, crossing, or touching the rectangle; edge and corner contact count. |
| Window / containment selection | **IMPLEMENTED FOR CIRCLES** | A left-to-right drag qualifies a Circle only when its entire curve is strictly inside the rectangle. |
| Crossing / intersection selection | **IMPLEMENTED FOR CIRCLES** | A right-to-left drag qualifies a Circle when its curve lies in, intersects, or touches the rectangle; a rectangle wholly inside the empty interior without touching the circumference does not qualify. |
| Window / containment selection | **IMPLEMENTED FOR ARCS** | A left-to-right drag qualifies an Arc only when its complete finite curve is strictly inside the rectangle. |
| Crossing / intersection selection | **IMPLEMENTED FOR ARCS** | A right-to-left drag qualifies an Arc when its finite curve lies in, intersects, or touches the rectangle; the full support Circle is not selection geometry. |

An unmodified completed box replaces the common geometry selection, including clearing
it when no eligible entity qualifies. Ctrl toggles each qualifying Line, Circle, or Arc
against the existing ordered common selection, preserves selected points, and makes an
empty result a no-op.
The current box does not independently select SketchPoints/endpoints. It does not run
snap/inference or author automatic constraints; Ctrl here means selection toggle rather
than snap bypass. Selection and its rectangle remain transient UI state and create no
Drawing document or History entry.

The intended common selection direction is:

```text
direct click selection OR directional drag-box multi-selection
  -> common Drawing selection
  -> where supported, a Drawing tool evaluates the existing selection
```

Constraints consumes the resulting common `selectedGeometry` through its existing
applicability and cardinality rules; no automatic subset selection was added.
Dimensions remains tool-first, and its canvas-preselection workflow remains planned.

Further selection capability remains future work: independent point/endpoint box
selection, Shift behavior, batch delete, group Direct Manipulation, additional entity
types beyond Lines, Circles, and Arcs and their qualification semantics, and policies for
nested, support, locked, or hidden geometry are not implemented or remain undefined.
Multiple selected entities do not imply group movement, and current Delete behavior
must not be read as batch delete.

## E. Planned drawing tools

| Tool or family | Status | Roadmap scope | Design boundary |
| --- | --- | --- | --- |
| Profile | **PARTIALLY IMPLEMENTED; STRAIGHT-SEGMENT FOUNDATION BROWSER-VERIFIED AND ACCEPTED** | Continue from the existing chained straight-Line-segment foundation exposed as `Profile`. It creates connected Line entities, continues authoring from the preceding endpoint, and forms a continuous chain through the common Drawing architecture for inference, constraints, authority, topology, presentation, and commit behavior. Extend that foundation with radius/arc segments, transitions between straight and radius/arc segments, and tangent transitions where applicable; a radius/arc should be able to start tangent to the preceding Profile segment. | The existing chained functionality is valuable Profile implementation to extend, not discard. Exact radius/arc interaction, construction method, tangent workflow, solver details, and UI remain future design work; continued development must use the common inference/constraint architecture. |
| Line | **IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED** | The standalone Line tool defines P1, defines P2, creates exactly one straight Line, and completes without automatically continuing from P2. Persistent activation repeats independent constructions, resetting fully to a fresh P1 after each completed Line. | Line and Profile share the common straight-segment inference, constraint, topology, presentation, and mutation foundations. Both persist ordinary `DrawingLineEntity` / `type: 'line'` geometry; authoring origin is not persisted. |
| Spline | **DESIGN REQUIRED** | Create smooth curves through created/control points and support tangent continuity between relevant points or segments. | Mathematics, point model, degree, solver integration, and UI remain open. |
| Ellipse | **PLANNED** | Add an Ellipse drawing tool. | Variants and interaction are not specified. |
| Axis | **DESIGN REQUIRED** | Add a construction/reference axis for geometric operations and constraints. | Interaction and persistence semantics remain open. |
| Corner | **DESIGN REQUIRED** | Create radius/fillet geometry at corners. | Selection workflow and solver behavior remain open. |
| Mirror | **DESIGN REQUIRED** | Mirror selected geometry around a selected/reference axis. | Copy, constraint, and associativity behavior remain open. |
| Quick Trim | **DESIGN REQUIRED** | Quickly trim geometry at relevant intersections or boundaries. | Exact interaction remains open. |
| Rectangle | **DESIGN REQUIRED** | Add a Rectangle family with **four variants**. | The four variants have not been specified and will be defined later. |
| Circle — Center + Radius | **IMPLEMENTED / MERGED / BROWSER-VERIFIED / ACCEPTED / DOCUMENTED** | P1 establishes or reuses a persistent center `SketchPoint`; pointer movement shows a visible live semantic Circle preview; P2 is a radius-defining authoring control and commits the Circle with one authoritative scalar radius. Persistence, History, semantic center selection, snap/inference, constraints, Dimensions, exact box selection, and both center and body/radius Direct Manipulation are integrated. | Circle is true semantic geometry, not persistent tessellation. P2 is not a persistent radius point. Direct authoring onto the center reuses `centerPointId`; manual Coincidence between a separate endpoint and center preserves both identities and stores `COINCIDENT` / `point-point`. |
| Arc — standalone three-point | **STAGE 3 ACCEPTED; STAGE 4 NOT STARTED / READY TO IMPLEMENT** | P1 → P2 → P3 authoring, finite geometry, topology, Dimensions, Constraints, and center/endpoint snap use the canonical Stage 3 model. | Persistent center/radius/P1/P2/orientation replaces the historical bulge runtime. Arc own-grip Direct Manipulation is deferred to Stage 4; acceptance evidence and its endpoint-drag discrepancy are recorded below. |
| Circle — older three-point full-Circle item | **DESIGN REQUIRED / UNRESOLVED** | The prior roadmap separately proposed a three-point-defined full Circle. The newly decided standalone three-point Arc does not silently cancel that older item. | Its continued product need, authoring order, and priority require a future explicit decision; it must not be confused with the Arc workflow. |


### Near-term circular-geometry sequence

Circle's current foundation and Radius / Diameter integration are accepted and documented.
Stage 3 is **ACCEPTED — user approved 2026-10-09**. Stage 4 is **NOT STARTED / READY TO IMPLEMENT**. Historical Arc Stage 1 acceptance remains historical evidence.

**CURRENT IMPLEMENTATION.** `DrawingArcEntity` stores `centerPointId`, scalar `radius`,
`startPointId`, `endPointId`, and `orientation`. Center and endpoints are persistent
`SketchPoint`s; angles, sweep, P3, and support Circle geometry are derived. Legacy bulge
records are converted only at the restore boundary.

**LOCKED TARGET ARCHITECTURE — IMPLEMENTED IN STAGE 3.** Circle and Arc share one semantic
and mathematical **Circular Support** foundation: semantic center, radius, and resolved
support Circle. Circle uses it directly. Arc adds persistent `startPointId`, `endPointId`,
and `orientation: CW | CCW`; its center is a persistent first-class `SketchPoint` through
`centerPointId`. This locks the semantics, not a TypeScript interface or class name.
Circle and Arc must not become separate mini-CAD models for the same support-circle math.

P1 start → P2 end → P3 form/curvature remains the authoring workflow. P3 determines the
circumcircle and orientation with P1/P2 when valid, but is not defining Arc storage. An
independently persistent P3 may retain a separately authored Point-on-Arc/Coincidence
relation. P1/P2 retain stable persistent identity, sharing, Coincidence, Dimensions,
Constraints, History, and persistence.

For target state `{ centerPointId, radius, startPointId, endPointId, orientation }`,
orientation is the sole persistent branch state. Signed/absolute sweep, minor/semicircle/
major classification, angles, SVG flags, and Arc length are derived. No `major` bit or
authoritative signed sweep is stored. The valid finite-Arc domain is
`0 < |sweep| < 2π` with `P1 != P2`; a full Circle remains a Circle, while near-full Arcs
are valid and must not be shortened automatically. At π, CW and CCW distinguish the two
directed semicircles, and crossing π retains orientation while only derived classification
changes.

The target exposes seven continuous solver coordinates (`Cx`, `Cy`, `R`, P1 x/y, P2 x/y)
but generically has five geometric DOF because intrinsic entity-defining equations
`|P1-C| = R` and `|P2-C| = R` remove two. Orientation is discrete branch state, not a
continuous DOF. These radial equations must participate in future component analysis,
rank/DOF, projection, and candidate verification without appearing as user Constraints.

Direct Manipulation semantics are locked. Free body/radius drag fixes C and changes R,
scaling both endpoint vectors from C and preserving directions, sweep, and orientation;
it is not translation. Free center drag rigidly translates C/P1/P2 with R and finite
extent unchanged. P1/P2 drag keeps the opposite endpoint as an exact pivot. Endpoint
solving prioritizes: (0) defining equations, persistent Constraints/Driving Dimensions,
valid domain, orientation, pivot, and shared identity; (1) pointer distance; (2)
representation-independent whole-directed-Arc least-change continuation; then (3) a
canonical neutral tie-break. The current seven-sample curve displacement, center
displacement, and normalized/log-radius metric should initially be retained for migration
parity, but exactly seven samples is not the permanent architecture contract.

Endpoint manipulation is drag-start-absolute: mouse-down geometry plus total pointer
delta is normative. A previous preview may seed numerics but cannot become authority, so
results remain event-rate independent, reversible, and deterministic. With fixed R and
opposite endpoint pivot, feasible chord length is at most `2R`; feasible pointers reach
the pointer if other constraints allow and candidate centers are resolved by orientation
and continuation. An outside pointer projects to `2R`, producing a semicircle centered
at the chord midpoint without moving the pivot or changing orientation.

Arc-center selection must identify the center—not the parent Arc—and the persistent
center must support hit testing, snapping, inference/alignment, Dimensions, Constraints,
Coincidence, manipulation, topology, solver dependencies, History, Undo/Redo,
persistence/restore, and deletion/cleanup. Separately, future selection/reference
architecture must represent both persistent and derived/dependent semantic points; it
must not assume every future semantic point has a `pointId`.

#### Circle/Arc implementation stages and status

The target architecture above is **LOCKED**; the canonical representation and restore
migration are implemented and accepted in Stage 3. Stages 4–6 remain separate work.
The stages below track the route to that target and do not reopen its
representation. The architecture-lock documentation PR is not Stage 0.

Repository state plus the authority documents are the source of truth between separate
Codex threads; prior chat context is not authority. Before starting a stage, record and
verify its baseline against the preceding merged stage. On completion, update its
metadata so the next thread can identify the last completed stage, merged commit, known
temporary regressions, acceptance evidence, and next stage without hidden context.

Status values are **NOT STARTED**, **IN PROGRESS**, **IMPLEMENTED**, and **ACCEPTED**.
**IMPLEMENTED** means the stage-scope implementation is merged. **ACCEPTED** additionally
means the required acceptance evidence is complete; passing automated tests alone does
not establish acceptance where real browser verification is required. A checkbox is
checked only at **ACCEPTED**.

- [x] **Stage 0 — Characterization & invariants** — **ACCEPTED**
  - **Status:** ACCEPTED.
  - **Scope:** Lock accepted current Circle/Arc behavior with representation-independent
    characterization and regression tests before major refactoring. No target Arc runtime.
  - **Baseline:** `5aa31aa0d3ce763db9b376a0382e9aa2af66ca0e` (`Document Circle
    and Arc implementation stages (#599)`).
  - **PR:** #600, `Characterize Circle and Arc migration invariants`.
  - **Merged commit:** `c82f3e92ad0d87ebdfa6b5399d1b1ab53ee9abac`.
  - **Known temporary regressions:** None.
  - **Acceptance:** Automated characterization and production build passed:
    `npm run test:drawing-circle`, `npm run test:drawing-arc`,
    `npm run test:drawing-circle-direct-manipulation`,
    `npm run test:drawing-arc-direct-manipulation`,
    `npm run test:drawing-circular-dimension`,
    `npm run test:drawing-semantic-point-inference`,
    `npm run test:drawing-pointer-arbitration`,
    `npm run test:drawing-circle-coincidence-runtime`, and `npm run build`. Mikael's
    real-browser smoke acceptance passed Circle creation, center drag, and body/radius
    drag, plus Arc P1 → P2 → P3 creation, center drag as whole-Arc translation,
    body/radius drag, P1 drag with P2 as exact opposite-endpoint pivot, and P2 drag with
    P1 as exact opposite-endpoint pivot.
- [x] **Stage 1 — Common Circular Support & radius foundation** — **ACCEPTED**
  - **Status:** ACCEPTED.
  - **Scope:** Establish a genuinely Circle/Arc-neutral Circular Support, persistent
    center/radius concepts, shared circular-radius solver capability, and required neutral
    equation infrastructure. Circle may migrate to it; the current Arc remains the sole
    Arc runtime authority throughout this stage.
  - **Baseline:** `2d30ed9decdef5bc2e326564365fb684203daf68` (`Accept Circle and
    Arc Stage 0 (#601)`).
  - **PR:** #602, `Build common Circular Support foundation`.
  - **Merged commit:** `890e3094f8504ecd755eb4db2824ffea0ead22e8`.
  - **Known temporary regressions:** None. Current Arc remains endpoint + endpoint
    + bulge and retains `arc-bulge`; no target Arc state is present.
  - **Acceptance:** Automated Stage 1 foundation and Stage 0 regression evidence passed:
    `npm run test:drawing-circular-support`, `npm run test:drawing-circle`,
    `npm run test:drawing-arc`, `npm run test:drawing-circle-direct-manipulation`,
    `npm run test:drawing-arc-direct-manipulation`,
    `npm run test:drawing-circular-dimension`,
    `npm run test:drawing-semantic-point-inference`,
    `npm run test:drawing-pointer-arbitration`,
    `npm run test:drawing-circle-coincidence-runtime`, and `npm run build`. Mikael's
    real-browser acceptance passed Circle creation, center snap/share behavior, center
    and body/radius drag, and Diameter Dimension with the Ø presentation. It also passed
    Arc P1 → P2 → P3 creation, center and body/radius drag, each endpoint drag with the
    opposite endpoint as the exact stationary pivot, and Radius Dimension with the R
    presentation.
- [x] **Stage 2 — Topology, semantic point & solver readiness** — **ACCEPTED**
  - **Status:** ACCEPTED — merged and browser-verified.
  - **Scope:** Prepare generic entity-defining point/equation enumeration, solver
    component/rank/DOF support, topology/cleanup, and semantic point/selection foundations.
    Endpoint-plus-bulge remains the sole Arc runtime authority; there is no target Arc
    storage in this stage.
  - **Baseline:** `35ca8dbd17f8f41889d0c2b3efaf27b8259b091b` (`Accept Circular
    Support Stage 1 (#603)`).
  - **PR:** #604 (`Prepare Drawing topology and solver foundations`).
  - **Merged commit:** `3a9d94709480191a83454f253a02f1b77c31ca72`.
  - **Known temporary regressions:** None known. Current Arc remains endpoint + endpoint
    + bulge and retains `arc-bulge`; no target Arc state or radial equations are present.
  - **Automated evidence:** Entity-definition, topology, semantic-selection,
    component/rank/DOF, Stage 0/1 regression, TypeScript, and production-build checks are
    recorded in the implementation PR.
  - **Acceptance:** Merged and browser-verified by Mikael.
- [x] **Stage 3 — Atomic Arc representation/solver cutover** — **ACCEPTED**
  - **Status:** ACCEPTED — user approved 2026-10-09.
  - **Scope:** Atomically change canonical runtime Arc from P1 + P2 + bulge to Center +
    Radius + P1 + P2 + Orientation. Include the target entity and resolver, persistent
    center/radius/orientation, authoring commit, solver variables and intrinsic radial
    equations, component/rank/DOF, Dimensions, Constraints, `CIRCULAR_SIZE`, selection and
    references, serialization/schema and legacy migration, topology, deletion/cleanup,
    plus rendering/hit/snap required for a canonical target Arc.
  - **Cleanup contract:** Canonical production must no longer use
    `DrawingArcEntity.bulge`, `arc-bulge`, `arcBulgeSolverVariable`, runtime
    `resolveArcFromBulge`, bulge sign as orientation authority, or a derived Arc center as
    runtime center identity. These obsolete symbols describe the completed cutover cleanup
    contract; none may regain canonical authority. Legacy bulge conversion may remain only
    at an explicit migration/import/export boundary where required.
  - **Baseline:** `3a9d94709480191a83454f253a02f1b77c31ca72` (`Use intrinsic equations across DOF analysis (#604)`).
  - **PRs:** #605 (canonical cutover), #606–#611 (readiness fixes and stabilization).
  - **Accepted main / merged stabilization commit:** `efc436cca13e4c74717510742d3d97bdfff556fb`.
  - **Known temporary regressions:**
    - **Behavior:** Arc center, body/radius, P1, and P2 own-grip Direct Manipulation are unavailable.
      **Reason:** Stage 4 owns manipulation on persistent Center + Radius + P1 + P2 + Orientation.
      **Introduced:** Stage 3. **Restored:** Stage 4.
      **Why old path cannot safely remain:** It depends on bulge solver authority and a derived center.
  - **Acceptance:** Mikael explicitly approved Stage 3 on 2026-10-09, reporting correct
    P1 → P2 → P3 creation, P1/P2 drag with opposite-endpoint pivot, working Dimensions
    and Constraints, and Line snap to center/P1/P2. The supplied Stage 3.6 report records
    24/24 Arc tests PASS, 16/16 Chromium scenarios PASS, 52/66 regression scripts PASS
    with the same 14 previously known failures, and D1–D7, P1, R4 PASS. No new blocking
    Stage 3 regression was identified. This documentation task did not rerun those checks.
  - **Evidence discrepancy:** The accepted-main own-grip factories and regression test
    still disable Arc center/body/endpoint grips. The reported endpoint-pivot browser
    behavior is retained as user evidence, not proof that those factories are enabled.
    Stage 4 must reconcile the exact interaction path and verify target-native endpoint drag.
  - **Open risks:** R1–R3 remain open; their detailed definitions were not supplied and
    are not present in this repository. Do not infer closure from acceptance or invent
    their contents. R5, actual Drawing Save/Reload, is NOT IMPLEMENTED and outside
    Stage 3; restore migration/serialization tests do not establish a user-facing save flow.
- [ ] **Stage 4 — Direct Manipulation on target Arc architecture** — **NOT STARTED / READY TO IMPLEMENT**
  - **Status:** NOT STARTED / READY TO IMPLEMENT; no implementation in this documentation task.
  - **Scope:** Restore the accepted center, body/radius, P1, and P2 manipulation directly
    on Center + Radius + P1 + P2 + Orientation, including exact opposite-endpoint pivot,
    fixed-radius behavior, whole-directed-Arc continuation, orientation preservation,
    drag-start-absolute/event-rate-independent behavior, and constrained manipulation.
  - **Locked body/radius drag:** Direct dragging on the Arc body continuously changes
    scalar radius about an exact fixed persistent center. Free motion scales both
    endpoint vectors, preserving directions, sweep, and orientation; constrained motion
    respects intrinsic equations, shared topology, and persistent hard constraints.
  - **Locked center drag:** Center/P1/P2 move by the same translation. Free motion
    preserves radius, sweep, orientation, and form. Shared identities and constraints
    remain authoritative; constraints restrict the translation rather than redefine the grip.
  - **Locked endpoint drag:** Each endpoint retains the opposite endpoint as an exact
    pivot, with no regression in the locked continuation and fixed-radius contracts.
  - **Acceptance requirements:** Verify all three grip meanings in the real browser,
    free and constrained; correct preview/commit, Escape/cancel, Undo/Redo, pointer
    priority, zoom, coordinate offsets, and Circle/Line regressions. Require drag-start-
    absolute, event-rate-independent and reversible results, exact pivots, valid finite
    domain, fixed-radius `2R` projection, orientation and topology preservation. Reconcile
    the Stage 3 endpoint evidence discrepancy and carry R1–R3 forward as open.
  - **Hard contract:** Do not reintroduce `bulge`, `arc-bulge`, derived Arc-center
    authority, target-to-old-runtime conversion for manipulation, or a permanent old/new
    dual path. Real browser verification of Direct Manipulation is required for
    **ACCEPTED** status.
  - **Preparation reference:** Accepted Stage 3 main `efc436cca13e4c74717510742d3d97bdfff556fb`.
  - **Implementation baseline:** Verify current main again after this documentation PR
    is merged; this reference does not authorize use of an obsolete checkout.
  - **PR:** Not assigned.
  - **Merged commit:** Not assigned.
  - **Known temporary regressions:** None — implementation not started.
  - **Acceptance:** Not started.
- [ ] **Stage 5 — Semantic cleanup & compatibility isolation** — **NOT STARTED**
  - **Status:** NOT STARTED.
  - **Scope:** Perform the final repository-wide audit for obsolete Arc helpers, runtime
    branches, compatibility aliases, Arc-specific derived-center paths, stale bulge
    assumptions, duplicate paths, dead tests, and stale comments/naming that can only be
    removed safely after all callers migrate. Preserve/generalize legitimate semantic or
    derived-point infrastructure, explicit legacy migration boundaries, and common
    Circle/Arc foundations. This stage is not permission to defer obviously obsolete code
    from Stages 1–4; clean-as-you-go applies throughout.
  - **Baseline:** Not assigned.
  - **PR:** Not assigned.
  - **Merged commit:** Not assigned.
  - **Known temporary regressions:** None — implementation not started.
  - **Acceptance:** Not started.
- [ ] **Stage 6 — Final acceptance & documentation sync** — **NOT STARTED**
  - **Status:** NOT STARTED.
  - **Scope:** Complete full regression and browser acceptance, legacy restore, target
    save/reload, Circle and Arc regression, final cleanup audit, and documentation sync.
    Remaining migration work stays pending until accepted; the canonical representation
    and restore migration already accepted in Stage 3 remain accepted.
  - **Baseline:** Not assigned.
  - **PR:** Not assigned.
  - **Merged commit:** Not assigned.
  - **Known temporary regressions:** None — implementation not started.
  - **Acceptance:** Not started.

#### Staged-migration policy

Stages 3 and 4 may be implemented and merged separately. A completed migration stage may
temporarily leave behavior explicitly assigned to the immediately following stage
unavailable, disabled, incomplete, or regressed only when the completed stage records the
specific limitation in **Known temporary regressions**. Each stage must leave a
deterministic, understood repository state, and the following stage must explicitly
restore the deferred behavior directly on the target architecture. This is a narrow
migration exception, not permission for arbitrary breakage or for silently postponing
work outside the next stage.

In particular, after Stage 3 an explicitly documented Arc Direct Manipulation limitation
scheduled for Stage 4 is preferable to hidden old bulge authority. Do not convert target
Arc back to bulge for old manipulation and do not retain old and new Arc runtimes in
parallel merely to mask the intermediate limitation.

Every stage follows:

```text
Replace → migrate callers → verify → delete obsolete path
```

not “add a new path and leave the old path indefinitely.” Each stage must audit old
callers/helpers, duplicate resolvers or authorities, compatibility shims, obsolete tests,
and stale comments. Every temporary shim/adapter must record its **Purpose**, **Introduced
in stage**, **Required callers**, **Exit condition**, and **Deletion stage**. A legitimate
versioned legacy document reader may remain while old-format support is a product
requirement, but it must never become a canonical-Arc runtime adapter.

Legacy P1/P2/bulge migration must deterministically produce center/radius/P1/P2/orientation;
under the current convention `bulge > 0` maps to CCW and `bulge < 0` to CW. Migration is
not part of this documentation task.

Concentricity and Tangency remain **PLANNED / NOT IMPLEMENTED** architecture tests.
Circular Support must reduce Circle↔Circle, Circle↔Arc, and Arc↔Arc Concentricity to the
same center relation. Shared support-circle Tangency math must additionally validate that
an Arc contact lies on its finite directed extent. The foundation must remain extensible
to Ellipse, fillets, Profile Arcs, and dependent semantic points.

### Decided first-Circle semantics

- P1 is the center. It can use an existing persistent `SketchPoint`, Line Midpoint,
  finite Line body, existing Circle circumference, applicable shared positional
  Alignment, or raw/free placement. If it snaps to an existing persistent `SketchPoint`, the Circle
  shares that same topological identity; it does not create a duplicate point plus
  Coincidence.
- If P1 is accepted through a valid existing Midpoint inference/snap, its persistent
  Midpoint semantic relation is retained after Circle creation.
- A finite-Line P1 persists global `COINCIDENT` / `point-linear-support` semantics;
  acquisition is against the visible finite Line while the persistent relation follows
  the established linear-support semantics.
- An existing-Circle-circumference P1 is projected onto true Circle geometry and
  persists global `COINCIDENT` / `point-curve` (Point-on-Curve) semantics. It creates no
  duplicate point and is not Tangency. Curve capture/release is 5/7 CSS px.
- P2 establishes radius but is not a persistent radius point. Raw/free P2 uses the
  accepted pointer position and creates neither a P2 `SketchPoint` nor a P2 relation.
- Automatic P2 acquisition is intentionally limited to existing persistent
  `SketchPoint`s and is circumference-driven: radial error compares the candidate
  Circle radius with the center-to-point distance in client/screen-space terms. On
  acquisition, radius becomes that exact distance and global `COINCIDENT` /
  `point-curve` (Point-on-Curve) semantics relate the existing point to the new Circle;
  the point remains angularly free. Capture/release is 7/9 CSS px.
- P2 does not automatically acquire Midpoint, finite Line, Alignment, Point Reference,
  Parallel, Perpendicular, another Circle circumference, Tangency, or quadrant.
- Circle is semantic circular geometry, not tessellated/polyline Line geometry. Its
  center and single radius truth must support later global relationships without a
  Circle-specific mini-system.
- Ctrl bypasses automatic P1 and P2 acquisition, and stationary Ctrl press/release
  immediately recomputes placement and presentation. Line, Profile, and Circle use the
  shared Drawing geometry-authoring cursor policy.

The first Circle implementation participates in common click selection, Ctrl selection
and toggle, and directional box selection. For left-to-right Window selection, the
entire finite circumference must be strictly inside the normalized rectangle; boundary
contact does not qualify. For right-to-left Crossing selection, the actual
circumference qualifies when partly inside, crossing, touching an edge/corner, or fully
contained, with boundary contact inclusive. A rectangle wholly inside the Circle's
empty interior without touching the circumference does not qualify. Ctrl+box uses the
same accepted toggle semantics as other eligible Drawing geometry.

Tangency and Concentricity are not part of first-Circle implementation. Future Tangency
must consume true semantic circular geometry through global Constraints; future
Concentricity must consume the Circle's semantic center. Radius/Diameter circular-size
Dimensions are accepted and share the Circle's authoritative radius; the implemented
Constraints-panel Radius / Diameter operation now creates that same Dimension model and
does not introduce a separate geometric-constraint type.

### Accepted standalone Arc Stage 1

The standalone Arc is circular geometry authored **P1 Start → P2 End → P3 Form/Radius
Point**. After P1, a thin transient P1-to-current-P2 reference line and visible accepted
P1 support endpoint placement. After P2, the live finite-Arc preview includes its full
underlying support Circle. These helpers and P3 are presentation/authoring state only,
not persistent entities, topology, History, selection, or export geometry.

Historically, Arc Stage 1 was accepted with three distinct Direct Manipulation meanings.
The following describes that historical bulge implementation, not current Stage 3 grip
availability; Stage 4 must restore these meanings on the canonical target model. Center drag
translates both endpoints and preserves form/bulge. Body/radius drag holds the derived
drag-start center and endpoint angles fixed in the free case, moves both endpoint
SketchPoints radially, and preserves bulge/signed sweep. Endpoint drag moves the chosen
endpoint while the opposite endpoint is an exact
transient fixed pivot, including across the full feasible branch. Persistent hard
Constraints and driving Dimensions restrict the dragged endpoint and changing form but
never release that pivot. Lower-priority continuity and least-change terms only choose
among feasible results.

### Open / future presentation work

The normative unresolved-decision register is in `PROJECT_MASTER.md` under **OPEN / FUTURE PRESENTATION DECISIONS**. Roadmap triggers are: define construction/reference presentation only when that entity concept exists; decide Radius/Diameter presentation with its Dimension and/or Constraint design; and preserve the current Midpoint widths, Alignment/Point Reference dash distinction, and separately named Constraint hover/selected roles until focused decisions revisit them. Future authoring tools default to the global Authoring Preview role; any modifier needs an explicit semantic reason and documentation. No future implementation may silently invent these behaviors.

**Current naming note:** The chained Drawing tool is named `Profile`; it authors
persistent Line entities as a continuing chain. The separate standalone `Line` tool
authors one independent segment per construction. Both workflows use the shared
straight-segment foundation and produce the same persistent Line geometry.

## F. Rules for all future Drawing tools

Future tools must integrate with the common Drawing architecture. Drawing capability
remains global/shared wherever geometry semantics allow it: reuse and generalize an
existing foundation when a real multi-geometry consumer exists, rather than inventing
a speculative framework or geometry-specific subsystem. This applies to Constraints,
Dimensions, selection, hit testing, directional box selection, snap, inference,
topology, semantic geometry, presentation, Direct Manipulation, History, persistence,
deletion, and future trim/mirror/corner behavior. Future tools must not create
independent, tool-specific systems for those concerns.

The architecture must continue to keep these concerns distinct:

- topology;
- position authority;
- direction authority;
- geometric semantics;
- solver state;
- transient inference presentation;
- persistent constraint presentation; and
- dimension presentation.

Compatibility between geometric relations must be evaluated before priority
arbitration. Priority should choose among genuinely incompatible authorities, not erase
compatible geometric truth.

# 2. Puzzle

**Current status: PLANNED / unimplemented.** Puzzle is a separate future top-level
workspace. The disabled workspace selector is only a reservation; there is currently no
Puzzle document, tool set, solver, or export pipeline. Puzzle is not the historical P1
bending-pattern functionality and must not be conflated with P1, TB, S, Wall, or other
Box / Construction tooling.

## Purpose and intended flow

Puzzle will generate laser-cut jigsaw puzzles. Existing jigsaw generators may inform
future research, but this roadmap does not select or depend on a third-party algorithm.

The planned outer shapes are:

- Rectangle;
- Circle;
- Hexagon; and
- custom closed geometry created in 2D Drawing.

The important custom-outline flow is:

```text
2D Drawing: create/edit closed base geometry
  -> send/use the closed geometry in Puzzle
  -> subdivide its area into pieces
  -> generate mating connections
  -> verify physical uniqueness
  -> optionally generate a frame
```

Shared base geometry must remain geometrically consistent as it moves between relevant
modules. The transfer and ownership contract is not yet designed.

## Planned capabilities

| Capability | Status | Requirement | Open boundary |
| --- | --- | --- | --- |
| Outer shape | **PLANNED** | Generate within Rectangle, Circle, Hexagon, or custom closed 2D Drawing geometry. | Custom-boundary handling and module transfer need design. |
| Piece count | **DESIGN REQUIRED** | Let the user control the number of pieces. | Direct total and rows x columns are both candidates; no final UI model is selected. |
| Connection size | **DESIGN REQUIRED** | Control tab/slot or equivalent mating-feature size. | Exact parameter model remains open. |
| Optional frame | **DESIGN REQUIRED** | Optionally create a surrounding frame with configurable thickness. | Further construction details remain open. |
| Physically unique pieces | **DESIGN REQUIRED** | Make mating geometry sufficiently unique that a piece should not physically fit an incorrect location. | The uniqueness algorithm is explicitly not selected. |

## Physical uniqueness requirement

Visual randomness is insufficient. Future design must treat mating geometry as
geometric key/lock behavior and consider at least:

- tab to matching recess/socket pairing;
- reversed edge direction;
- piece rotation;
- sequences of multiple mating edges;
- variation in feature size;
- variation in feature position; and
- variation in feature shape where necessary.

A deterministic geometric signature for mating pairs is one idea for investigation,
not a committed algorithm. Selection and validation of the final uniqueness algorithm
remain **DESIGN REQUIRED**.

## Open architectural questions

These are design questions, not implementation claims or decisions:

- subdivision algorithm;
- piece-count model;
- deterministic generation and seed behavior;
- unique-connection signature algorithm;
- geometric validation of incorrect mating combinations;
- rotation-aware uniqueness validation;
- custom-outline boundary handling;
- frame relationship to puzzle geometry;
- data model and History integration;
- transfer contract between 2D Drawing and Puzzle; and
- manufacturing/export integration.

# 3. Box / Construction

**Status: IMPLEMENTED foundation with defined forward work.** Box / Construction is already
a substantial implemented area. Its current architecture is documented in
[PROJECT_MASTER.md](PROJECT_MASTER.md) and [Architecture.md](Architecture.md).

Historical Wall, TB, W, S, C, P, P1, and related analysis or diagnostic documents are
evidence of past work; they must not automatically become future roadmap commitments.
In particular, historical P1 material is not a current or future roadmap capability:
the forward product concept is **P = Pattern**, with no P1 subtype.

## A. Current status summary

| Tool or capability | Status | Current baseline and forward scope |
| --- | --- | --- |
| TB — Top / Bottom | **IMPLEMENTED** | The existing paired-edge workflow and generated finger-joint behavior are satisfactory for the present roadmap. No specific new TB development is defined here. |
| W — Wall | **PARTIALLY IMPLEMENTED** | W-A/W-B authoring, TB-related role guidance, and TB-equivalent physical generation exist. Unequal-length positioning remains future work. |
| S — Slot | **PARTIALLY IMPLEMENTED** | Paired slot/tab relationships, offsets, and panel-thickness-derived depth/length behavior exist. Crossing internal-wall slots and unequal-length positioning remain future work. |
| J — Joint | **PLANNED / NOT YET IMPLEMENTED** | Join two straight edges that physically meet, using a user-selected joint type. |
| P — Pattern | **PLANNED / NOT YET IMPLEMENTED** | Create repeated or structured panel geometry. The first defined use is a bending pattern; P means Pattern, not Bending. |
| Angle-aware assembly variants | **DESIGN REQUIRED / FUTURE** | The product and architecture require later definition; no final behavior is specified here. |
| Static 3D preview | **PLANNED** | A future static preview only. This roadmap does not imply a 3D solver, parametric assembly engine, animation, or automatic folding. |

## B. Architecture and composition direction

Forward capabilities must extend the existing construction pipeline rather than bypass
it:

```text
source geometry / Box document
  -> Panel Manager
  -> connection / construction authoring
  -> generated geometry
  -> panel composition
  -> metadata reconciliation
  -> FinalGeometry
  -> manufacturing compensation
  -> preview / export
```

Source geometry remains the stable authoring reference. Each construction tool owns its
semantic contribution, panel composition owns the combination of compatible
contributors, and `FinalGeometry` remains the downstream physical-geometry contract.
Manufacturing compensation continues to occur only after final geometry.

A panel must be able to receive compatible contributions from multiple construction
tools. This extends the existing mixed panel-composition direction: Pattern must not
turn a panel into an isolated special result that prevents W, S, J, or another
compatible operation from contributing to it. The exact composition and conflict rules
for future tools remain **DESIGN REQUIRED**.

## C. W — Wall

W is **PARTIALLY IMPLEMENTED**. The existing W-A/W-B workflow, its TB-related role
guidance, and its TB-equivalent physical generation remain the current foundation.

**Unequal-length positioning is PLANNED.** W must not assume that its participating
sides have equal lengths or matching start/end positions. The user must eventually be
able to choose which side or panel is the positional reference, define where the
connection begins along that reference, and specify an explicit distance/offset from an
edge or end. This permits placement near either end, in the middle, or at an exact
measured offset. The interaction mechanism is deliberately not selected here.

## D. S — Slot

S is **PARTIALLY IMPLEMENTED**. Its current paired slot/tab relationships, offsets, and
panel-thickness-derived depth/length behavior remain the implementation baseline.

### Crossing internal walls

**Status: PLANNED.** When two internal panels cross, S must be able to create
complementary open-ended slots that approach the crossing from opposite directions:

- Panel A receives an open slot entering from one relevant side/edge toward the
  crossing.
- Panel B receives the complementary open slot entering from the opposite relevant
  side/edge toward the same crossing.

The openings to the panel edges allow the physical pieces to slide together and
interlock. This is not merely a closed internal rectangular slot. Exact depth formulas,
assembly-orientation rules, clearance, and interaction design remain later design work.

### Unequal-length positioning

**Status: PLANNED.** S must also support participating sides or panels of different
lengths. The user must eventually be able to choose the positional reference and define
an offset/start distance from an edge or end, placing the internal-wall connection near
either end, in the middle, or at an exact measured offset. Neither centering nor equal
selected lengths may be assumed.

### Shared W / S positioning principle

W and S should share one conceptual positioning capability rather than independently
invent incompatible concepts:

```text
reference geometry
  -> choose positional reference
  -> define start / placement offset
  -> generate the appropriate W or S physical connection
```

Their generated physical geometry differs, but their need to position a connection
along unequal-length reference geometry is shared. Concrete APIs, implementation
classes, and UI remain deliberately undefined.

## E. J — Joint

**Status: PLANNED / NOT YET IMPLEMENTED.** J means **Joint**. It is intended for two
straight edges that physically meet:

```text
select two straight meeting edges
  -> J
  -> choose the desired joint type
  -> generate complementary physical joint geometry
```

Multiple selectable joint types are intended eventually, but the catalog has not been
defined and historical proposals do not define it. J must act as another semantic
construction contributor that can coexist with compatible Pattern and connection
geometry on the same panel and ultimately participate in panel composition and
`FinalGeometry`. Exact conflict resolution remains later design work.

## F. P — Pattern

**Status: PLANNED / NOT YET IMPLEMENTED.** P means **Pattern**; it does not mean
Bending. Pattern is the general Box / Construction tool for repeated or structured
geometry in or on a panel. Bending zones are its first defined product use, not a rename
of the tool or a separate P1 roadmap concept.

### Bending-pattern use

For the currently defined use, Pattern contributes internal manufacturing/cut geometry
within a selected panel region. Repeated cuts or slits form a flexible bending zone:

- cuts repeat through the bending zone;
- cuts alternate from opposite sides rather than all originating from one side;
- the arrangement is staggered/alternating; and
- relevant cuts extend to the panel edge where the bending pattern requires it.

Spacing, slot length, slot count, stagger amount, material-specific rules, the
relationship to bending radius, and parameter UI all remain **DESIGN REQUIRED**.

Pattern bending geometry is not an ordinary whole-edge contour replacement like a
TB-style profile. The panel retains its usable outer/reference geometry, while Pattern
adds the cut geometry needed for bending. Pattern must not acquire ownership of the
whole panel contour merely because that geometry exists. Its exact future
representation through generated geometry, composition, `FinalGeometry`, and
manufacturing/export requires later architecture design.

Conceptually, compatible contributions compose rather than erase one another:

```text
panel geometry
  + Pattern cut geometry
  + connection geometry
  + Joint geometry
  -> composed physical result
  -> FinalGeometry
```

### Long-panel composition example

A long strip panel will eventually be bent into a multi-sided shape. Three Pattern
bending zones can be placed at three positions along the strip. The straight edge
sections between those zones remain available for tabs or other connection geometry so
that other panels can attach; corresponding slots may be generated in those other
panels, or slots may be generated in the strip when another panel connects into it. The
two outer ends may use J to connect their straight end edges to other straight edges:

```text
LEFT END
  -> J
  -> straight connection / tab region
  -> Pattern bending zone
  -> straight connection / tab region
  -> Pattern bending zone
  -> straight connection / tab region
  -> Pattern bending zone
  -> straight connection / tab region
  -> J
  -> RIGHT END
```

The same source panel can therefore require multiple Pattern bending zones, several
straight connection/tab regions, corresponding slot relationships with other panels,
and Joint relationships at its ends. Pattern-enabled panels remain available to the
rest of Box / Construction; no one tool may erase or invalidate compatible
contributions from the others.

## G. Deferred assembly presentation

Angle-aware assembly variants remain **DESIGN REQUIRED / FUTURE**. Their final product
behavior and architecture are intentionally not invented in this roadmap.

A static 3D preview remains **PLANNED / NOT YET IMPLEMENTED**. This is limited to a
future static preview and does not commit to a 3D solver, parametric assembly engine,
animation system, or automatic folding system.
