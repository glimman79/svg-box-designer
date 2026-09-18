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
| Presentation | **IMPLEMENTED** | Transient inference and persistent constraint layers exist. Midpoint and Parallel already share semantic layout geometry between live and persistent presentation; other relations still need convergence. |

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

## B. Constraint, inference, and presentation architecture

The long-term direction is one shared presentation architecture rather than unrelated
JSX/SVG implementations for every tool or relation:

```text
semantics / solver
  -> presentation derivation
  -> shared overlay
  -> glyph + support geometry + highlight
```

`DrawingInferencePresentation` is an existing, partial shared transient-presentation
model. Names such as `DrawingConstraintPresentation`, `DrawingConstraintGlyph`, and
presentation-only `supportGeometry` describe possible future concepts, not current
production types or locked API names.

| Relation | Semantic status | Transient direction | Persistent direction | Relation/support presentation |
| --- | --- | --- | --- | --- |
| Horizontal | **IMPLEMENTED** (`HORIZONTAL`) | Converge on shared inference overlay | H glyph exists | Add only where useful |
| Vertical | **IMPLEMENTED** (`VERTICAL`) | Converge on shared inference overlay | V glyph exists | Add only where useful |
| Parallel | **IMPLEMENTED** (`PARALLEL`) | Shared inference presentation exists | `II`-style marker exists through shared layout | Reference/support between Lines |
| Perpendicular | **IMPLEMENTED** (`PERPENDICULAR`) | Shared inference presentation exists | 90-degree corner exists | Extend support Lines to their theoretical intersection when needed |
| Coincidence, point-to-point | **IMPLEMENTED** (`COINCIDENT`) | Converge on shared inference overlay | Square marker exists | Related point |
| Coincidence, point-to-Line | **IMPLEMENTED** (`COINCIDENT`) | Converge on shared inference overlay | Square marker exists | Target Line/reference |
| Midpoint | **IMPLEMENTED** (`MIDPOINT`) | Shared/current reference path | `-square-` marker through shared layout | Target Line |
| Distance | **IMPLEMENTED** (dimension) | Dimension preview | Dimension graphics | Extension Lines |
| Length | **IMPLEMENTED** (dimension) | Dimension preview | Dimension graphics | Current Line |
| Angle | **IMPLEMENTED** (dimension) | Angle preview | Arc and arrows | Support/reference Lines |
| Radius / Diameter | **DESIGN REQUIRED** | Follow shared principle | Dedicated annotation | Target curve |
| Symmetry | **DESIGN REQUIRED** | Follow shared principle | Symmetry glyph | Both objects and symmetry axis |
| Fix | **DESIGN REQUIRED** | Follow shared principle | Lock glyph | Target geometry |
| Concentricity | **DESIGN REQUIRED** | Follow shared principle | Concentric-circle glyph | Both targets |
| Tangency | **DESIGN REQUIRED** | Follow shared principle | Tangent glyph | Both targets |

Any support geometry introduced solely to explain a relation must remain presentation
only. It must not become a Drawing entity, solver authority, exported geometry, or
History state.

## C. Planned drawing tools

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

## D. Future geometric constraints

| Constraint | Status | Intended scope without locking the solver contract |
| --- | --- | --- |
| Radius / Diameter | **DESIGN REQUIRED** | Constrain and annotate applicable curve size. |
| Symmetry | **DESIGN REQUIRED** | Relate two objects about a symmetry axis. |
| Fix | **DESIGN REQUIRED** | Fix applicable geometry through explicit semantic authority. |
| Concentricity | **DESIGN REQUIRED** | Relate applicable curve centers. |
| Tangency | **DESIGN REQUIRED** | Express tangent continuity between applicable geometry. |

Each future constraint should pass through the common sequence:

```text
geometric semantics
  -> solver / topology where applicable
  -> presentation derivation
  -> transient and persistent presentation
```

The exact equations, degrees of freedom, failure behavior, and interaction contracts
require design before implementation.

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
