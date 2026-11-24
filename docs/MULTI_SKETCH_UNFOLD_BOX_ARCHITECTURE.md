# Laser Program – Multi-Sketch, 3D/Unfold & BOX Architecture Documentation

## Current implementation checkpoint — 2026-11-24

**Implemented and automatically tested. Pending user browser acceptance.** PR #646 merged the shared grid and explicit editing lifetime. PR 3 adds stable neutral colors for Sketches, grey reference geometry while editing and direct reopening from History or neutral geometry. Overlap requires an explicit choice. The active Sketch alone supplies Dimensions, Constraints and authoring input.

**Planned / not implemented.** Native Save/Open, permanent BOX operations, full dependency evaluation, curved Drawing panel transfer and Unfold. The following dated baseline and target sections record the original decisions. [Sketch integration](SKETCH_OPERATION_FOUNDATION.md#history-and-visualization)

## Drawing panel sources

Stage C.2 PR 4 connects the existing multi-shape Sketch to BOX. Rectangles and simple closed Line polygons use solved SketchPoints and semantic endpoint membership. BOX checks closure, branching, intersections and nonzero area before using the existing panel and hole containment pipeline. Independent loops can produce separate panels in the same Sketch. Open geometry, Circles and mixed Line/Arc boundaries remain visible references. Panel Manager reports excluded members.

The permanent operation ID identifies the source, the sorted outer Line IDs identify a contour, and each BOX edge identifies its owning contour and Drawing Line. Panel Manager approval binds positive per-panel thicknesses to that source’s current geometry revision. Adding a Line, moving a point, changing a curve or deleting geometry makes the Sketch light grey. Existing thicknesses survive for recognized panels and new panels start at zero. Other approved Sketches retain their constructions and applied output.

BOX displays the sources together. TB, W, S, Apply and export run on one working source at a time. The imported SVG retains its independent assignments, groups and settings when a Sketch is inspected or selected. Foreign TB/W edge assignments are rejected before publication. Reapproval preserves authored records. Missing assigned edges block approval until the geometry is restored. Previously generated output requires an explicit Geometry Apply after review. Multi-source manufacturing export and automatic dependency repair remain future work.

**Decision date: 2026-11-17. APPROVED TARGET — NOT IMPLEMENTED.**

## 1. Authority, classification and verified baseline

This specification owns the detailed future multi-Sketch, 3D/Unfold/2D/BOX and selective
Sketch-group export requirements, as a scoped extension of
[Product Architecture Vision](PRODUCT_ARCHITECTURE_VISION.md). It supersedes that
vision's earlier direct 3D-to-Drawing flattening and primitive-level top-level history
direction. [PROJECT_MASTER.md](../PROJECT_MASTER.md) owns current architecture;
[ROADMAP.md](../ROADMAP.md#4-connected-product-development) owns stage statuses;
[workspace UI](GLOBAL_WORKSPACE_UI_SPECIFICATION.md) owns placement. Historical evidence
remains historical evidence. No application implementation is authorized by this document. The user authorized this
documentation-only task and its branch/commit/push/PR scope; merge is not authorized.

| Classification | Meaning here |
| --- | --- |
| **APPROVED TARGET** | Agreed functional behavior; implementation status is separate. |
| **PROPOSED DESIGN** | Recommendation awaiting architectural approval. |
| **OPEN QUESTION** | A future decision is required; no mechanism is selected. |
| **IMPLEMENTED** | Supported by inspected code and existing validation; acceptance limits remain recorded. |
| **NOT IMPLEMENTED** | Planned behavior only. Applied to the new capabilities in §§2–7 at the November 17 checkpoint. |

Baseline: GitHub `main` at `99550ece086ab5c88d6380d594288a7af62f74aa`, fetched and
verified with `git ls-remote --heads origin main` on 2026-11-17. PR #635 is merged and
its merge commit is this baseline. The task branch started at that exact commit with
a clean worktree. Read-only source review establishes these boundaries; no new browser
acceptance or application test result is claimed:

| Area | IMPLEMENTED foundation and evidence | NOT IMPLEMENTED boundary |
| --- | --- | --- |
| Drawing | [drawingTypes.ts](../src/app/drawingTypes.ts) has Sketch maps/order, `activeSketchId`, per-Sketch geometry, points, Dimensions and Constraints. The empty document already contains `sketch-1`. [DrawingWorkspace](../src/app/DrawingWorkspace.tsx) resolves/render entities from the active Sketch, allowing immediate drawing. | These types alone do not implement New Sketch, Finish Sketch, multiple visible independent Sketches or explicit editing-context ownership. |
| History | [SharedHistoryRegion](../src/app/SharedHistoryRegion.tsx) and [UI-3 validation](UI3_UNIFIED_CONSTRUCTION_HISTORY_VALIDATION.md) establish one shared presentation region, BOX workflow navigation and a Drawing availability message. [drawingHistory](../src/app/drawingHistory.ts) has 100-entry local snapshots; Construction has its separate 10-entry owner in [App](../src/App.tsx). | No permanent operation engine or global Undo tape. The opaque presentation type has no production operations. UI-3 user acceptance remains pending. |
| BOX | [App](../src/App.tsx) imports SVG, recognizes panels and retains TB/W/S navigation. [Panel Manager](../src/app/panelManagerModel.ts) stores panel ID/thickness. Applied export uses manufacturing contours; before Apply, export is source/label output. | No visible multi-Sketch canvas input contract or Sketch-group export selector. Existing panel metadata is not a complete cross-module material/provenance schema. |
| Persistence/export | [WorkspaceTopBar](../src/app/WorkspaceTopBar.tsx) disables native Open/Save; [exportFinalGeometrySvg](../src/app/exportFinalGeometrySvg.ts) serializes contours. Existing native-data normalization and applied snapshots remain foundations. | Native project round-trip and full metadata continuity are unavailable; contour SVG serialization does not establish them. |
| Modules | Drawing and BOX are available; Puzzle is disabled. | 3D Modeling and Unfold have no implemented module. |

## 2. Independent Sketches and editing context

**Implemented and tested in C.2 PR 2, pending user browser acceptance.** A project supports multiple independent Sketches
on the same 2D canvas. Each retains stable identity and its own geometry, Dimensions and
Constraints. `New Sketch` creates a new empty Sketch, keeps existing Sketches on the
canvas and previously visible Sketches visible by default, and makes only the new Sketch
editable. Other visible Sketches remain non-editable visual references. Visibility is
distinct from editability and from manufacturing eligibility.

`Finish Sketch` exits the active Sketch editing context. Users can reopen an existing
Sketch for editing without creating a replacement Sketch or another history operation.
The November 17 open questions about control placement, interruption and in-memory admission are resolved in PR 2. Cross-Sketch snapping, persistent relationships and visibility controls remain future design work. Existing V2 records retain their references, dimensions, constraints and canonical Circle/Arc data when admitted in neutral mode. [Editing contract](SKETCH_OPERATION_FOUNDATION.md#editing-context)

## 3. One permanent history operation per Sketch

C.2 PR 1 implements one stable operation per Sketch in the project. A visible entry per Sketch in the shared permanent construction timeline is still an approved target. A Sketch containing many Lines,
Circles, Arcs, Dimensions and Constraints normally remains one operation. These editable
semantic records belong inside the Sketch; they do not automatically create separate
top-level construction entries. Profile's per-segment accepted transactions remain intact
without requiring a permanent entry per segment. [Sketch operation contract](SKETCH_OPERATION_FOUNDATION.md)

Double-clicking the Sketch entry opens that existing Sketch's current definition for
editing. Edits update the same identity/entry, never append a replacement Sketch. Navigation
does not rewind state, move an Undo cursor or discard Redo. An accepted edit retains its
normal Undo boundary; future global Undo includes all automatic consequences in the same
logical action. Construction history and today's module-local Undo/Redo remain separate.
Permanent operations survive Undo eviction and must persist in the future native project.

Source changes reevaluate affected dependencies. Approved Option A retains valid source
edits, compatible results, failed/blocked definitions and diagnostics, and unaffected
authored work. Invalid results must remain diagnosable and must not silently become valid
output. Exact bindings, evaluation units and repair adapters require design.

The earlier Stage B Line 30→50→70 example still illustrates editing a stable definition
and recording separate Undo actions. Under this target, that Line is a member of the
existing Sketch operation; it does not require its own top-level timeline entry. The
earlier primitive/Dimension/Constraint operation catalog is superseded for Sketch contents.
BOX PM/TB/W/S/MFG workflow navigation is not permanent operation history and is not
converted by relabeling. PR #635 supplies presentation only; the engine remains absent.

## 4. Two supported paths, 3D Modeling and Unfold

**APPROVED TARGET — NOT IMPLEMENTED:**

```text
Direct:      2D Drawing ───────────────────────────→ BOX / Construction
3D-derived:  3D Modeling → Unfold → 2D Drawing ────→ BOX / Construction
```

3D and Unfold are optional for projects authored directly in 2D. Both paths use compatible
2D geometry and panel semantics; the 3D-derived path also carries source provenance and
panel metadata. Puzzle remains an optional parallel destination from Drawing under its
existing roadmap; it is neither removed nor made dependent on BOX.

Future 3D Modeling supports multiple Sketches on XY, XZ, YZ, user-defined construction
planes, arbitrarily oriented planes and suitable existing panel faces. Valid closed
profiles can be extruded into panels or solids. Sketches, planes, generated geometry and
downstream operations require stable references. Panels carry thickness and material.
No kernel, topology representation, renderer or general-purpose 3D implementation is
selected. Existing simple-extrusion scope and separately deferred Construction preview
remain; the earlier open-profile surface/thickening intent still requires design.

Unfold is a distinct planned module between 3D Modeling and Drawing. It transforms
suitable 3D panel geometry into flat 2D panel representations retaining identity and
manufacturing meaning. It is not merely projection, exploded visualization or disconnected
SVG lines. Exploded View remains a separate planned 3D assembly presentation. Earlier
"Flatten to 2D" intent is refined by this Unfold boundary; eligibility, developability,
curved-surface support and numerical validation remain **OPEN QUESTIONS**.

### Metadata continuity

**APPROVED TARGET:** metadata survives **3D → Unfold → 2D → BOX → manufacturing/export
where applicable**. Displaying or editing flat panels must not discard thickness or
material. Intended information includes the following, subject to exact schema design:

| Information to retain | Purpose |
| --- | --- |
| Stable panel identifier | Track the same panel through module boundaries. |
| Thickness and material identity/properties | Preserve physical manufacturing intent. |
| Originating 3D panel/feature reference | Maintain upstream provenance. |
| Orientation, front/back and relevant directions | Avoid ambiguous manufacturing interpretation. |
| Source Sketch/feature references where appropriate | Resolve dependencies and source editing. |
| Update/validity state | Distinguish current validated output from stale/invalid results. |

This is approved functional intent, not a finalized metadata record, identifier format
or serialization schema. Future validation must check metadata consistency, source
identity, regeneration/update behavior and manufacturing correctness across every seam.
Export formats must retain relevant information where applicable; exact encoding and
formats remain open. Existing SVG output does not establish this guarantee.

**OPEN QUESTION:** whether direct edits to unfolded 2D panels propagate back to 3D, remain
downstream overrides, or use another explicitly approved policy. No reverse synchronization,
override ownership or conflict rule is silently selected.

## 5. BOX input: recognize relevant visible canvas geometry

**APPROVED TARGET — NOT IMPLEMENTED:** BOX recognizes relevant geometry currently
displayed on the canvas. A mandatory manual source-Sketch selector is not the default
input workflow. The selection used at export (§6) does not change this input requirement.

| Concept | Required distinction |
| --- | --- |
| Visible Sketches/geometry | Display context, including non-editable references; visibility alone does not establish a manufacturing contour. |
| Eligible BOX input | Relevant supported geometry under future inclusion and contour rules. |
| Construction/reference geometry | Guides, annotations and reference-only geometry must not become manufacturing contours. |
| Validated manufacturing geometry | Pipeline output meeting panel, reconciliation, compensation and validity contracts. |
| Sketch/group identity and provenance | Trace where geometry came from without substituting display labels for identity. |

**OPEN QUESTIONS:** inclusion rules, overlaps/duplicates, contour eligibility, hidden or
partially visible geometry, synchronization of visibility, updates/removals, source-set
dependency membership and cross-Sketch contours. Do not infer that everything visible is
processable or every visible graphical element is a panel. Existing SVG import, panel
recognition, workflow navigation and export remain unchanged until implementation is
separately authorized and validated.

Transfers enter the existing source → Panel Manager → construction semantics → generated
geometry → panel composition → metadata reconciliation → FinalGeometry → manufacturing
compensation → preview/export pipeline. Stable source refs, mixed contributor authority,
stored resolved snapshots, clearance then kerf, and accepted export correctness remain
authoritative. Cross-module metadata must extend this boundary without bypassing it.

## 6. BOX export: select one or multiple Sketch groups

**APPROVED TARGET — NOT IMPLEMENTED:** BOX provides an export-selection interface for
eligible Sketch groups. Users can select one group or multiple groups; they are not
forced to export every visible group. The requested export scope must be explicit and
understandable. Only the selected eligible groups enter the requested output; unrelated
or unselected groups must not be silently included.

Export preserves correct manufacturing geometry and relevant metadata. Invalid, stale
or unvalidated manufacturing results must not silently export as valid output. Validate
the selected scope and necessary manufacturing dependencies, preserving compensation,
kerf, panel reconciliation and FinalGeometry correctness. Selecting a group does not
validate it. An invalid requested scope requires a diagnosable outcome, not silent
exclusion or substitution of stale output. Exact mixed-validity UX remains open.

Input recognition concerns relevant visible canvas geometry; export selection concerns
the desired subset of eligible Sketch groups. Neither single nor multiple export
selection introduces a mandatory single-Sketch BOX input source.

### Identity boundaries requiring definition

**OPEN QUESTION:** define the relationships between Sketch identity, Sketch group,
Unfold-generated panel, BOX panel, BOX workflow group and manufacturing output group.
These are not assumed interchangeable or one-to-one. In particular, a Sketch group is
not an existing TB/W/S workflow group. Multiple Sketches/panels and shared construction
dependencies require an explicit mapping and scope-validation contract.

Grouping algorithms, export file structure, filenames and single/multiple-file packaging
remain undecided. No UI layout, default selection or packaging behavior is prescribed.

## 7. Planning, conflicts and review gates

**PROPOSED DESIGN:** extend B's contracts together for Sketch ownership/identity,
geometry transfer, panel metadata, permanent operations, persistence and dependency
propagation before freezing C/C.2 adapters or D schemas. Deliver Drawing-first support
without waiting for 3D; later 3D/Unfold must use compatible contracts. This is dependency
guidance, not an approved implementation plan or schedule.

Existing connected-product A–G labels, meanings and statuses stay unchanged. F previously
combined extrusion and flattening intent; a distinct Unfold module creates a planning
gap. **PROPOSED DESIGN:** review a separately scoped Unfold delivery slice alongside F
and E integration, with metadata contracts settled before D format freeze. No new letter
or F renumbering is approved. UI-4 needs real Sketch operations; UI-3 is not that engine.

The superseded assumptions are direct 3D→Drawing flattening without a distinct module,
primitive-level top-level history, and any suggestion that export scope is wholly
unapproved: one/multiple Sketch-group selection is now approved, while grouping and
validation mechanics remain open. Historical documents retain their original evidence
with explicit supersession notices. No accepted CAD stage or invariant conflicts with
this documentation-only direction.

Future implementation review must demonstrate: multiple visible Sketches with one editable
context; Finish/reopen preserving identities and one entry per Sketch; compatible legacy
geometry/constraints/dimensions/Undo; both workflow paths; visible-input filtering without
a mandatory source selector; metadata continuity and update diagnostics; one/multiple
group exports excluding unselected output with valid compensation; and native identity/
operation persistence. These are future acceptance criteria, not tests run in this task.

**OPEN QUESTIONS register:** editing-context/UI and cross-Sketch references; compatibility
and migration; operation bindings and dependency granularity; 3D kernel/planes/attachment
and extrusion details; Unfold eligibility/developability; exact metadata schema/validation;
2D edits versus upstream 3D; canvas inclusion/overlap/visibility/update rules; all six group/
panel identity mappings; export grouping, dependency closure, invalid-scope UX, formats/
encoding/packaging; native schema/restore and responsive scheduling; and Unfold roadmap
placement. These require future specification rather than inferred implementation.
