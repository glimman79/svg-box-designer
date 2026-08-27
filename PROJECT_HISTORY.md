# SVG Box Designer — Project History

## 1. Purpose and Scope

This document answers: what happened, why important architectural decisions were made, which regressions changed understanding, and how SVG Box Designer reached its current baseline.

It is selective history, not a commit diary or the current architecture specification. `PROJECT_MASTER.md` is authoritative for current product truth, locked behavior, plans, and unresolved decisions. `CHANGELOG.md` remains authoritative for release notes. If this history conflicts with the Master, the Master wins.

Status labels have the meanings defined in `PROJECT_MASTER.md`. Detailed B3.x reports and diagnostics are **[HISTORICAL]** evidence; their proposals do not automatically remain current.

## 2. Current Position at a Glance

- **Current accepted release:** v1.2 — TB + Wall Stabilization
- **Semantic version:** `1.2.0`
- **Locked commit:** `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2`
- **Official release tag:** `v1.2.0`
- **Local checkout tag verification:** unavailable in the PM.1 checkout.
- **Acceptance result:** B3.23 concluded that Wall was stable enough to leave stabilization.
- **Current development position:** governance documentation follows v1.2; the next architectural subject after review is the shared ProjectDocument/document-identity foundation.

## 3. Timeline Summary

| Era | Problem | Decision/change | Result and current relevance |
|---|---|---|---|
| Foundation / v1.0 core | Imported SVG geometry needed reliable topology and a safe downstream pipeline. | Build panel/contour detection, generated geometry, FinalGeometry, and derived manufacturing stages. | Established the current authority separation. |
| v1.1 | Panel Manager/import workflows and containment needed stabilization. | Stabilize PM, holes/nested panels, TB/S side behavior, Finish cleanup, and fixtures. | Created the practical authoring baseline for later TB/W work. |
| TB stabilization | Legacy identity and whole-panel outputs obscured ownership and mixed composition. | Migrate to native TB, edge-local profiles, relationships, panelComposer, and fail-closed authority. | Produced reusable physical-ownership architecture. |
| Mixed authority | More than one tool needed to contribute safely to a panel. | Register contributors, distinguish `REPLACES`/`REFERENCES`, compose generically, and gate authority atomically. | Enabled supported mixed TB/W/S panels without tool priority. |
| Wall introduction | W needed TB-compatible physical behavior with its own workflow and safe orientation. | Define W authoring, inherit unambiguous TB panel-role evidence, and reuse the finger-joint generator under native W identity. | Delivered rectangular Wall while preserving TB behavior. |
| Reconciliation | Composition could change final segments while generator metadata still described pre-composition projections. | Add explicit projection lineage and generic post-composition reconciliation before packaging. | Preserved semantic authority across supported mixed topologies. |
| Tab regression | Shared W/TB UI work accidentally shared setting behavior. | Restore each connection's independent width and test coexistence/isolation. | Locked the lesson that shared UI does not imply shared setting ownership. |
| v1.2 / B3.23 | Wall required product-level stabilization and acceptance. | Validate authoring, geometry, composition, reconciliation, manufacturing, history, and per-connection controls. | v1.2 became the locked TB + Wall baseline. |

## 4. Foundation and v1.0 Core

### 4.1 Import and topology foundation

**Problem:** User SVGs contain separate contours, holes, nested panels, open chains, and other topology that cannot be treated as unrelated paths.

**Decision/change:** The importer developed explicit edges, closed panel contours, inner contours, containment, and topology diagnostics. Panel Manager supplied per-panel thickness and a gate before construction workflows.

**Result:** Imported/resolved geometry became a useful stable base for Box / Construction. It also provides reusable topology concepts for future shared geometry, although it is not a parametric sketch model.

**Why it matters:** Future Drawing and Puzzle should extend shared document identity around this foundation rather than rewrite working import and panel containment.

### 4.2 GeneratedGeometryItem and FinalGeometry separation

**Problem:** Tool-specific applied geometry and downstream compensation risked multiple geometry models and destructive mutation.

**Decision/change:** Native `GeneratedGeometryItem[]` became the generated runtime representation. FinalGeometry became the tool-neutral resolved 2D handoff; ManufacturingGeometry became a fresh derived working copy.

**Result:** Preview/export and manufacturing no longer need to understand TB/W/S workflow history to obtain final contours.

**Why it matters:** FinalGeometry remains downstream 2D authority, while generated metadata and manufacturing workspaces cannot become competing geometry sources.

### 4.3 Manufacturing pipeline formation

**Problem:** Profile, clearance, and kerf compensation needed predictable ordering without mutating design intent.

**Decision/change:** Manufacturing processing was ordered as Profile Offset → Tap Clearance → Slot Clearance → Kerf, with preview and manufacturing export consuming the derived result.

**Result:** Design geometry and temporary manufacturing compensation have separate ownership.

**Why it matters:** New tools must join the common FinalGeometry/manufacturing handoff rather than create tool-specific physical pipelines.

## 5. v1.1

**[HISTORICAL]** v1.1 stabilized the practical PM/importer workflow:

- panel/hole containment and panels nested inside holes;
- simplified Panel Manager interaction;
- unified TB and S side-panel handling;
- removal of duplicate basic/diagnostic UI;
- cleaner tool labels and corrected TB label identity;
- Finish cleanup;
- import fixtures and regression tests.

**Problem:** The early interface and geometry classification needed a reliable baseline before broader connection work.

**Result:** v1.1 established stable imported panels and authoring workflow behavior on which TB authority and Wall were later built.

**Why it matters:** Panel/hole containment and Finish behavior are not temporary B3 experiments; they are inherited baseline capabilities.

## 6. TB Stabilization and Authority Evolution

### 6.1 Native TB identity migration

**Problem:** Historical E terminology and compatibility types obscured TB's production identity.

**Decision/change:** Production IDs, connections, geometry, diagnostics, and parsing migrated to native `TB`; legacy E connection and AppliedE compatibility paths were removed in stages.

**Result:** TB became a clear native tool/contributor rather than an alias layered over the old domain.

**Why it matters:** New family variants should extend TB identity without reintroducing a parallel legacy engine.

### 6.2 Edge-local generated profile ownership

**Problem:** Whole-panel generated carriers could show changed contours but could not reliably say which operation owned each replaced source edge or profile segment.

**Decision/change:** Generator-authored edge-local profiles, taps, projections, and stable lineage were introduced. TB corner and terminal behavior was corrected around local source edges.

**Result:** Relationships could express physical ownership per source edge, and contributor output could be composed without one tool editing another's whole panel.

**Why it matters:** Edge-local provenance underpins `REPLACES`, reconciliation, Profile Offset, Tap Clearance, and future contributor extensibility.

### 6.3 panelComposer

**Problem:** Multiple edge contributors needed one coherent panel boundary, including valid intersections at adjacent supports.

**Decision/change:** `panelComposer` assembled unchanged source traversals and registered replacement contributions into a complete candidate with deterministic junctions and segment lineage. Tolerance/idempotence work stabilized repeated packaging and corner resolution.

**Result:** Physical boundary composition moved to a contributor-neutral owner.

**Why it matters:** Contributor-specific downstream patching is no longer the acceptable model; new panel tools must adapt to the generic contract.

### 6.4 Single-tool authority

**Problem:** A composed candidate could not become production authority until it was proven equivalent to the legacy generator output and safe downstream.

**Decision/change:** Shadow composition and differential diagnostics first produced non-authoritative candidates. Proven single-tool panels were then promoted behind authority selection.

**Result:** Migration was evidence-driven and fail-closed instead of a wholesale rewrite.

**Why it matters:** Future authority changes should follow the same shadow/proof/promotion discipline and preserve locked output.

### 6.5 Mixed authority and relationship semantics

**Problem:** TB and S could affect different edges of one panel, but coarse mixed-tool rejection and whole-panel carriers prevented safe composition.

**Decision/change:** Contributor registration was generalized; relationship indexing distinguished:

- `REPLACES` — exclusive ownership of a physical source edge;
- `REFERENCES` — dependency without replacement ownership;
- `CREATES` — ownership of new physical features such as slot cutouts.

S-B `REFERENCES` was deliberately fixed to the original imported/source edge. Same-edge multiple replacements remained conflicts with no tool priority.

**Result:** Valid mixed cohorts could compose, while contradictory ownership failed closed.

**Why it matters:** These semantics prevent accidental last-writer wins and allow future contributors to share authority infrastructure.

### 6.6 Restore-safe, project-atomic authority

**Problem:** Partial promotion, silent legacy fallback, or recomposition during restore could change historical project meaning.

**Decision/change:** Authority selection became project-atomic and fail-closed. Snapshots recorded the selected composition model, and restore reinstated stored generated output without reselection. Legacy projects migrate only on fresh Apply.

**Result:** A failed candidate cannot install partial geometry, and an old snapshot does not silently acquire new runtime behavior.

**Why it matters:** Future ProjectDocument migrations must preserve this historical-meaning rule.

## 7. Wall Introduction and Stabilization

### 7.1 Architecture analysis and role contract

**Problem:** Early Wall discussions risked inventing an independent corner restriction or deriving roles from incidental geometry. A visible mouse-hole symptom required a physical explanation.

**Decision/change:** Wall analysis concluded that local same-role corner combinations were not themselves the governing restriction. A complete W connection instead required one A and one B on distinct panels and inherited orientation from unambiguous, complete TB panel-role evidence.

**Result:** Ambiguous evidence fails closed; absent or non-distinguishing evidence does not justify arbitrary role rewriting.

**Why it matters:** The current rectangular mouse-hole prevention is a locked orientation/terminal result, not permission to ban arbitrary corner combinations or infer future assembly angles from paths.

### 7.2 W authoring workflow

**Problem:** Wall needed a real production session flow rather than placeholder labels: selection order, complementary roles, connection completion, auto-progression, Finish, and History all had to agree.

**Decision/change:** Native W connection/group authoring was introduced. Completing a W pair auto-created the next placeholder; Finish removed an unused trailing connection. Session progression, role normalization, Apply validation, and History integration were corrected through focused diagnostics.

**Result:** W became a usable grouped workflow rather than a geometry-only experiment.

**Why it matters:** Future variants must preserve group isolation and browser session behavior, not only output paths.

### 7.3 Shared TB-equivalent physical generation

**Problem:** A separate Wall generator would risk geometry drift and duplicate solved TB behavior.

**Decision/change:** W retained native identity but became an adapter over the proven shared finger-joint generation path. Differential fixtures established exact TB/W physical equivalence after identity normalization.

**Result:** W inherited established terminal/tap behavior, including rectangular mouse-hole prevention, without erasing W semantics.

**Why it matters:** TB/W should remain tool families that share infrastructure; angle-aware work should not fork unrelated permanent engines.

### 7.4 Downstream stabilization

**Problem:** Real browser sequences exposed carrier identity, orientation, and downstream differences not fully reproduced by isolated fixtures.

**Decision/change:** Production-path captures and differential diagnostics traced authored state through generation, authority, FinalGeometry, manufacturing, and restore. Multi-contributor carrier identity, W profile authority, and same-role orientation were corrected at their owning stages.

**Result:** Supported W-only and mixed TB/W states reached the common authority/manufacturing pipeline consistently.

**Why it matters:** Browser failures must be reproduced through production state; fixture-only speculative fixes are unsafe.

## 8. Reconciliation and Projection Lineage

### 8.1 The post-composition seam

**Problem:** Composition could correctly move, reverse, split, or eliminate final segments at contributor junctions while generator-authored profiles still referred to original projections. Downstream Profile Offset or Tap Clearance could then see stale or missing semantic targets.

**Decision/change:** The architecture separated immutable generator metadata from derived post-composition mapping. Reconciliation was assigned to a generic stage after composition and before authority packaging—not to generators, tool adapters, manufacturing, or FinalGeometry guessing.

**Result:** Physical geometry and semantic lineage acquired distinct owners.

**Why it matters:** Contributors remain isolated, and mixed behavior can be repaired generically without changing stable physical contours.

### 8.2 Projection lifecycle and nonphysical lineage

**Problem:** Some terminal inverse-pair projections are meaningful generator lineage but do not survive as physical final segments. Treating them as silently missing looked like corruption.

**Decision/change:** Projection lifecycle tracing identified these cases and recorded explicit nonphysical disposition instead of fabricating geometry or dropping identity without explanation.

**Result:** Reconciliation can distinguish preserved/remapped/reversed physical projections, zero-length semantics, and supported deliberately nonphysical terminal lineage.

**Why it matters:** A semantic record need not be a physical contour segment, but its disposition must be explicit and validated.

### 8.3 Generic reconciliation implementation

**Problem:** Tool-specific fixes would not scale from TB/W to mixed TB/W/S or future contributors.

**Decision/change:** A pure contributor-neutral reconciliation service mapped profile projections to composed candidate segments using stable panel/source-edge/operation/profile/element/projection identity, orientation, and coverage evidence.

**Result:** Missing, conflicting, or ambiguous mappings became blocking diagnostics. Split/coalesced states could be represented but remained blocked where current consumers lacked support.

**Why it matters:** v1.2 claims supported composition topologies, not every theoretical split/coalesced case.

### 8.4 Authority and packaging integration

**Problem:** A correct standalone reconciliation service would not protect production unless authority selection required it and packaging carried its result.

**Decision/change:** Reconciliation was wired into the authority → packaging pipeline. Only reconciled candidates could become composed authority; downstream diagnostics ran against the complete project candidate set.

**Result:** Semantic completeness became part of project-atomic authority selection rather than an optional diagnostic.

**Why it matters:** Future tools cannot bypass reconciliation merely because their physical candidate looks visually correct.

## 9. Important Regressions and Fixes

### 9.1 Mixed clearance projection remapping

**Problem:** Mixed composition exposed clearance projections whose final target or orientation no longer matched generator-stage metadata.

**Fix:** Projection matching/remapping and lifecycle traces were corrected before the generic reconciliation integration.

**Lasting lesson:** Metadata/authority defects should be fixed at the generic mapping seam without changing already-correct physical geometry.

### 9.2 Multi-contributor carrier collision

**Problem:** Combined TB/W generated carriers could collide in identity/discovery, producing browser-versus-test divergence downstream.

**Fix:** Carrier identity/discovery was corrected, and diagnostics were expanded to inspect complete production batches.

**Lasting lesson:** Multi-contributor authority must be validated project-atomically; isolated carriers do not prove a real browser Apply sequence.

### 9.3 Wall role, orientation, and session regressions

**Problem:** Wall initially showed incorrect orientation, incomplete-placeholder Apply behavior, and session/history progression defects.

**Fix:** The owning stages were separated: authoring normalized roles, validation ignored only the legitimate active trailing placeholder, shared generation produced TB-equivalent geometry, and History captured W group state.

**Lasting lesson:** Similar visual failures may originate at different layers; diagnose the first incorrect stage.

### 9.4 Per-connection Tab regression and restoration

**Problem:** During W Tab-control parity, shared control/synchronization behavior caused connection widths to act as though they had shared ownership. This contradicted the requirement that distinct TB/W connections and finished groups keep independent values.

**Decision/fix:** W retained the same compact control behavior as TB, but each connection's `fingerWidthMm` and manual state were restored as independent properties. Regression coverage established that different widths coexist and later edits do not change completed groups.

**Result:** v1.2 shipped with per-connection Tab/finger width restored.

**Why it still matters:** **Shared UI implementation does NOT imply shared setting ownership.** TB and W may share a control or geometry implementation while every connection retains its own value.

## 10. v1.2 Release

### 10.1 Accepted scope

**[HISTORICAL][ACCEPTED / LOCKED at release]** v1.2 retained stable TB and accepted rectangular Wall/W stabilization, including:

- Wall A/B normalization and mouse-hole prevention/orientation;
- shared TB/W finger-joint semantics and supported mixed composition;
- fail-closed same-edge replacement ownership;
- generic post-composition reconciliation and explicit nonphysical projection lineage for supported topologies;
- per-connection TB/W Tab widths and finished-group isolation;
- W compact thickness/Tab control parity;
- supported FinalGeometry/manufacturing behavior;
- History, Undo/Redo, workflow state, and snapshot compatibility.

### 10.2 B3.23 acceptance

**Problem:** Technical implementation alone did not establish that Wall could leave stabilization.

**Decision:** B3.23 evaluated the accumulated authoring, geometry, authority, reconciliation, downstream, per-connection, and workflow evidence and accepted Wall as stable enough to leave stabilization.

**Result:** Commit `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2` became the locked v1.2 baseline, with official tag `v1.2.0`.

**Why it matters:** Future work begins from this compatibility boundary. It must not reopen solved rectangular TB/W architecture solely because another design appears cleaner.

### 10.3 Known release limitations

- S remained incomplete beyond its current planar behavior.
- Reconciliation did not claim every theoretical split/coalesced topology.
- J/P remained future-facing rather than implemented tool libraries.
- No parametric Drawing, Puzzle generator, assembly-angle model, ProjectDocument, or static 3D assembly preview existed.

## 11. Superseded or Temporary Material

### 11.1 Historical reports and diagnostics

**[HISTORICAL]** B3.x architecture reports, browser/test differential analyses, reduction fixtures, runtime captures, and shadow/oracle paths explain investigations and provide evidence. They do not override `PROJECT_MASTER.md` or prove that every proposed design was implemented.

Retired examples—such as early independent Wall corner restrictions—must not be revived as current truth after later analysis superseded them.

### 11.2 Legacy and debug paths

Legacy/single-tool authority modes, raw generator carriers, shadow composition, and runtime diagnostic schemas served rollback, equivalence, migration, and debugging purposes. Their historical existence does not make them preferred new architecture. Remove or change compatibility paths only through explicit migration work with restore and regression evidence.

### 11.3 Documentation debt

- **[KNOWN DEBT]** `README.md` contains stale capability statements that predate implemented TB/W/S geometry.
- **[KNOWN DEBT]** `Architecture.md` uses version terminology that does not align cleanly with semantic product version `1.2.0`.
- **[KNOWN DEBT]** Detailed B3 reports contain superseded hypotheses alongside lasting evidence and need status-aware reading.

These files were not changed during PM.2.

## 12. Current Development Position

v1.2 is the locked Box / Construction baseline. TB and rectangular W are accepted; current S is implemented but incomplete; J/P, Drawing, Puzzle, assembly angles, angle-aware variants, and static 3D Preview remain planned or conceptual exactly as classified in `PROJECT_MASTER.md`.

PM.1 analyzed the source and designed the governance structure. PM.2 created `PROJECT_MASTER.md` and this history so future sessions can distinguish implemented, locked, planned, conceptual, debt, and historical material.

After documentation review, the next architectural subject is the shared versioned ProjectDocument/document-identity foundation. That work must wrap and preserve useful v1.2 models rather than rewrite stable TB/W behavior.

## 13. Release History Index

| Release | Locked commit | Official tag | Summary | Current relevance |
|---|---|---|---|---|
| v1.0 core | Not recorded here | Not recorded here | Import/topology and generated/final/manufacturing pipeline foundation. | Historical architecture foundation; consult release documents for exact release identity. |
| v1.1 | `5392cbe` (release commit visible in repository history) | Not recorded here | PM/import containment, UI/workflow, TB/S, Finish, and fixture stabilization. | Stable predecessor to authority and Wall work. |
| v1.2 | `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2` | `v1.2.0` | TB + Wall Stabilization; reconciliation, projection lineage, per-connection widths, and B3.23 acceptance. | Current accepted and locked baseline. Local PM.1 tag verification was unavailable. |
