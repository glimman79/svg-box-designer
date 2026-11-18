# Stage C PR 1 — Project-state capture boundary

**PR 2 follow-up:** [Shared project owner](SHARED_PROJECT_OWNER.md) now uses this inventory
and `ProjectStateSource` contract in production on the task branch. Ownership statements
below describe the PR 1 baseline. The pure capture/projection helpers remain explicit
boundary utilities; they are not called on the production edit hot path.


**Scope: capture foundation only; awaiting review/acceptance.** Stage C shared ownership,
global Undo/Redo, permanent operations, native persistence and dependencies are not
implemented by this change. Existing owners, setters, 100-entry Drawing history,
10-entry BOX history and the PR #635 shared History region are unchanged.

Starting baseline: remote `main` at `3ed65e8816ede0c59361aaaa02a56b32636a8e27`, verified
using `git ls-remote origin refs/heads/main` on 2026-11-17 at approximately 15:00 CET.
The clean task branch started at that exact commit. This document refines only the
small capture seam proposed in [Stage B §§3/7](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md).
[Project Master](../PROJECT_MASTER.md), [Roadmap](../ROADMAP.md#4-connected-product-development),
[multi-Sketch target](MULTI_SKETCH_UNFOLD_BOX_ARCHITECTURE.md) and
[workspace specification](GLOBAL_WORKSPACE_UI_SPECIFICATION.md) retain their authority.

## API and current ownership

[projectState.ts](../src/app/projectState.ts) exports explicit owner-facing input types,
deep read-only captured types and pure functions:

| Capture | Detached projection back to existing model types |
| --- | --- |
| `captureDrawingState(DrawingDocumentV2)` | `projectDrawingState(DrawingStateCapture)` |
| `captureBoxState(BoxStateSource)` | `projectBoxState(BoxStateCapture)` |
| `captureProjectState(ProjectStateSource)` | `projectProjectState(ProjectStateCapture)` |

`ProjectStateSource` contains `drawingDocument` and `box`. BOX input uses the existing
App field names, including its already-built `generatedGeometrySnapshot`. BOX capture
groups authoritative data in `box.data` and required authoring context in `box.context`;
projection returns the same flat owner-facing BOX fields. Drawing remains the complete
`DrawingDocumentV2`, including its existing `activeSketchId`, without a V3 or flattened
geometry collection. No persistent project ID, operation records or disk schema are invented.

There are **no production callers**. A future adapter must supply a coherent set of
values from the current owner and publish restored values under a separately designed
lifecycle/transaction boundary. These functions neither read React state nor invoke
setters. They do not claim that applying a list of React setters would be atomic.

At this baseline, `App` owns Drawing's document and BOX data; both workspace shells
remain mounted across ordinary navigation. Drawing owns its local history/interactions.
The older Stage B unmount observations are historical, superseded by UI-1. BOX remains
inline in `App`. `SharedHistoryRegion` is presentation only and gains no owner or entries.

## State inventory

Classification: **A** authoritative editable project data/accepted output; **B** required
restoration context; **C** transient runtime/UI/session state; **D** safely derived data.
Some original import data is retained conservatively even where a subset is computable.

| Existing state | Class | Boundary treatment / reason |
| --- | --- | --- |
| `drawingDocument.schemaVersion`, `unit`, `sketches`, `sketchOrder` | A | Complete document; all Sketch IDs, names, order and records retained. |
| Per-Sketch `points`, `entities`, `entityOrder` | A | Exact stored coordinates and local IDs/references, including solved coordinates, retained. Equal coordinates never merge identities. |
| Per-Sketch `dimensions`, `dimensionOrder`, `geometricConstraints`, `geometricConstraintOrder` | A | Full records, roles, values, placements and reference variants retained. |
| Canonical Circle center/radius; Arc center/radius/P1/P2/orientation | A | Existing records copied without transformation, quantization or new geometric authority. |
| `drawingDocument.activeSketchId` | B, currently embedded in document | Preserved verbatim for current authoring parity; future explicit Sketch editing/visibility may separate this deliberately. |
| `svgModel.content`, `innerMarkup`, `rootAttributes`, `viewBox`, `width`, `height`, `edges`, `panels`, optional `importDiagnostics` | A, conservatively whole source record | Missing from BOX `HistoryState`. Preserve original markup plus parsed source IDs, edge source references, contour aliases/order, holes, parent-panel relationships, bounds and diagnostic topology; do not reparse SVG. Parsed records already participate in downstream identity. |
| `connections`, `edgeAssignments` | A | All connection variants/properties, TB/W edge roles, S slot arrays, simultaneous bucket members and local references retained. No bucket conversion or label reconstruction. |
| `panelManager` | A | Panel IDs/thickness, default thickness and `isApplied`/`isDirty` affect authoring eligibility and pending Apply; retain all. |
| `activeTBGroup`, `completedTBGroups`, `activeWallGroup`, `completedWallGroups`, `activeSGroup`, `workflowGroupOrder` | A/B | Resumable group definitions, connection membership, active flags and order preserved, even if a trailing empty connection/group exists. No new completed-S field: current completed S groups are derived from connections/order. |
| `projectSettings` | A | Kerf, profile offset, slot/tap clearance and `selectedProfileOffsetIds` retained; the last field selects manufacturing targets, not incidental canvas selection. |
| `lastAppliedManufacturingSettings` | A | Exact settings stamp or null preserved, separately from current settings. Do not silently Apply pending settings. |
| `generatedGeometryItems` + `generatedGeometryCompositionModel`, exposed through the existing memoized `generatedGeometrySnapshot` | A | Complete stored snapshot, including operations, metadata, paths, profiles, taps, source relationships, manufacturing semantics and composition marker, retained. Capture does not call the snapshot factory or create a timestamp. |
| `assignmentTargetConnectionId`, `displayConnectionId`, `selectedEdgeId` | B | Separate BOX context, preserved without null fallback or validity filtering; the assignment target affects the next editing action. Display/edge context retained for existing history parity. |
| `selectedLabelId` | D | Current App alias of `displayConnectionId`; no duplicate capture field. Historical optional history alias is not a second live authority. |
| FinalGeometry, manufacturing contours/compensated preview, selectable profile paths | D | Derived from matching source, stored generated snapshot and current manufacturing settings. Boundary does not build them. |
| Label counts/aliases, workflow History items, Panel Manager containment tree, selected connection/edge lookup, validation/pending/lock booleans | D | Rebuild from captured records; do not replace their underlying authority. |
| Drawing resolved geometry/Circular Support, intrinsic equation functions, rank/DOF, glyph/layout and bounds caches | D | Safe presentation/analysis rebuild does not mean re-solving or moving stored coordinates. Runtime residual functions are not persistent Constraints. |
| `activeWorkspace`, BOX `activeTool`, Drawing tool lifecycle, viewBoxes/zoom/pan, viewport size | C | UI/session state, outside capture. Navigation is not editable content or a future Undo action. |
| `activePanelId`, `activeHoleId`, `expandedSGroups`, `expandedTBGroups`, modal/dialog flags, profile-target selection mode/hover, error messages | C | Incidental selection/presentation, not manufacturing targets. Future UI adapters may derive/reopen the appropriate editor; no UI is restored here. |
| Drawing selection, dimension/constraint editors, text drafts, inference/snap/cursor, drag candidates, box selection, Constraints-panel UI | C | Unaccepted interaction state excluded; only accepted document values are captured. |
| React/DOM refs, download anchor, pointer suppression/capture, resize observers, handlers, timers, async import/jobs and debug captures | C | Runtime lifecycle remains outside plain project data. |
| Existing Drawing/BOX Undo and Redo stacks/controllers, shell scroll and saved icon-size preference | C | Session execution/presentation, not editable project content. No history stack is captured, replaced or connected. |
| Build-time requested panel composition authority mode/contributor registry | Runtime policy | Not project-authored state. Stored selected composition marker and output are captured; capture/restore never select authority again. Future Apply still uses existing environment policy. |

Current material support is thickness in Panel Manager and the material-thickness
properties of existing C/P connection definitions; the complete connection union is
retained. There is no current general material catalog/identity to capture. Source SVG
markup remains intact. Do not confuse future Unfold/material metadata requirements with
already-supported project fields.

The existing manufacturing preview uses **current** `projectSettings` with stored applied
geometry. `lastAppliedManufacturingSettings` is the existing Apply/pending stamp, not an
alternate authoritative preview settings source. This boundary preserves that behavior.

## Immutability, cost and exact restoration

At explicit capture, `structuredClone` detaches each module's existing plain data graph
once, then recursive freezing protects nested records/arrays. Module roots are wrapped
without a second project-wide clone. Projection makes an independent editable copy;
mutating a live source or one projection cannot change a capture or another projection.
Existing IDs and reference relationships survive. JavaScript object references across
the live/captured boundary intentionally differ; aliases *within* each module graph
(such as `contour`/`outerContour`) survive cloning.

The copies are justified by current mutable document maps, order arrays, BOX records and
nested generated/source geometry. TypeScript read-only leaves alone do not guarantee
that the live graph is immutable. Both capture and projection are O(size of supplied
data); they are opt-in and unused in production, not pointer-move work. Future runtime
history must establish immutable publication/structural sharing and measure memory/time
before retaining 30 large frames. This is not a claim of a scalable history store.

No solver, generator, composition selection, reconciliation, parser, normalizer or snapshot
factory is called. No timestamps/IDs/revisions are minted. Snapshot metadata and operations
are copied exactly, including an absent legacy composition marker. A future App adapter
can read `snapshot.generatedGeometry` and `snapshot.metadata.panelCompositionModel`;
the existing missing-marker meaning remains `legacy`. Projection itself does not insert
that default or discard metadata/operations. Existing snapshot operations are geometry
pipeline data, not new permanent construction-history records.

The functions accept already-supported, coherent in-memory domain values. They are not
an untrusted-file validation/migration boundary. Optional import diagnostics and every
supported domain field survive; there is no normalization that filters valid records.
Only declared BOX/project inputs are selected; unrelated UI handles passed beside them
are not accidentally captured. A field added to the domain models or App's independent
state must be reviewed against this inventory and tests.

## Limits and future ownership decisions

- No runtime restore barrier, timer cancellation, pointer release, async resumption or
  stale-result guard. A capture during a gesture represents accepted data only, not its
  temporary candidate. An unfinished SVG import is not a restorable action.
- No production restore adapter. In particular, App's automatic TB/S sizing effect and
  memoized snapshot factory may change values/timestamps when a future owner publishes
  restored data. Global restoration must address those effects before cutover; pure
  data equivalence does not establish React runtime restoration equivalence.
- No native envelope, serialization, compatibility validator, global identity registry,
  permanent operation catalog, dependencies, evaluator or scheduler. Qualified module /
  Sketch / entity references and lifetime-safe identities are future work. Existing
  labels, positional SVG import IDs and workflow ordering are not promoted into durable
  cross-module identity.
- Multi-Sketch maps/order remain intact. New Sketch, Finish Sketch, multiple visible
  Sketches and one active editor remain future workflows; one permanent operation per
  Sketch must reference its geometry rather than duplicate it.
- **Approved future Finish Sketch behavior:** local edits/solver update normally while
  editing; Finish accepts the session and updates only affected downstream operations in
  dependency order. Valid Sketch edits survive downstream failures; failed operations
  remain identifiable and stale/invalid manufacturing output cannot be current/valid.
  All automatic consequences retain their originating logical Undo action. This PR
  neither evaluates changes nor stores a second editable Sketch copy, last-completed
  dependency version or transaction/scheduling policy. Future completion-input ownership
  can be added outside the current document without changing this lossless boundary.
- BOX authoring context versus optional disk preferences, Sketch editing-context ownership,
  future material/provenance fields and cross-module mappings remain explicit design work.
  Active module is excluded; a future history orchestrator opens the affected edit's module.

## Focused validation

`npm run test:project-state` type-checks real typed fixtures plus read-only API assertions,
then runs the Node boundary tests. They cover empty/populated states, separate Sketches,
all current BOX authority/context inputs, canonical Circle/Arc orientation and references,
exact draft/applied separation, all existing composition markers, nested mutation isolation,
frozen captures and independent projections. A compiled-boundary test forbids runtime
imports/clocks/services while exercising every helper. Real TB/S mixed composition and
native W geometry are prepared **before** capture; FinalGeometry and manufacturing are
built separately in the tests to compare original versus projected inputs.

No browser verification is claimed: production code has no callers of this boundary,
and no UI, handlers, owners or algorithms are changed. Existing relevant regression
commands and their actual results are recorded in the PR delivery report.
