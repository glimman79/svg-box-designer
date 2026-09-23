# SVG Box Designer — Project History

## 1. Purpose and Scope

This document answers: what happened, why important architectural decisions were made, which regressions changed understanding, and how SVG Box Designer reached its current baseline.

It is selective history, not a commit diary or the current architecture specification. `PROJECT_MASTER.md` records current product and architecture truth, while `ROADMAP.md` owns agreed future direction, feature status, and open future design. `CHANGELOG.md` remains the completed-change record. Current implementation conflicts are resolved against the Master and code; future-direction conflicts are resolved against the Roadmap.

Status labels have the meanings defined in `ROADMAP.md`. Detailed B3.x reports and diagnostics are **[HISTORICAL]** evidence; their proposals do not automatically remain current.

## 2. Current Position at a Glance

- **Current accepted release:** v1.2 — TB + Wall Stabilization
- **Semantic version:** `1.2.0`
- **Locked commit:** `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2`
- **Official release tag:** `v1.2.0`
- **Acceptance result:** B3.23 concluded that Wall was stable enough to leave stabilization.
- **Current development position:** substantial solver-backed 2D Drawing development followed v1.2. Direction/position authority and natural Point Reference acquisition under Parallel are browser-verified, and the standalone one-segment Line tool is merged, browser-verified, and accepted; a shared ProjectDocument remains later cross-module work.

### September 2026 Profile tool identity migration

The continuing straight-segment authoring workflow was renamed from its legacy Line tool identity to Profile without changing behavior. Profile workflow state and delayed commit ownership were separated from reusable Line-segment geometry and generic document mutation. Persistent geometry remained Line-based, and the tool ID changed from `'line'` to `'profile'`, freeing the Line tool name for the future standalone one-segment workflow. The migration was merged in #544 and subsequently verified successfully and accepted by the user in the real browser.

### September 2026 standalone Line implementation and acceptance

The neutral straight-segment infrastructure prepared by the Profile migration was then reused for the separate standalone Line workflow. The implementation merged in #546: Line accepts P1 and P2, commits exactly one straight segment, and completes rather than continuing from P2; persistent activation starts each subsequent construction from a fresh independent P1. Profile remains the chained workflow. Both authoring paths create ordinary `DrawingLineEntity` / `type: 'line'` geometry without authoring-origin metadata, so downstream topology, Constraints, Dimensions, selection, and Direct Manipulation share the existing geometry systems. The user subsequently tested the implemented Line tool in the real browser, reported that it worked well, and accepted the milestone.

### September 2026 directional drag-box selection acceptance

Directional Drawing drag-box selection merged in PR #551 at main commit
`a91f794333d49935f3743116286f679fc025550a`. Left-to-right Window selection accepts only
strictly enclosed Lines, while right-to-left Crossing selection also accepts partly
contained, crossed, and boundary-touching Lines; the mode changes live with direction.
An ordinary box replaces selection and Ctrl toggles qualifying Lines through the common
selection system. The accepted scope is Line-only rather than independent point box
selection. Mikael tested the merged interaction in the real browser, reported “det
fungerar bra,” and accepted it.

### September 2026 equivalent-demand browser failure and policy correction

The browser trace after #518–#520 showed frame 345 correctly detecting and accepting compatible Parallel, Perpendicular, and Point Reference channels and presenting Parallel alone. The click then began a fresh chained segment at frame 346. Multiple Parallel references, a Perpendicular reference, and Point Reference produced essentially the same candidate point at about 8.4169 px, while Y alignment was about 4.6948 px and generic angular intent reported 45°. Because each semantic family was independently outside its 8 px acquisition threshold and the new segment intentionally had no hysteresis, alignment won with all direction channels null. Thus the first incorrect stage was candidate acquisition, before Line resolution or presentation: equivalent geometric evidence was still arbitrated as unrelated family candidates.

The same investigation found a distinct persistence cause. #518–#520 deliberately forwarded every accepted Parallel and Perpendicular ID to `appendEntityToActiveSketch`, which created both constraints in one transaction. Repeated authoring therefore produced multiple real persistent Perpendicular constraints and markers; rendering was accurately showing stored semantics. The policy was superseded: detection remains plural, but normalized unoriented direction demands are grouped before composition, presentation, and automatic persistence. A compatible alignment can admit a fresh equivalent direction group through the existing release band, avoiding a family-specific radius or winner rule. Deterministic representation selection prefers Parallel within an equivalent group, so the click persists Parallel only; a lone Perpendicular is unchanged. Existing documents are not rewritten.

### 2.10 Direction authority and viewport candidate correction (post-#524; pending browser acceptance)

Browser evidence after #524 proved that start incidence was not the governing distinction. The earliest incorrect direction stage was channel acquisition: `chooseParallel` and `choosePerpendicular` independently promoted equivalent observations, after which Line resolution, transient presentation, and minimal persistence each applied overlapping policy to the same pair. This made two geometrically redundant relations simultaneous authoring authorities even though persistence later discarded one.

The authority model now keeps raw detection plural but selects exactly one non-axis Line direction authority before endpoint composition. Equivalent Parallel and Perpendicular observations use Parallel as the deterministic authority representative; a lone Perpendicular remains fully functional. Hard Endpoint/Midpoint/finite-Line targets retain independent position ownership. The start-incident rejection and persistence-time equivalent-demand minimizer were superseded and removed rather than expanded.

The visibility investigation found a separate earliest error in candidate generation: Line direction candidates always used the full resolved sketch, but X/Y and point-reference candidates were created only from reference points inside `viewBox`. A visible Line could therefore introduce a competing positional construction that vanished solely because panning excluded its endpoint. Candidate membership now comes from the complete committed sketch; screen-space distance remains the acquisition measure. This gives manual restart and continuous authoring the same model and makes translated viewport states semantically invariant.

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
| Post-v1.2 Drawing | Drawing needed durable topology and semantic, editable geometry rather than display-only SVG. | Add SketchPoints, solver-backed dimensions/constraints, inference, Direct Manipulation, Drawing History, and shared marker derivation. | Drawing is implemented and active; later Line work separated direction, position, evidence, and commit ownership. |

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
- J (Joint) and P (Pattern) remained future-facing rather than implemented tool libraries.
- No parametric Drawing, Puzzle generator, assembly-angle model, ProjectDocument, or static 3D assembly preview existed.

## 11. Post-v1.2 2D Drawing Development Era

This era is post-release development; it does not rename the v1.2 Box baseline or assert a later release.

### 11.1 Topology, dimensions, and solver authority

**Problem:** Early Lines with embedded endpoint coordinates could not express shared connectivity or durable semantic references. Dimensions and dragging risked becoming destructive coordinate edits.

**Decision/change:** Drawing introduced `DrawingSketchPoint` identity and Lines referencing point IDs, stable ordering, schema migration, typed dimensions, equation/Jacobian component solving, rank/degree-of-freedom analysis, and solver verification. Driving and Reference roles separated intent from derived measurement; Point-to-Point/Origin, Point-to-Line, Line-to-Line distance, and Line-to-Line angle support grew incrementally.

**Result:** Direct Manipulation was routed through the component solver, allowing connected and constrained geometry to propagate rather than bypassing constraints. Solver null-space projection also enabled semantic Line states (`FREE`, `CONSTRAINED`, `FULLY_LOCKED`) instead of inferring state from superficial constraint counts.

**Why it matters:** SketchPoint topology and solver results, not endpoint mutation or paint state, are Drawing authority.

### 11.2 Inference became semantic architecture

**Problem:** A snap winner had initially served too many roles: cursor position, connectivity, semantic relation, and guide rendering. Improving one inference could erase another or leave stale display state.

**Decision/change:** Line authoring evolved toward separate position, topology, semantics, and presentation channels, with Ctrl as a raw-override layer. Endpoint, finite-Line, X/Y, H/V, angular, Parallel, Perpendicular, Midpoint, and point-derived 90-degree references were added/refined. Accepted automatic relations commit with Line creation in one Drawing History transaction.

**Result:** H/V became first-class, exclusive axis intent. Parallel gained a normalized direction equation and paired markers. Perpendicular gained a normalized dot-product equation and presentation at shared points or infinite-support intersections, including separated support gaps and dynamically flipping marker sides. Coincidence gained Point→Point and Point→support-Line variants, the latter preserving slide freedom.

**Why it matters:** One effective position is compatible with more than one semantic truth. Priority is for incompatible positional alternatives; compatible semantics must survive together.

### 11.3 Floating Constraints workflow

**Problem:** Manual constraint creation needed predictable target selection without turning selection or panel UI state into geometry edits.

**Decision/change:** A movable, non-modal Constraints panel was added with a centralized applicability authority. The catalog deliberately exposes future entries as disabled while enabling only implemented/applicable Midpoint, Coincidence, Parallelism, Perpendicular, Horizontal, and Vertical choices. Panel-open selection accumulates without Direct Manipulation; apply clears targets but keeps the panel open; Esc closes and restores Select behavior.

**Result:** Visible catalog scope is no longer confused with implemented constraint scope, and UI-only OK/Esc behavior does not pollute History.

### 11.4 Midpoint and the shared-presentation lesson

**Problem:** Several Midpoint preview attempts passed render/state tests yet failed the visible browser interaction. Preview was too closely coupled to cursor-local state, accepted snap and preview state became desynchronized, and the existence of SVG nodes did not prove visible placement.

**Decision/change:** Automatic Midpoint was retained as a first-class Point+Line semantic constraint, while its transient preview was changed to reuse the already-working persistent Midpoint marker placement/layout authority.

**Result:** Browser testing accepted automatic Midpoint snap, visible transient `—□—`, and stable placement across the click: the same layout is transient before commit and persistent afterward, with styling rather than geometry changing.

**Lasting lesson:** Where practical, the same semantic relation must derive the same marker/support geometry for transient and persistent states. Preview and persistent markers must not be unrelated visual implementations. Browser acceptance is authoritative; render output alone does not prove user-visible behavior.

### 11.5 Parallel preview success and coexistence failure

**Partial success:** Parallel transient `II` was derived using the persistent Parallel marker layout principle. Browser testing confirms that automatic Parallel and its preview work while Parallel remains active alone.

**Failed/partial coexistence fix:** Investigation found branches in `resolveLineEffectivePoint` that populated one of `parallelLineId` and `perpendicularLineId` while clearing the other. Changes allowed both IDs to coexist and revalidated both semantics against final effective geometry. Automated tests reported coexistence, and the Parallel preview work succeeded.

**Browser result:** When a live authored Line has active Parallel and is moved until compatible Perpendicular becomes valid, Perpendicular activates but Parallel itself stops functioning; the Parallel preview disappears because its semantic relation was lost. This is not a preview-only defect.

**Architectural lesson:** **metadata coexistence != live geometric coexistence.** Synthetic states carrying both IDs cannot prove that the pointer-move resolver computed one geometry satisfying both. The next investigation must trace whether a positional Perpendicular winner first changes effective geometry and only then causes a legitimate Parallel truth-check to reject the old relation. That is a hypothesis, not yet proven. Compatibility may need to participate before or during effective-point resolution, while genuinely incompatible reference directions still require arbitration.

**Compatibility-before-priority completion (pending browser acceptance):** A production-path regression subsequently reproduced the missing case: a point-reference construction could win the singular position before compatible Parallel and Perpendicular channels were resolved, bending the authored endpoint away from their shared direction and causing final truth validation to discard both Line relations. Parallel candidates now carry their actual reference endpoints, and Line effective-point resolution compares nondegenerate reference directions before soft positional priority. Compatible requests project the pointer once onto their common unoriented direction; incompatible requests, exact point/finite-Line authorities, H/V, and Ctrl retain their existing arbitration. This is implemented and regression-covered, but is not browser-accepted or locked.

**Global Line acceptance completion (pending browser acceptance):** The pair-specific common-direction gate was replaced by Line-specific geometric direction demands. The position-composition pass can combine an acquired semantic direction with a point-reference construction support without inspecting a named inference pair, freezes one endpoint, and only then derives all true Parallel/Perpendicular semantics from actual target-Line geometry. A production-path regression covers Parallel acquired with Point Reference as positional winner and no acquired Perpendicular through presentation, click, and persistent constraint creation. Automated tests pass; real-browser acceptance remains outstanding.

**Hard-position semantic-authority correction (pending browser acceptance):** A later Endpoint diagnostic showed why a hard positional winner must never be interpreted as the semantic allow-list: Endpoint correctly froze topology and coordinates while independent direction channels remained acquired. The remaining hard-position branch still contained obsolete family-specific semantic preselection (including Midpoint-only Parallel handling), even though final acceptance subsequently revalidated channels. That preselection was consolidated away. All positional branches now hand one frozen endpoint to the same normalized direction-demand evaluator, which retains each acquired Parallel/Perpendicular demand true of the authored vector and rejects each false demand independently. Continuous-chain regressions establish that the preceding Line remains discoverable through its shared endpoint and may supply Perpendicular while an older Line supplies Parallel in a 90°/90° chain. Equivalent direction demands are normalized for geometry without turning point-reference construction presentation into an extra persistent constraint. Automated tests are not browser acceptance; the reported real interaction remains pending user verification.

**Frame 457→458 acquisition correction (pending browser acceptance):** Browser diagnostics then proved the next first failure was earlier than Line acceptance. Frame 457 carried Parallel, Perpendicular, Point Reference, and Y-alignment channels and resolved compatible direction semantics. On frame 458, Y-alignment entered its acquire window while the two direction projections were about 12.13 px from the pointer—beyond their 11 px release thresholds. `chooseParallel` and `choosePerpendicular` consequently released both channels before Line resolution, leaving an alignment-only result even though the raw candidates still existed. This was not alignment arbitration explicitly clearing direction channels and could not be repaired downstream. Acquisition now normalizes retained direction and alignment candidates into direction/coordinate requirements: a direction beyond its independent release radius survives as a non-positional acquired channel only when those requirements have one valid forward composition. The alignment can still own `snap.type`; incompatible combinations still release. This is a general requirement-composition rule, not a Parallel+Y-alignment exception.

**Frame 405/406 presentation correction (pending browser acceptance):** A later browser trace established a different first incorrect stage. Acquisition already contained Parallel and Perpendicular, compatible direction composition was used, and final semantic truth contained both reference IDs, but transient presentation called the same equivalent-demand representative selector used by minimal persistence. It therefore hid Perpendicular as redundant even though redundancy was only a storage decision. Live presentation now projects every accepted semantic relation; the transaction-scoped persistent selector still omits a redundant Perpendicular when Parallel represents the same stored degree of freedom. This is relation-plural rather than a named pair rule: geometric equivalence remains available for compatibility and persistence but cannot erase semantic identity or live feedback. Parallel remains a ray/direction authority with pointer-controlled length, not a unique point. Automated coverage is not browser acceptance.

**Manual-restart/continuation equivalence audit (pending browser acceptance):** A production-path A/B comparison used the same committed geometry, start SketchPoint, and pointer for both a manual Line restart and automatic continuation. It found no difference through raw candidates, acquired channels, effective geometry, semantic truth, transient presentation, or minimal persistence for either of the next two Lines. Point Reference was also topology-derived in both paths. The audit did uncover a dormant legacy resolver input and branch: the workspace looked up the previous chained Line's axis constraint, and a later fallback could convert Perpendicular-to-that-Line into H/V. Ordinary production snaps with acquired direction channels resolve earlier, so this branch was not proven to cause the reported browser behavior and no such root-cause claim is made. The history-dependent branch and input were nevertheless removed so legacy/non-production snap shapes cannot create a distinct chained inference mode. Continuation still reuses the committed endpoint SketchPoint and retains previous-Line identity solely as workflow metadata. Automated tests do not establish browser acceptance; a browser trace is still required to locate any actual divergent stage in the reported interaction.

**Start-topology acquisition correction (pending browser acceptance):** The next production-path reproduction proved that ordinary Perpendicular candidate generation considered every committed Line, including the immediately incident Line at the current new Line's `startPointId`. It acquired that candidate independently before direction grouping; grouping then correctly found it geometrically equivalent to an acquired Parallel against another Line, but incorrectly promoted both to live authoring authorities. Candidate generation now annotates incidence from stable SketchPoint topology, and channel acquisition rejects only an equivalent start-incident Perpendicular when a non-start Parallel has already supplied that direction. First-corner Perpendicular remains valid without Parallel, and non-start/free-end target Perpendicular remains compatible with Parallel. The rejected relation is absent before semantic finalization and presentation, and diagnostics report its reference identity and rejection reason. This applies equally to continuation and manual restart because no chain-history identity participates. Automated coverage is not browser acceptance.

**Selected-authority handoff correction (pending browser acceptance):** Frames 344–348 established that acquisition had already selected Parallel as the sole non-axis direction authority while Endpoint correctly owned position, but `lineResolution` then reconstructed semantic truth from acquired channel shapes. That was a second, overlapping authority-selection mechanism: the selected authority metadata itself was not the validation input, so losing the channel representation also lost Parallel before presentation and persistence. Direction authority now carries stable reference-Line geometry into resolution. The single final-geometry check tests the exact Endpoint/Midpoint/finite-Line result against that selected authority, accepts only the selected relation when compatible, and reports an explicit incompatibility reason otherwise. The hard position is never projected or moved. The obsolete plural-channel semantic rediscovery in `acceptedDirectionalRelationsAt` was removed; presentation and persistence consume the resulting accepted interaction. Automated coverage includes the acquire→Endpoint→topology reuse→Parallel commit production path and is not browser acceptance.

### 11.6 Browser acceptance boundary during the investigation

Unit, solver, state, and render-level tests remain necessary. They are not sufficient for inference acquire/release sequences, transient visibility, Direct Manipulation, selection arbitration, or cursor behavior. A contrary browser result keeps the behavior unresolved.

This section records the acceptance boundary at that stage. It was later superseded by the direction-authority, transaction-ownership, same-event visibility, and Point Reference work in sections 11.7–11.10. Midpoint's shared transient/persistent placement remained browser-accepted throughout; automated evidence continued to be treated as insufficient when a browser trace disagreed.

### 11.7 Candidate lifetime replaced by established construction authority (post-#526)

Real-browser frames 269–270 isolated the first incorrect transition: Parallel was valid at about 0.685 px, then `chooseParallel` discarded it at about 12.886 px because the old 11 px release band governed both discovery and authority lifetime. That erased `directionAuthority`, accepted semantics, and presentation before position search could complete.

The old lifecycle combined `chooseParallel`/`choosePerpendicular`, `previousSnap` channel hysteresis, alignment-only `composableDemandGroups`/`composableReference`, `retainCompatibleDirection`, and a later Line-tool common-direction pass. These were overlapping attempts to retain or rediscover direction. They were replaced with one snap-engine lifecycle: acquire a candidate inside tolerance, establish a stable construction ray, track it independently of candidate distance, explicitly supersede/release it, and let the existing generic position arbitration continue. Final resolution now consumes that single authority only for projection and truth validation. Presentation and persistence do not arbitrate again.

The active authority's direction is fed back into ordinary committed-point alignment construction, so reference-Line endpoints participate through the existing transient reference mechanism. No synthetic SketchPoint or presentation geometry is persisted. Automated production-path coverage reproduces travel beyond the legacy release band and then reaches an exact compatible Endpoint; real browser acceptance remains pending.

### 11.8 Accepted-click transaction ownership and tighter acquisition

The production boundary regression reproduced a deterministic rapid-chain loss: each accepted endpoint was frozen but scheduled 220 ms later for native double-click disambiguation. A subsequent click cleared and replaced the prior timeout while the old interaction was still active, so the accepted segment never persisted and the newer point was resolved against the wrong start. The clear-and-replace scheduler policy was removed rather than covered with a retention fallback.

One pending transaction now owns its accepted callback. A same-tool primary click flushes that owner synchronously before placement resolution, establishing endpoint topology and the next generic Line interaction; explicit cancellation still clears it. Timer identity checks prevent stale callbacks from committing into later state. Manual and continued starts share `initializeNewLineAt`, and inert `previousChainedLineId` workflow metadata was removed from inference state.

As a separate refinement after the transaction regressions passed, direction acquisition changed from 8 px to 5 px and Point Reference from 8 px to 6 px. Endpoint (9 px), Midpoint (8 px), finite Line and X/Y alignment (8 px), all release bands, and established direction lifetime were deliberately unchanged. Boundary regressions cover both sides of each changed threshold and Parallel/Perpendicular tracking well outside acquisition distance.

### 11.9 Same-event committed-geometry visibility

The transaction-ownership fix exposed the first concrete manual/continuation divergence. Flushing a pending segment updated `documentRef` synchronously, but `resolvePlacement` still collected candidates from `resolvedLines` captured by the preceding React render. A rapid continuation click therefore started with the correct fresh interaction and SketchPoint ID but could not see the segment just committed in that same browser event; a later render made it appear, explaining why movement could seem required. Manual restart naturally ran after that render and saw the complete geometry.

Candidate collection now resolves active-sketch Lines from the current committed transaction snapshot on every placement. The continuation still clears spatial snap state and uses the generic initializer; no chain identity or inference state is introduced. A production-boundary A/B regression freezes one pointer sequence and compares candidates, authorities, effective points, accepted semantics, and transient presentation frame by frame against a manual start, while preserving delayed-commit ownership. No acquisition or release tolerance changed in this correction. Automated verification is not browser acceptance.

### 11.10 Direction-aware Point References and final browser acceptance (post-#533)

After commit ownership and same-event visibility made manual and rapid chained interactions structurally equivalent, the remaining investigation focused on the geometry of Point Reference supports under an established direction. Candidate construction was changed to intersect a normal-to-incident-Line support with the active construction ray. That allowed pointer travel along the intended construction to expose the useful intersection rather than requiring proximity to the raw infinite support.

The final distinction was positional authority. A support parallel/coincident with the established construction, or otherwise unable to supply a unique valid forward intersection, could still be legitimate reference evidence but could not locate the endpoint. Such candidates were classified as reference-only and excluded from positional ownership. A later support with a valid intersection was therefore free to own position. This was a general geometric rule, not a special case for continuation or the preceding Line.

Browser verification accepted the required result: with Parallel active, natural movement along the construction acquired the compatible Perpendicular-derived Point Reference at the useful intersection without sideways movement. This closed the manual-versus-chain investigation while preserving the invariant that every continuation is a fresh Line interaction carrying only committed geometry and shared SketchPoint topology.

### 11.11 Accepted Drawing snap tuning (#548–#549)

#548 tuned positional Drawing snap hysteresis: Endpoint and Midpoint capture/release became 7/9 CSS px, while finite Line, alignment, and Point Reference became 5/7 CSS px. #549 then replaced unbounded Parallel/Perpendicular retention with finite 5/7 CSS px capture/release based on the existing lateral client-space candidate distance. Leaving the 7 px corridor releases transient direction authority and stale semantic evidence without imposing a cooldown or blocking same-frame fresh acquisition; movement along the valid construction direction does not itself cause release.

Real-browser validation accepted the resulting positional snap feel and the finite Parallel/Perpendicular release. The work refined capture and release within the existing compatibility-before-priority authority model; it did not change snap priority, candidate geometry, topology, persistence, H/V arbitration, Ctrl bypass, or the Profile/Line authoring structure.

### 11.12 Global Drawing Presentation Standard

**Problem:** Accepted presentation values were implemented chiefly through Line-named CSS and distributed relation-specific rules, inviting future geometry to duplicate or reinterpret colors, widths, previews, and support graphics. At that stage of Circle development, its authoring preview was visible and live while the committed Circle existed and was selectable but lacked a normal semantic constraint-state class and was normally invisible.

**Decision/change:** `PROJECT_MASTER.md` became the normative Drawing Presentation Standard. Shared semantics now flow from entity-specific mobility or relation truth through semantic presentation classification into global roles, then geometry-specific SVG primitives. Committed curve states, temporary overrides, Authoring Preview, Inference, support geometry, Constraints, Dimensions, Points, overlays, precedence, and unresolved future decisions are explicitly separated. Line is the current accepted reference, not the owner. That documentation decision made no production fix; the Circle presentation integration and browser acceptance recorded in 11.13 followed later.

**Result:** Future geometry must consume global roles where semantics match, preserve category-specific glyphs where they do not, and explicitly resolve the tracked Arc/reference, construction geometry, Radius/Diameter, and token-coupling questions rather than inventing styles.

### 11.13 Circle Stage 1 browser acceptance

The initial semantic Circle implementation established a persistent Circle with a referenced center `SketchPoint`, scalar radius, two-stage center/radius authoring, persistence, History, selection, hit testing, deletion cleanup, and directional box selection. Follow-up work corrected normal committed-Circle presentation, integrated the center into the derived entity-defining persistent-point role, and made persistent SketchPoints global positional snap candidates so shared topology is reused across Line, Profile, and Circle.

Circle P1 then gained exact Point-on-Curve acquisition against true existing Circle geometry alongside point, Midpoint, finite-Line, Alignment, and free placement. P2 remained a non-persistent radius-defining control and gained circumference-driven acquisition of existing persistent points, persisting the global `COINCIDENT` / `point-curve` relation without fixing the point's angle. Circle joined the shared geometry-authoring cursor policy and global Ctrl bypass. Final real-browser verification accepted the complete Stage 1 behavior and presentation. Arc, Radius/Diameter Dimension and Constraint, Concentricity, and Tangency remained unimplemented.

## 12. Superseded or Temporary Material

### 12.1 Historical reports and diagnostics

**[HISTORICAL]** B3.x architecture reports, browser/test differential analyses, reduction fixtures, runtime captures, and shadow/oracle paths explain investigations and provide evidence. They do not override `PROJECT_MASTER.md` or prove that every proposed design was implemented.

Retired examples—such as early independent Wall corner restrictions—must not be revived as current truth after later analysis superseded them.

### 12.2 Legacy and debug paths

Legacy/single-tool authority modes, raw generator carriers, shadow composition, and runtime diagnostic schemas served rollback, equivalence, migration, and debugging purposes. Their historical existence does not make them preferred new architecture. Remove or change compatibility paths only through explicit migration work with restore and regression evidence.

### 12.3 Documentation audit outcome

The stale early-product README and overlapping root Architecture document were corrected in the September 2026 documentation audit. Detailed B3 and Drawing investigation reports remain intentionally historical or diagnostic; `docs/README.md` classifies them so their evidence is preserved without presenting old hypotheses as current authority.

### 12.4 Documentation governance consolidation

Central documentation was consolidated around `ROADMAP.md` as future-direction and feature-status authority, `PROJECT_MASTER.md` as current-state authority, and the new `REGLER_FOR_CHATT_MED_CHATGPT.md` collaboration rules with a systematic post-acceptance synchronization cycle. Product terminology was clarified at milestone level: the chained tool historically named Line is the Profile foundation, J means Joint, P means Pattern, and historical P1 was not carried forward as a product identity.

## 13. Current Development Position

v1.2 remains the locked Box / Construction baseline. TB and rectangular W are accepted; current S is implemented but incomplete. Drawing is now substantially implemented post-v1.2. Current implementation truth is summarized in `PROJECT_MASTER.md` and code; future status and direction for Puzzle, Joint, Pattern, assembly angles, angle-aware variants, static 3D Preview, and a shared ProjectDocument are classified in `ROADMAP.md`.

PM.1 analyzed the source and designed the governance structure. PM.2 created `PROJECT_MASTER.md` and this history so future sessions can distinguish implemented, locked, planned, conceptual, debt, and historical material.

The later Line sequence resolved the reported natural-acquisition path: established direction remains independent of positional search, and non-positional Point Reference supports cannot mask a useful intersection. Shared versioned ProjectDocument/document identity remains future cross-module architecture; it must eventually wrap useful Drawing and v1.2 models rather than rewrite either.

## 14. Release History Index

| Release | Locked commit | Official tag | Summary | Current relevance |
|---|---|---|---|---|
| v1.0 core | Not recorded here | Not recorded here | Import/topology and generated/final/manufacturing pipeline foundation. | Historical architecture foundation; consult release documents for exact release identity. |
| v1.1 | `5392cbe` (release commit visible in repository history) | Not recorded here | PM/import containment, UI/workflow, TB/S, Finish, and fixture stabilization. | Stable predecessor to authority and Wall work. |
| v1.2 | `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2` | `v1.2.0` | TB + Wall Stabilization; reconciliation, projection lineage, per-connection widths, and B3.23 acceptance. | Current accepted and locked baseline. Local PM.1 tag verification was unavailable. |
