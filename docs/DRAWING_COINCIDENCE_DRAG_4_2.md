# Stage 4.2 — Coincidence drag component closure

## Current acceptance status

**ACCEPTED** — Mikael confirms Stage 4, including 4.2 Coincidence and 4.3
performance, after manual browser tests on main `4135cd2d8e13a8fb21902a672367438c8b7657f1`.
This supersedes the pending-acceptance status at report creation. The original
investigation, measurements, validation and proposed manual checklist below are
preserved as historical evidence; no new per-scenario results or timings are inferred.
R1–R3, R5, the 14 baseline failures and the empty Undo-step issue remain open.
Stages 5–6 remain **NOT STARTED**.

## Original implementation report (historical)


Status: fix prepared for review; Stage 4 is MERGED / NOT ACCEPTED. No merge or
acceptance is authorized by this report. Stages 5/6 remain NOT STARTED.

## Verified baseline

GitHub `main` and clean local HEAD were both
`830221e55a2216e57a728976c530d716ae7b923c` (merged PR #613), verified before edits.
Local initial branch: `work`; remote: `https://github.com/glimman79/svg-box-designer.git`.
The shell's `git ls-remote` could not reach its proxy; the GitHub connector's live
`/repos/glimman79/svg-box-designer/commits/main` response verified the exact SHA.
Work branch: `codex/4-2-coincidence-drag`.

Read the collaboration rules (including §5), central project documents, Architecture.md,
README.md, current entity/topology/constraint/interaction/history code, and the historical
Drawing Dimension architecture analysis. Several central documents still described the
Stage 3 disabled grips or #613 as open; this change corrects that status without granting
Stage 4 acceptance.

## Exact cause and interaction trace

1. `drawingCoincidentConstraint.ts:createCoincidentConstraint` preserves distinct
   SketchPoint IDs and stores two point-point equality equations. Direct authoring onto
   an endpoint instead shares its persistent SketchPoint. Coordinate equality alone
   does not imply shared topology.
2. `drawingConstraintAnalysis.ts:analyzeDrawingConstraints` correctly constructs
   components from hard equations. A free Line has independent endpoint components:
   `drawingEntityDefinition.ts:drawingEntityImplicitComponentPointIds` intentionally
   introduces no implicit coupling. Arc intrinsic radial equations connect its center,
   endpoints and radius. Coincidence correctly connects the attached endpoint's component.
3. `drawingPointerArbitration.ts:resolveDrawingPointerOwner` and
   `drawingDirectManipulation.ts:createLineBodyDragTarget` create a finite Line-body
   grip with grab offset and segment parameter. They do not convert it to an Arc grip.
4. `drawingDirectManipulation.ts:solveDrawingDragCandidate`, Line branch near line 384,
   calls `solveDrawingGeometricIntent` with the Line **start** X as seed and both endpoint
   axes as additional variables. The primary objective follows the grabbed point;
   the secondary objective preserves the original Line vector when feasible.
5. Before the fix, `drawingConstraintSolver.ts:solveDrawingGeometricIntent` (baseline
   lines 436–452) collected hard equations and component variables **only from the seed's
   component**, then appended the additional endpoint axes. If Coincidence was at the
   other end, that endpoint moved without its Coincidence equations or the connected
   geometry's variables. Final verification also used only the seed's constraint IDs,
   so an invalid Coincidence candidate could pass. Shared Arc endpoints could instead
   fail entity-domain/intrinsic verification and retain the previous preview.
6. `DrawingWorkspace.tsx` near line 982 correctly derives each preview from
   `geometryDrag.startDocument` and total pointer delta. `finishGeometryDrag` near line
   1161 commits the candidate once. `drawingHistory.ts:transactDrawingDocument` stores
   that snapshot without re-solving it. Thus the omission is immediately visible and
   can persist in History. A later gesture that includes the missing component can
   project the violated relation back into place, explaining the apparent delayed jump.

The `point-curve` special case in `solveDrawingComponentDrag` near line 310 is **not the
cause**: the normal production finite Line-body grip takes the geometric-intent branch.
That older special case and Arc grip behavior were left unchanged.

## Fix and preserved semantics

The shared `solveDrawingGeometricIntent` now gathers and deduplicates the complete
components of all addressed variables (seed, additional axes/scalars, fixed variables
and exact targets). Equation assembly, optimization columns and final verification use
the same union. This is transient interaction scope, not a model/topology change.

Only `drawingConstraintSolver.ts` changes production behavior. No Arc-specific condition,
SketchPoint merging, new solver policy, relaxed tolerance, post-commit repair or deferred
correction was added. Single-component Arc grip solving is preserved. Radius Dimensions
still lock Arc body radius. Point-point imposes two equalities; point-curve imposes one
radial/finite-curve relation and retains sliding freedom. Line support uses the existing
`point-linear-support` variant, also retaining its different DOF.

## Regression evidence

The new test was run against unchanged baseline production code before the fix, and
its final form was rerun against a separate exact baseline snapshot afterwards.
Chromium uses production authoring, selection, the Constraints panel, pointer events,
Escape and Undo/Redo; no documents or React state are injected.

| Check | Baseline | Fixed |
| --- | --- | --- |
| New numerical Coincidence suite, final 24 cases | 14 PASS / 10 FAIL | 24 PASS |
| New manual point-point Chromium cases, Line–Arc/Line/Circle, both endpoint orders | 3 PASS / 3 FAIL | 6 PASS |
| New point-curve Chromium cases, Arc/Circle, both endpoint orders | 2 PASS / 2 FAIL | 4 PASS |
| Existing Stage 4 Arc Chromium suite | 21 PASS | 21 PASS |
| Existing Drawing/d2/CAD scripts | 52 PASS / 14 FAIL (66) | same 52 PASS / 14 FAIL |
| New regression npm script | absent | PASS (67 scripts total: 53 PASS / 14 FAIL) |
| TypeScript + production build (`npm run build`) | PASS | PASS |

Concrete before-fix Chromium evidence: dragging the Line whose end was connected manually
to Arc P2 moved its endpoint to approximately `(35.000021, 118.999987)` while P2 stayed
at `(20.000007, 109.999986)` in the **first preview**. The fixed preview and release remain
coincident. Line–Line and Line–Circle reproduced the same endpoint-order failure.
For Point-on-Arc, baseline moved the Line endpoint to `(82.710698, 78.710654)` while its
support remained approximately center `(0,0)`, radius `100`, violating the curve equation.

The 24 numerical cases cover shared topology and distinct point identities, point-point,
point-on-Arc/Circle/Line, both endpoint orders, first and repeated previews, reversed
successive drags, zero delta, immutable drag-start input, one-step commit, Undo/Redo,
constraints on both disconnected endpoints, fixed supports, driving circular size,
and the one-DOF rank difference between point-point and point-curve.
Hard feasibility assertions use the existing production verifier/tolerance. Soft pointer
positions use 1e-4 mm test comparison, reflecting the existing numerical interaction
optimum; no production tolerance was changed.

The 21 existing Arc browser scenarios cover CW/CCW, major/minor body motion, exact center
and endpoint semantics, fixed Radius and 2R endpoint limit, selection, pointer frequency,
reversal, Escape, capture loss, shared Line/Circle topology, zoom, Circle behavior and
constrained Line translation. The 10 new Chromium scenarios check live first preview,
commit identity, repeated/reversed gestures, cancellation and Undo/Redo.

Unchanged failing scripts:

- `test:d2-1b`, `test:d2-1c`, `test:d2-1d`
- `test:d2-2a`, `test:d2-2b`, `test:d2-3`, `test:d2-3a`
- `test:drawing-primary-mousedown`, `test:drawing-box-selection`
- `test:drawing-alignment-snap`, `test:drawing-angular-reference`
- `test:drawing-line-authority`, `test:drawing-live-direction-coexistence`
- `test:drawing-endpoint-direction-inference`

Run the new numerical suite with `npm run test:drawing-coincidence-drag`.
For Chromium, start `npm run dev -- --host 127.0.0.1`, install Playwright and Chromium,
then run `node tests/drawing-coincidence-drag.browser.cjs` and
`node tests/drawing-arc-direct-manipulation.browser.cjs`. `CHROMIUM_PATH` overrides the
browser path (default `/usr/bin/chromium`); `COINCIDENCE_BROWSER_URL` and
`COINCIDENCE_BROWSER_OUTPUT` select the URL and JSON evidence path. The existing Arc
suite uses its own `ARC_BROWSER_URL` and `ARC_BROWSER_OUTPUT` variables.

Browser fixture notes: the Line tool may stay active after rapid reactivation; Escape
explicitly returns to Select before inspecting point DOM. Arc P3 acquisition is hovered
through a rendered animation frame and its persisted curve marker is required before
running the curve drag assertion. These are test setup requirements, not production fixes.

## Remaining issues and acceptance

- Stage 4 is NOT ACCEPTED; automated Chromium is supporting evidence, not Mikael's
  manual browser acceptance. This PR must not be merged without separate approval.
- The known tangential Arc body drag empty Undo-step issue remains tracked and unfixed.
- Existing R1 (absolute tolerance at very small radii), R2 (retain-last-valid at invalid
  final pointer position), R3 (model/Circle size thresholds) and R5 (Drawing Save/Reload
  absent) remain unchanged. Extreme scale/offset evidence remains numerical, not new
  Chromium verification.
- This narrow change increases solve scope only when an interaction addresses several
  equation components; large-component performance was not benchmarked.
- The 14 baseline regression failures remain open. No Stage 5/6 feature was implemented.

## Manual acceptance instructions

1. Create an Arc. Draw a Line directly from P2; drag its body immediately. Check the
   connection throughout preview and release, then Undo/Redo.
2. Create a separate Line **toward** P2 (the attached point is its end). Use Ctrl while
   authoring to avoid automatic sharing, then select that endpoint plus Arc P2 and
   apply Constraints → Coincidence. Drag the Line body immediately: no separation,
   delayed update or second-drag jump is allowed. Repeat with the Line drawn away from
   P2 (attached start), reverse direction, Escape, Undo and Redo.
3. Repeat manual endpoint Coincidence against a Line endpoint and Circle center.
4. For point-curve, create a Line first. Create a Circle with its circumference acquired
   through the Line endpoint, or an Arc with P3 acquired through that endpoint. Verify
   the Coincidence marker exists. Drag the Line immediately, repeatedly and backwards;
   the endpoint stays on the finite Arc/Circle while retaining sliding freedom. Also
   check point-on-Line support Coincidence. Do not expect endpoint pinning from a curve
   relation.
5. Recheck Arc center translation, radial body motion and P1/P2 exact opposite pivot,
   CW/CCW and major/minor cases, zoom, constraints and Escape. Add a driving Radius:
   body radius must remain locked while allowed center/endpoint motion still works.
6. Keep the tangential-drag empty Undo issue recorded separately. Report manual results
   before any decision about Stage 4 acceptance; this change does not mark it accepted.
