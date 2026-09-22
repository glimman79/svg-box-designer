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
| Geometric constraints and solver | **IMPLEMENTED** | Midpoint, Coincidence, Parallelism, Perpendicular, Horizontal, and Vertical are implemented Constraint operations. Concentricity and Tangency remain inactive placeholders and are not implemented. |
| Dimensions | **IMPLEMENTED** | Driving and reference distance, length, and Line-to-Line angle forms have solver and annotation paths. |
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
| Radius / Diameter | **PLANNED / NOT IMPLEMENTED** | Inactive panel placeholder only. Constraint behavior and presentation are not developed; future Radius/Diameter Constraints must consume the Circle’s authoritative semantic radius. |
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

**Status: IMPLEMENTED / BROWSER-VERIFIED AND ACCEPTED FOR LINES.** Directional drag-box
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

An unmodified completed box replaces the common geometry selection, including clearing
it when no Line qualifies. Ctrl toggles each qualifying Line against the existing
ordered common selection, preserves selected points, and makes an empty result a no-op.
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
types and their qualification semantics, and policies for nested, support, locked, or
hidden geometry are not implemented or remain undefined. Multiple selected Lines do
not imply group movement, and current Delete behavior must not be read as batch delete.

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
| Circle — Center + Radius | **PLANNED / NOT IMPLEMENTED; NEXT DRAWING GEOMETRY** | P1 establishes the center, pointer movement previews a true semantic Circle, and P2 establishes the radius and commits it. The first implementation includes ordinary click selection, common Ctrl toggle, and directional Window/Crossing box selection. | Tangency, Concentricity, and Radius/Diameter Dimension or Constraint are explicitly excluded from this first implementation. |
| Arc — standalone three-point | **PLANNED / NOT IMPLEMENTED; AFTER CIRCLE** | Author in the order P1 = start, P2 = end, P3 = form/curvature/radius-defining point: **Start → End → Form Point**, not Start → Through Point → End. | P3 need not remain an independent persistent SketchPoint; exact persistence is decided during implementation architecture. |
| Circle — older three-point full-Circle item | **DESIGN REQUIRED / UNRESOLVED** | The prior roadmap separately proposed a three-point-defined full Circle. The newly decided standalone three-point Arc does not silently cancel that older item. | Its continued product need, authoring order, and priority require a future explicit decision; it must not be confused with the Arc workflow. |


### Near-term circular-geometry sequence

This is planning order, not implementation status:

1. Circle — Center + Radius;
2. standalone three-point Arc — Start + End + Form Point;
3. Radius / Diameter Dimension;
4. Radius / Diameter Constraint;
5. Concentricity; and
6. Tangency.

Radius / Diameter **Dimension** and Radius / Diameter **Constraint** remain distinct
Drawing workflows and are both **PLANNED / NOT IMPLEMENTED**. Circle must provide one
authoritative semantic radius consumed by both future systems rather than separate
radius authorities.

### Decided first-Circle semantics

- P1 is the center. If it snaps to an existing persistent `SketchPoint`, the Circle
  shares that same topological identity; it does not create a duplicate point plus
  Coincidence.
- If P1 is accepted through a valid existing Midpoint inference/snap, its persistent
  Midpoint semantic relation is retained after Circle creation.
- P2 establishes radius. A Midpoint used at P2 is placement assistance only and creates
  no persistent Midpoint relation or permanent Circle control point.
- If P2 resolves to an existing persistent `SketchPoint`, that point must remain on the
  Circle while retaining free angular motion: `distance(point, center) == radius`.
  Exact constraint/type naming remains open, but this persistent point-on-curve meaning
  belongs to the global Constraints/geometric-relation architecture.
- If P2 does not resolve to an existing persistent `SketchPoint`, it is authoring input
  only; no new permanent radius point is required merely because P2 was clicked.
- Circle is semantic circular geometry, not tessellated/polyline Line geometry. Its
  center and single radius truth must support later global relationships without a
  Circle-specific mini-system.

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
Concentricity must consume the Circle's semantic center. Radius/Diameter Dimensions and
Constraints likewise follow later and share the Circle's authoritative radius.

### Decided standalone Arc direction

The planned standalone Arc is circular geometry authored **P1 Start → P2 End → P3 Form
Point**. P3 determines the final circular Arc between P1 and P2, but current intent does
not require P3 to persist as an independent SketchPoint. During authoring, show the
actual Arc prominently and a thin full support Circle as reference presentation. That
support Circle is not automatically a second persistent entity, selectable or snap
geometry, topology, History state, or exported geometry. Exact styling, lifecycle, and
persistence representation remain implementation decisions.

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
