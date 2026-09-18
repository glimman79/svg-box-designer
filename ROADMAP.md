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
| **PLANNED** | Intended product work whose scope is sufficiently clear to record. |
| **LATER** | Intentionally deferred to a later roadmap pass. |
| **DESIGN REQUIRED** | Goal is known, but important interaction, data, geometry, or solver decisions remain open. |

# 1. 2D Drawing

## A. Existing foundation

The roadmap builds on these verified capabilities without treating completed work as a
future task:

| Foundation | Status | Current baseline |
| --- | --- | --- |
| Line and chaining | **IMPLEMENTED** | Line is the core authored entity. Each chained straight segment is a fresh Line interaction that can share its committed end `SketchPoint` with the next segment. |
| Profile, straight-segment baseline | **IMPLEMENTED** | The current profile-like authoring baseline is a chain of straight Line entities; it is not a separate persistent Profile entity. |
| Topology | **IMPLEMENTED** | Stable `SketchPoint` records own point identity and coordinates; connected Lines share point identity. |
| Inference and snapping | **IMPLEMENTED** | Endpoint, Midpoint, finite-Line, alignment, angular, Parallel, Perpendicular, and Point Reference candidates feed the current Line workflow. |
| Geometric constraints and solver | **IMPLEMENTED** | Horizontal, Vertical, Parallel, Perpendicular, Coincidence (point-to-point and point-to-Line support), and Midpoint are first-class semantic constraints. |
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
not a geometric Constraint merely because the Constraints panel contains a choice with
the same label.

| Dimension | Status | Presentation |
| --- | --- | --- |
| Distance | **IMPLEMENTED** | Point-to-point, point-to-Line, and Line-to-Line distance forms use live placement preview, dimension lines and arrows, applicable extension/witness geometry, and displayed measured values. |
| Length | **IMPLEMENTED** | Selecting a Line supports an aligned Line-length dimension with live placement preview, dimension graphics, and a displayed measured value. |
| Angle | **IMPLEMENTED** | Line-to-Line angle uses live placement preview, an angle arc with arrows, applicable support extensions, and a displayed measured value. |

Distance, Length, and Angle in this table describe implemented **Dimension**
functionality. The identically named choices in the Constraints panel are not yet
developed as geometric Constraints.

## C. Constraints

Constraints is a separate, selection-driven Drawing tool. Its high-level interaction is:

```text
selected geometry
  -> determine applicable constraints
  -> enable applicable choices and keep the others disabled
  -> user chooses a Constraint
  -> apply that Constraint to the selected geometry
```

Depending on the Constraint, selection can involve a Line, two Lines, a point, two
points, or a point and a Line. The production applicability policy remains the authority
for exact selection contracts. A disabled panel choice does **not** by itself mean that
the Constraint is unimplemented: an implemented choice is also disabled when it is not
applicable to the current selection, is already present, or conflicts with an existing
Horizontal/Vertical choice. Separately, the panel deliberately shows choices whose
Constraint behavior has not yet been developed.

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
| Distance | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Length | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Angle | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Radius / Diameter | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Symmetry | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Fix | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Concentricity | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |
| Tangency | **DESIGN REQUIRED** | Present in the panel, but Constraint behavior and presentation are not yet developed. |

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

## D. Planned drawing tools

| Tool or family | Status | Roadmap scope | Design boundary |
| --- | --- | --- | --- |
| Line | **IMPLEMENTED** | Continue to provide the common inference, constraint, authority, and presentation basis for new Drawing work. | Not a from-scratch tool project. |
| Profile | **PLANNED** | Extend chained straight segments with radius/arc segments. An arc should be able to start tangent to the preceding Profile segment and use the common inference/constraint architecture. | Exact interaction and UI are not yet specified. |
| Spline | **DESIGN REQUIRED** | Create smooth curves through created/control points and support tangent continuity between relevant points or segments. | Mathematics, point model, degree, solver integration, and UI remain open. |
| Ellipse | **PLANNED** | Add an Ellipse drawing tool. | Variants and interaction are not specified. |
| Axis | **DESIGN REQUIRED** | Add a construction/reference axis for geometric operations and constraints. | Interaction and persistence semantics remain open. |
| Corner | **DESIGN REQUIRED** | Create radius/fillet geometry at corners. | Selection workflow and solver behavior remain open. |
| Mirror | **DESIGN REQUIRED** | Mirror selected geometry around a selected/reference axis. | Copy, constraint, and associativity behavior remain open. |
| Quick Trim | **DESIGN REQUIRED** | Quickly trim geometry at relevant intersections or boundaries. | Exact interaction remains open. |
| Rectangle | **DESIGN REQUIRED** | Add a Rectangle family with **four variants**. | The four variants have not been specified and will be defined later. |
| Circle | **DESIGN REQUIRED** | Add exactly two currently planned variants: (1) standard Circle and (2) three-point-defined Circle. | UI sequence and parameterization remain open. |

## E. Rules for all future Drawing tools

Future tools must integrate with the common Drawing architecture. They must not create
independent, tool-specific systems for snapping, inference, constraints, transient
preview, persistent glyphs, or support/reference visualization.

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

**Status: IMPLEMENTED foundation; forward roadmap LATER.** Box / Construction is already
a substantial implemented area. Its current architecture is documented in
[PROJECT_MASTER.md](PROJECT_MASTER.md) and [Architecture.md](Architecture.md).

Its forward roadmap will be added after a separate review. Historical Wall, TB, W, S,
C, P, P1, and related analysis or diagnostic documents are evidence of past work; they
must not automatically become future roadmap commitments.
