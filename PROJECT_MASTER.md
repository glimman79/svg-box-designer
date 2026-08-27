# SVG Box Designer — Project Master

## 1. Document Authority and Reading Guide

### 1.1 Purpose and authority

This document is the durable source of truth for the **current** product definition, accepted behavior, architecture rules, plans, unresolved decisions, development governance, and next work for SVG Box Designer.

`PROJECT_HISTORY.md` explains how important decisions and regressions led here; it does not override this document. If the two conflict, this document governs current project truth. `CHANGELOG.md` remains authoritative for release notes. Detailed B3.x reports are historical or technical evidence, not automatic current product truth.

### 1.2 Status vocabulary

- **[IMPLEMENTED]** — present in production at the locked baseline.
- **[ACCEPTED / LOCKED]** — accepted behavior that must not regress without an explicitly approved product change.
- **[PLANNED]** — approved direction, not currently implemented.
- **[CONCEPT / NOT YET DECIDED]** — hypothesis or design question that still needs a decision or proof.
- **[KNOWN DEBT]** — current limitation, inconsistency, or cleanup obligation.
- **[HISTORICAL]** — context, not current authority.

Multiple labels may apply. Plans and concepts must never be described as implemented. Observed repository facts must be distinguished from hypotheses.

## 2. Project Identity

- **Product:** SVG Box Designer
- **Purpose:** A shared geometry project for parametric 2D drawing, puzzle creation, and panel-based box/construction design with manufacturing output.
- **Technology at v1.2:** React, TypeScript, Vite, and SVG-based geometry.
- **Top-level modules:** 2D Drawing; Puzzle; Box / Construction.
- **Manufacturing:** Part of Box / Construction for now, not a fourth top-level module.

The modules are intended to operate over the same project/document where appropriate rather than become unrelated applications.

## 3. Locked Baseline

### 3.1 Release identity

- **Current accepted release:** v1.2 — TB + Wall Stabilization
- **Semantic version:** `1.2.0`
- **Locked commit:** `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2`
- **Official release tag:** `v1.2.0`
- **Local checkout tag verification:** unavailable in the PM.1 checkout.
- **Acceptance:** B3.23 concluded that Wall was stable enough to leave stabilization.

The unavailable local tag ref does not negate the official release tag and is not permission to create or move a tag.

### 3.2 Compatibility boundary

**[IMPLEMENTED][ACCEPTED / LOCKED]** v1.2 is the accepted Box / Construction baseline. Stable rectangular TB/W behavior, ownership, composition, reconciliation, FinalGeometry, manufacturing, and restore semantics must remain backward compatible unless a later approved product revision intentionally supersedes them.

## 4. Product Organization

1. **2D Drawing — [PLANNED]** Parametric, constraint-oriented drawing.
2. **Puzzle — [PLANNED]** Standard or shared custom boundaries, frames, piece generation, and unique mating geometry.
3. **Box / Construction — [IMPLEMENTED in part]** The mature current module containing TB, W, S, future J/P, manufacturing, and future static 3D Preview.

Module switching should preserve the same project and referenced entity identities where workflows cross module boundaries. In particular, Drawing → Puzzle must not require manual export/import.

## 5. Shared Project and Geometry Model

### 5.1 Current model

**[IMPLEMENTED]** `SvgDocumentModel` is the useful current imported/resolved SVG geometry model. It preserves SVG root information, detected edges, panels, outer and inner contours, containment, dimensions, and import diagnostics. Panel Manager adds authoritative per-panel thickness for current construction workflows.

`SvgDocumentModel` is not a parametric sketch model and is not a complete multi-module project document. It should be retained beneath, not rewritten merely to create, the future project aggregate.

### 5.2 Versioned ProjectDocument

**[PLANNED]** Introduce a versioned `ProjectDocument` around existing models. It may own or reference:

- canonical/source geometry;
- sketches, constraints, and dimensions;
- panel and construction entities;
- assembly relationships;
- puzzle definitions;
- tool operations and connections;
- generated/derived artifacts;
- manufacturing settings;
- workspace/UI state;
- schema, identity, dependency, and revision metadata.

Canonical data and derived artifacts must be explicit. Stable entity IDs and geometry revisions must allow one module to reference another module's geometry, detect invalidation, and preserve round trips.

### 5.3 Shared-boundary rule

Drawing owns parametric sketch intent. A solver resolves canonical geometry; closed-region extraction produces reusable boundaries. Puzzle and Box / Construction should reference those authoritative entities where appropriate rather than keep unrelated path copies.

## 6. 2D Drawing

### 6.1 Product definition

**[PLANNED]** Drawing is inspired by CATIA V5 Sketcher working principles but is not intended to reproduce every CATIA tool. The initial selected tool set is limited to:

- Profile;
- selected Spline construction methods;
- Ellipse;
- Line;
- Axis / construction geometry;
- Corner / fillet;
- Mirror;
- Quick Trim;
- selected Rectangle construction variants;
- selected Circle construction variants;
- Constraint.

Do not add other CATIA tools as accepted requirements without a product decision.

### 6.2 Tool families

Rectangle is a tool family: different creation methods should resolve to common primitives and constraints where possible, not unrelated permanent geometry models. Circle may follow the same principle. Final UI variants remain subject to product design.

### 6.3 Constraints and geometry authority

**[PLANNED]** Constraint is central. Constraints/dimensions should ultimately represent dimensions, lengths, distances, angles, radius/diameter, anchors/fixed geometry, coincidence, and persistent geometric relationships, including persistent snap relationships where appropriate. Visible constraint/dimension feedback is desirable.

The architectural direction is:

```text
sketch primitives + constraints + dimensions
                    ↓
                  solver
                    ↓
          resolved canonical geometry
                    ↓
          closed-region extraction
```

The solver, constraint layer, and parametric sketch model do **not** exist at v1.2. Constraints should be a solver-backed layer that resolves canonical coordinates, not transient annotations lost after destructively rewriting an opaque SVG path.

## 7. Puzzle

### 7.1 Initial module scope

**[PLANNED]** Puzzle is a separate main module. Initial standard boundary creation includes rectangle, hexagon, and circle/round shapes with user-defined dimensions. User controls should include frame on/off, frame thickness, number of pieces, and tab/socket size.

### 7.2 Shared custom boundary

**[PLANNED]** A validated custom closed shape created in 2D Drawing must be directly usable as the Puzzle boundary without export/import. Puzzle should reference the same authoritative boundary and retain its own settings and generated topology. Later source edits should mark dependent Puzzle output dirty or invalid rather than silently preserve stale geometry.

### 7.3 Unique mating geometry

**[PLANNED]** Puzzle pieces should not accidentally fit in unrelated positions. Every internal adjacency needs a complementary mating pair with a sufficiently unique physical signature. Validation must consider:

- complementary male/female geometry;
- traversal reversal;
- allowed piece rotation;
- physical equivalence rather than IDs alone.

Unique signatures belong to Puzzle internal adjacency relationships, not global settings or display paths.

**[CONCEPT / NOT YET DECIDED]** Exact subdivision, piece-count feasibility, frame offset policy, signature construction, and uniqueness algorithms are not finalized. No specific algorithm is locked.

## 8. Box / Construction

### 8.1 Current maturity and tool-family rule

Box / Construction is the most mature module. TB and W must remain tool families, not duplicated permanent engines called “TB Multi” or “W Multi.” Preferred direction:

```text
TB
  current rectangular variant
  future non-rectangular/angle-aware variant

W
  current rectangular variant
  future non-rectangular/angle-aware variant
```

**[CONCEPT / NOT YET DECIDED]** Final names and UI presentation for future variants are not decided. The current rectangular variants remain backward compatible.

### 8.2 TB

**[IMPLEMENTED][ACCEPTED / LOCKED]** TB provides the stable rectangular workflow:

- a complete connection has paired A/B edge roles on mating panels;
- Tab/finger width belongs to each connection, so different widths can coexist;
- automatic/manual width state is also per connection;
- completed groups remain isolated from later edits;
- Finish removes an unused trailing auto-created connection;
- generated edge-local profiles participate in the generic relationship, contributor, composition, reconciliation, and authority pipeline.

A/B describes a connection role. It must not be silently reinterpreted as an unconditional global panel class.

### 8.3 W

**[IMPLEMENTED][ACCEPTED / LOCKED]** W provides the stable rectangular Wall workflow:

- native W connection and generator identity;
- shared physical finger-joint generation with TB;
- exactly one W-A and one W-B assignment on distinct panels for a complete connection;
- A/B normalization from unambiguous, completed TB panel-role evidence;
- ambiguous or incompatible evidence fails closed;
- when TB evidence does not select an orientation, valid authored orientation is preserved;
- per-connection Tab/finger width and completed-group isolation;
- current rectangular terminal/orientation behavior prevents the accepted mouse-hole failure.

The rectangular mouse-hole behavior must not change while future angle-aware behavior is designed. Sharing a generator or UI control does not make TB/W property values shared.

### 8.4 S

**[IMPLEMENTED]** S is present but incomplete. Current S is planar:

- an S connection pairs A and B roles;
- connection settings include planar slot offset and slot/tab length;
- S-A contributes a replacement boundary/profile on one panel;
- S-B creates repeated inner slot cutouts on the referenced host edge;
- S-B slot placement uses the host contour's inward normal;
- S-B `REFERENCES` retains original imported/source-edge meaning and does not own a replacement boundary.

**[PLANNED] Complementary half-slot intersections:** two intersecting panels should each receive complementary slots from the required directions and depths so they slide together. This needs assembly relationships, intersection placement, panel orientation, entry direction, and complementary feature ownership; it is not current behavior.

**[PLANNED] Partial-height internal walls:** S must eventually support more than planar inward offset. Likely concepts include planar offset, independent elevation/height offset, wall height/extent, panel-local frames, and assembly placement. **[CONCEPT / NOT YET DECIDED]** Exact UI and schema are unresolved.

### 8.5 J

**[PLANNED][CONCEPT / NOT YET DECIDED]** J is a Joint tool family for joining straight panel edges or panels beyond configurations covered by TB. No joint variants or joint library are accepted yet.

### 8.6 P

**[PLANNED][CONCEPT / NOT YET DECIDED]** P is a Pattern tool family inside Box / Construction. One intended use is flexible/living-hinge laser-cut patterns. No pattern library or exact variants are accepted yet.

### 8.7 Non-rectangular construction and assembly angle

**[PLANNED]** Future constructions should support 3-, 5-, 6-, 7-, and higher-sided forms, including house/birdhouse profiles, sloping roofs, and panels meeting away from 90 degrees.

Panel-to-panel assembly angle belongs to an authoritative shared assembly relationship. It must not be independently owned by TB, independently owned by W, inferred from generated paths, or stored as authority in 3D Preview. TB/W should consume the same normalized relationship without depending on each other's generated geometry.

An assembly relationship will need stable panel/edge references, an angle convention, orientation/handedness, alignment/seating semantics, and revision/provenance. These details are **[CONCEPT / NOT YET DECIDED]** until designed.

### 8.8 Main-B / surrounding-A hypothesis

**[CONCEPT / NOT YET DECIDED]** A possible multi-sided topology is:

```text
main/base panel = TB-B
surrounding panels = TB-A
```

This may avoid alternating-role parity problems for 3, 5, 7, and other side counts. It is not accepted architecture. Before adoption, prove:

- representative odd/even, convex, and relevant concave constructions;
- multiple distinct TB-B edge contributions on the main panel;
- adjacent terminal/corner ownership, including B/B cases;
- no same-edge replacement conflicts and order-independent composition;
- successful reconciliation without unsupported split/coalesced mappings;
- physical fit at representative non-90-degree angles;
- invariance under contour reversal and rigid transforms;
- compatible angle-aware W behavior;
- deterministic assembly transforms and valid manufacturing output;
- exact backward equivalence for rectangular-v1 TB/W;
- browser workflow and snapshot-restore compatibility.

## 9. Geometry Architecture

### 9.1 Current pipeline

**[IMPLEMENTED][ACCEPTED / LOCKED]**

```text
SVG import
→ SvgDocumentModel
→ Panel Manager / thickness
→ authored connections + assignments
→ TB/W/S generators
→ GeneratedGeometryItem[]
→ relationship audit
→ contributor adapters
→ panelComposer
→ post-composition reconciliation
→ authority selection / packaging
→ GeneratedGeometrySnapshot
→ FinalGeometry
→ ManufacturingGeometry
→ preview/export
```

### 9.2 Responsibilities

- **Import / SvgDocumentModel:** Preserve imported/resolved geometry, panels, holes, edges, and SVG root data.
- **Panel Manager:** Provide current per-panel thickness authority.
- **Connections and assignments:** Preserve authored intent and per-connection settings.
- **Generators:** Emit immutable native geometry items, profiles, taps, projections, and relationship intent.
- **Relationship audit:** Normalize `REPLACES`, `REFERENCES`, and `CREATES`; identify ownership conflicts.
- **Contributor adapters:** Translate registered tool output into common edge-local panel contributions.
- **panelComposer:** Assemble the authoritative physical panel-boundary candidate from replacement contributions and unchanged source edges.
- **Reconciliation:** Map immutable contributor profile/projection semantics onto composed segments, including explicit nonphysical lineage.
- **Authority selection/packaging:** Install results project-atomically only after applicable ownership, composition, reconciliation, equivalence, and downstream checks pass.
- **GeneratedGeometrySnapshot:** Preserve already-selected generated authority and its composition model for restore.
- **FinalGeometry:** Provide authoritative downstream resolved 2D design contours and diagnostics, independent of tool workflow history.
- **ManufacturingGeometry:** Provide a fresh derived working copy for compensation, preview, and manufacturing export.

### 9.3 Ownership and failure rules

1. Contributors do not destructively mutate one another's original output.
2. `REPLACES` identifies physical source-edge ownership.
3. `REFERENCES` does not imply replacement ownership; S-B addresses the original source edge.
4. Multiple `REPLACES` claimants for one source edge fail closed; there is no tool priority or last-writer winner.
5. Composition owns authoritative physical boundary assembly.
6. Reconciliation, not a contributor-specific repair, maps immutable semantics onto composed geometry.
7. Missing, ambiguous, conflicting, or currently unsupported reconciliation fails closed.
8. Supported mixed TB/W/S composition uses the same generic authority infrastructure.
9. Future physical contributors should reuse this infrastructure rather than create parallel downstream pipelines.

## 10. Manufacturing

**[IMPLEMENTED][ACCEPTED / LOCKED]** Manufacturing remains part of Box / Construction. It consumes FinalGeometry through a derived ManufacturingGeometry working copy. Current processing order is:

1. Profile Offset;
2. Tap Clearance;
3. Slot Clearance;
4. final Kerf.

Kerf is terminal. Current preview and manufacturing export consume the compensated result; design export can serialize immutable FinalGeometry. Manufacturing must not mutate FinalGeometry or infer tool-specific intent when generic geometry metadata can express it.

Future manufacturing growth is not specified here; unapproved nesting, toolpath, machine, or sheet-optimization features are not requirements.

## 11. Static 3D Preview

**[PLANNED]** The initial goal is a static isometric view generated from Box / Construction metadata to show assembled panel placement and orientation for visual verification. It is not initially a full 3D CAD editor.

**3D Preview is DERIVED ONLY.** It must never become an independent source of geometry, placement, or angle truth.

Future authoritative inputs may include panel geometry, thickness, panel-local coordinate frames, assembly relationships and angles, orientation/handedness, alignment, and resolved transforms.

**[KNOWN DEBT / MISSING ARCHITECTURE]** v1.2 lacks a construction assembly entity, local panel frames, authoritative dihedral angles, global/root placement, deterministic 3D transforms, handedness/alignment semantics, and assembly graph validation. These must precede a deterministic preview.

## 12. State, History, and Snapshots

### 12.1 Current behavior

**[IMPLEMENTED][ACCEPTED / LOCKED]** Current Undo/Redo uses bounded in-memory snapshots. State includes project/manufacturing settings, assignments, connections, generated geometry, active/completed workflow groups, ordering, selection state, and Panel Manager state.

Generated geometry snapshots contain already-selected authority output and a composition-model marker. Restore reinstates that stored output verbatim; it does not silently recompose it under current runtime rules. Eligible legacy state migrates only on a fresh Apply.

### 12.2 Future evolution

**[PLANNED]** ProjectDocument transactions/snapshots must add sketches, constraints, puzzle definitions, assembly relationships, module state, schema migrations, and dependency invalidation while preserving the restore-verbatim compatibility principle. Durable project revision history must be distinguished from UI workflow history and the current bounded Undo/Redo stacks.

## 13. Product and Architecture Invariants

| ID | Status | Invariant | Applies to | First locked | Evidence / useful regression reference | Change rule |
|---|---|---|---|---|---|---|
| INV-TB-001 | [ACCEPTED / LOCKED] | Rectangular TB uses paired A/B roles and preserves per-connection finger width; different widths and finished groups remain isolated. | TB rectangular-v1 | v1.2 | `tests/diagnostics/wall-v2-tab-size-per-connection.ts`, `CHANGELOG.md` | Only an approved product revision may supersede it; rectangular compatibility must be explicit. |
| INV-TB-002 | [ACCEPTED / LOCKED] | Finish removes the unused trailing TB connection without changing completed connection intent. | TB workflow | v1.2 | `src/app/tbWorkflow.ts` | Preserve workflow/session compatibility or approve a deliberate UX change. |
| INV-W-001 | [ACCEPTED / LOCKED] | W has native identity but shares TB-equivalent physical finger-joint generation and per-connection settings. | W rectangular-v1 | v1.2 | `src/app/wallGeometry.ts`, Wall equivalence/tab diagnostics | Shared implementation must never imply shared value ownership. |
| INV-W-002 | [ACCEPTED / LOCKED] | W normalizes from unambiguous completed TB role evidence, fails closed on ambiguity, and preserves rectangular mouse-hole prevention. | W rectangular-v1 | v1.2 | Wall authoring/orientation diagnostics | Do not alter while adding future angle-aware variants. |
| INV-OWN-001 | [ACCEPTED / LOCKED] | `REPLACES` is exclusive physical ownership; multiple owners of one source edge fail closed. `REFERENCES` does not replace. | All panel contributors | v1.2 | relationship/authority diagnostics | Change only through a generic, explicitly approved ownership model. |
| INV-COMP-001 | [ACCEPTED / LOCKED] | panelComposer owns contributor-neutral physical boundary assembly; contributors do not edit one another's output. | TB/W/S composition | v1.2 | composer and mixed-authority diagnostics | New contributors adapt to the common contract; no downstream tool-specific patch. |
| INV-REC-001 | [ACCEPTED / LOCKED] | Reconciliation maps immutable semantic lineage onto composed segments; ambiguous or unsupported mappings block authority. | Composed geometry | v1.2 | reconciliation/projection diagnostics | Extend generically with regression proof; never guess silently. |
| INV-AUTH-001 | [ACCEPTED / LOCKED] | Authority selection is project-atomic and fail-closed; failed composition cannot install partial or fallback physical output. | Apply/packaging | v1.2 | authority/downstream diagnostics | Any migration needs atomic failure and restore coverage. |
| INV-FINAL-001 | [ACCEPTED / LOCKED] | FinalGeometry is authoritative downstream 2D design geometry; generator shadows are non-authoritative. | Design downstream pipeline | v1.2 | FinalGeometry diagnostics | Future tools must hand off through an equivalent shared authority contract. |
| INV-MFG-001 | [ACCEPTED / LOCKED] | ManufacturingGeometry is derived, never mutates FinalGeometry, and applies Profile Offset → Tap Clearance → Slot Clearance → Kerf. | Manufacturing | v1.2 | manufacturing tests and `Architecture.md` | Reordering or changing authority requires approved manufacturing behavior. |
| INV-HIST-001 | [ACCEPTED / LOCKED] | Snapshot restore reinstates stored selected geometry/authority without recomposition. | History/Undo/Redo | v1.2 | restore/authority diagnostics | Schema migration must preserve historical meaning. |
| INV-DER-001 | [PLANNED architecture rule] | Derived views, including future 3D Preview, are never geometry authority. | Preview/rendering | governance baseline | This document | Supersession requires an explicit product/architecture decision. |
| INV-DOC-001 | [PLANNED architecture rule] | Intended module transitions preserve shared project/entity identity rather than use manual export/import. | Drawing/Puzzle/Construction | governance baseline | This document | Change only through an explicit product decision. |

## 14. Locked Behavior That Must Not Regress

- TB/W rectangular geometry and accepted terminal behavior.
- Paired A/B authoring and fail-closed W normalization.
- Per-connection TB/W Tab widths; a shared UI is not shared setting ownership.
- Completed-group isolation and trailing-placeholder Finish cleanup.
- Mixed TB/W and supported S composition through registered contributors.
- Exclusive `REPLACES` ownership and original-source S-B `REFERENCES` behavior.
- Contributor-neutral composition and post-composition reconciliation.
- Explicit projection lineage, including supported nonphysical terminal lineage.
- Failure on ambiguous/unsupported reconciliation rather than guessed output.
- Project-atomic authority selection.
- One authoritative composed boundary per approved panel.
- Immutable FinalGeometry and derived ManufacturingGeometry.
- Current manufacturing compensation order and preview/export handoff.
- Snapshot restore without authority reselection/recomposition.

## 15. Product Status Register

| Capability | Status | Current truth / boundary |
|---|---|---|
| 2D Drawing | [PLANNED] | Selected tool vision exists; parametric model and UI do not. |
| Sketch constraints/solver | [PLANNED] | Required architecture; not implemented. |
| Puzzle | [PLANNED] | Separate module; no generator implemented. |
| Puzzle uniqueness | [PLANNED][CONCEPT / NOT YET DECIDED] | Unique physical mating is required; algorithm is undecided. |
| TB rectangular | [IMPLEMENTED][ACCEPTED / LOCKED] | Stable v1.2 behavior. |
| TB angle-aware | [PLANNED][CONCEPT / NOT YET DECIDED] | Family variant, names/formulas undecided. |
| W rectangular | [IMPLEMENTED][ACCEPTED / LOCKED] | Stable v1.2 behavior and mouse-hole prevention. |
| W angle-aware | [PLANNED][CONCEPT / NOT YET DECIDED] | Must consume shared angle metadata. |
| S current | [IMPLEMENTED] | Planar A boundary contribution and B slot cutouts; incomplete. |
| S complementary half-slot | [PLANNED] | Requires assembly-aware paired cutouts. |
| S partial-height | [PLANNED][CONCEPT / NOT YET DECIDED] | Requires elevation/extent/placement; schema/UI undecided. |
| J | [PLANNED][CONCEPT / NOT YET DECIDED] | Joint family only; no accepted variants. |
| P | [PLANNED][CONCEPT / NOT YET DECIDED] | Pattern family; living hinge is an intended use, library undecided. |
| Manufacturing | [IMPLEMENTED][ACCEPTED / LOCKED] | Part of Box / Construction; derived pipeline. |
| Static 3D Preview | [PLANNED] | Derived-only isometric verification view. |
| ProjectDocument | [PLANNED] | Versioned aggregate around existing models; not implemented. |
| AssemblyRelationship | [PLANNED][CONCEPT / NOT YET DECIDED] | Must own panel angle; exact schema/conventions undecided. |

### Known debt

- **[KNOWN DEBT]** `README.md` contains stale capability statements.
- **[KNOWN DEBT]** `Architecture.md` version terminology does not align cleanly with semantic product version `1.2.0`.
- **[KNOWN DEBT]** Detailed B3 reports mix investigations, contracts, and superseded proposals; they are evidence, not automatic current authority.
- **[KNOWN DEBT]** Current project state is distributed across React state and a bounded history snapshot rather than a versioned multi-module ProjectDocument.
- **[KNOWN DEBT]** Reconciliation represents some split/coalesced states but current consumers do not support every theoretical topology.

## 16. Development Governance

### 16.1 Analysis-only work

When a task explicitly says **ANALYSIS ONLY**:

- make no production changes;
- create no tests;
- create no documentation unless explicitly requested;
- make no commit;
- create or move no tag;
- create no PR.

Record the inspected revision and worktree state. Use read-only checks and distinguish facts from hypotheses.

### 16.2 Bug-fix workflow

1. Establish expected locked or approved behavior.
2. Reproduce through the production path where practical.
3. Find the first incorrect stage: authoring, generation, relationship, composition, reconciliation, authority/packaging, FinalGeometry, manufacturing, or UI/state.
4. Add a focused regression where appropriate.
5. Make the smallest generic fix.
6. Run relevant focused and broad regression suites.
7. Browser-verify user-facing behavior.
8. Commit, PR, and merge only when requested by the active task/process.

Do not implement a speculative fix when safe diagnosis requires reproduction. Do not alter stable physical geometry to repair metadata/authority unless geometry itself is proven wrong.

### 16.3 Scope and architecture rules

- Do not silently broaden a task or claim unsupported behavior.
- Preserve locked release behavior unless an approved product change intentionally supersedes it.
- Prefer generic composition/reconciliation/authority rules over contributor-specific downstream hacks.
- Keep per-connection settings on the connection unless a future feature explicitly defines another scope.
- Derived previews/exports must not become hidden authorities.
- Snapshot changes require restore and compatibility analysis.
- New contributors must declare ownership/reference/creation semantics and fail closed on conflict.

### 16.4 Testing and browser verification

Use tests at the owning layer: workflow, geometry, relationship, composer, reconciliation, authority, FinalGeometry/manufacturing, and snapshot. Preserve locked TB/W equivalence and mixed composition coverage.

Browser verification is required when relevant changes affect toolbar activation, selection, A/B normalization, group progression/Finish, per-connection editing, history/Undo/Redo, preview, export, module transitions, constraints, Puzzle, or 3D Preview. Record the scenario, expected result, runtime, console state, and a screenshot for perceptible changes when possible.

### 16.5 Release and documentation

Releases require a semantic version, named baseline, locked commit, official verified tag in the authoritative repository, release notes, regression/browser acceptance, locked-behavior review, known limitations, and current next position.

Update this document whenever current truth, status, invariants, known debt, or next work changes. Update `PROJECT_HISTORY.md` for material milestones, redesigns, regressions, acceptances, and releases—not every commit. Keep `README.md`, `Architecture.md`, and `CHANGELOG.md` aligned in separately approved tasks.

## 17. Current Roadmap

This sequence is direction, not an unconditional commitment to every implementation detail:

1. Establish and review `PROJECT_MASTER.md` and `PROJECT_HISTORY.md`.
2. Design the versioned ProjectDocument and shared entity/document-identity foundation without changing v1.2 TB/W output.
3. Define project transactions, snapshot migration, revisions, and dependency invalidation.
4. Design a minimal sketch kernel: primitives, stable IDs, constraints/dimensions, solver boundary, and closed-region extraction.
5. Deliver narrow Drawing vertical slices before the full selected tool set.
6. Establish shared boundary references and Drawing ↔ Puzzle transition semantics.
7. Implement Puzzle standard boundaries and settings, then design subdivision and unique-mating validation.
8. Define construction assembly relationships, angle/orientation conventions, and panel-local frames.
9. Prove deterministic assembly resolution, potentially through a derived static 3D proof view.
10. Validate main-B/surrounding-A and other non-rectangular topologies before accepting them.
11. Add angle-aware TB and W variants while retaining rectangular-v1 compatibility.
12. Extend S using assembly-aware relationships for half-slots and partial-height walls.
13. Define J/P variants only after product decisions.

## 18. Current Next Steps

- **Current position:** v1.2 is the locked Box / Construction baseline.
- **Governance position:** This document and `PROJECT_HISTORY.md` establish durable current truth and rationale, subject to documentation review.
- **Next architectural subject after review:** shared ProjectDocument/document identity, canonical-versus-derived ownership, revisions, and compatibility boundaries before broad Drawing or Puzzle implementation.
- **Not part of the current documentation task:** implementing ProjectDocument, new tools, geometry, UI, tests, or release behavior.

## 19. NEW CHAT HANDOFF

> **Project:** SVG Box Designer
>
> **Release:** v1.2 — TB + Wall Stabilization (`1.2.0`)
>
> **Locked baseline:** `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2`; official tag `v1.2.0` (local PM.1 tag verification unavailable)
>
> **Modules:** 2D Drawing; Puzzle; Box / Construction (including Manufacturing)
>
> **Stable now:** SVG/PM panel import and containment, rectangular TB and W, current planar S, per-connection Tab widths, finished-group isolation, mixed composition, reconciliation/projection lineage, fail-closed authority, FinalGeometry, manufacturing, History/Undo/Redo, and restore-verbatim snapshots.
>
> **Critical invariants:** exclusive `REPLACES`; S-B `REFERENCES` original source; contributors do not mutate one another; composition owns physical assembly; reconciliation preserves semantics and fails closed; FinalGeometry is downstream 2D authority; manufacturing and future 3D views are derived; rectangular-v1 TB/W remains compatible.
>
> **Planned direction:** versioned shared ProjectDocument; constraint-based Drawing; Puzzle over shared closed boundaries with unique physical mating; assembly relationships/angles; angle-aware TB/W; expanded S; derived static isometric 3D Preview.
>
> **Unresolved:** sketch/solver schema, Puzzle subdivision/signature algorithm, future variant names, assembly angle/orientation conventions, main-B/surrounding-A proof, exact J/P libraries, and S future UI/schema.
>
> **Current position:** v1.2 accepted; governance documents created for review.
>
> **Next task:** review these documents, then design the shared ProjectDocument/document-identity foundation without implementing or regressing locked geometry.
>
> **Required instruction:** Read `PROJECT_MASTER.md` and `PROJECT_HISTORY.md` before proposing architectural changes or changes to locked geometry behavior.
