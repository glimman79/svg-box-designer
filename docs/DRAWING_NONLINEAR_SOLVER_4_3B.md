# Stage 4.3B — Nonlinear tier-preserving projection

## Current acceptance status

**ACCEPTED** — Mikael confirms Stage 4, including 4.2 Coincidence and 4.3
performance, after manual browser tests on main `4135cd2d8e13a8fb21902a672367438c8b7657f1`.
This supersedes the pending-acceptance status at report creation. The original
investigation, measurements, validation and proposed manual checklist below are
preserved as historical evidence; no new per-scenario results or timings are inferred.
R1–R3, R5, the 14 baseline failures and the empty Undo-step issue remain open.
Stages 5–6 remain **NOT STARTED**.

## Original implementation report (historical)


Status: prepared for review; Stage 4, 4.2 and 4.3 are NOT ACCEPTED. No merge is
included. Stages 5/6 and the tangential Arc drag empty Undo-step issue are unchanged.

## Baseline and scope

Live GitHub `main` and clean local HEAD were both
`8722577e2f968aebf82519b8dd7a91c20120a82f`, verified before edits using the GitHub
connector's live commits/main response. Initial branch: `work`; remote:
`https://github.com/glimman79/svg-box-designer.git`. Shell Git still failed through
its unreachable proxy on port 8080. No proxy or Git configuration was changed.
Implementation branch: `codex/4-3b-nonlinear-tier-projection`.

Read the collaboration rules (especially §5), central project documents,
Architecture.md, Stage 4.2 evidence and relevant solver/Dimension documentation and
code. The existing Stage 4.2 complete addressed-component closure is preserved.

## Experiment and confirmed mechanism

`optimizeTier` linearizes hard and semantic equations together with completed
objective Jacobians. Completed rows have zero delta RHS: the step should retain
their attained residual vectors, including nonzero optima. Previously,
`projectSemanticSubspace` restored only hard and semantic equations. On nonlinear
geometry that correction moved off the completed-tier manifold. The subsequent
tier acceptance check rejected the corrected trial, forcing repeated line-search
reductions, projections, numerical Jacobians and lower-tier iterations.

The controlled experiment changes only that retraction: include completed objective
rows and subtract their attained vectors at the current tier iterate. Hard and
semantic rows still target zero. Continuation seeds still project only hard and
semantic equations. Targets exist only during a trial correction; they are neither
persistent Constraints nor new primary objectives. Remaining feasible freedoms can
still satisfy secondary, geometric-continuation and canonical least-change tiers.

An initially tested variant also triggered projection on completed-tier drift when
hard equations were already feasible. It added unnecessary work to the linear Circle
control and produced a 710–778 ms sampled tail with a driving Length. That variant
was discarded. The chosen correction retains the original hard/semantic projection
trigger and the independent acceptance/verification checks.

The accepted experiment substantially reduces both time and evaluation counts and
improves the achieved Line-vector objective. No iteration cap, convergence constant,
constraint tolerance, component closure, finite-domain verification, canonical
representation or pointer-update policy changes. Completed projection rows use the
existing `ITERATION_CONVERGENCE_MM` (1e-12); hard acceptance remains 1e-7 mm. The
production change is confined to `drawingConstraintSolver.ts`.

## Measurement method

Node v24.19.0; same managed Linux environment, AMD EPYC 9V74, three exposed CPUs.
Measurements use separately compiled copies of the exact baseline and production
solver, serially on the same machine. Timing copies contain no counters. Separate
instrumented copies count **all evaluateSystem calls**, numerical `jacobianAt`
constructions, projection passes, tier iterations and trial line-search attempts.
No diagnostic instrumentation is committed to production.

Fixtures follow `drawing-coincidence-drag.test.mjs`: Arc center (0,0), P1 (100,0),
P2 (0,100), radius 100, CCW; remote Line endpoint (120,140); distinct coincident
endpoint (0,100), or a shared P2 identity. Point-on-Arc starts at (100/√2,100/√2).
Circle control uses center (0,100), radius 30. Driving fixtures add Radius=100 or
the Line's initial aligned Length. The two-Arc fixture joins the other Line endpoint
to a second Arc with center (120,40), P1 (220,40), P2 (120,140), radius 100, CCW.
Both Line endpoint orientations are exercised. The grab is the midpoint.

Every solve starts from the same recursively frozen drag-start document, with total
deltas (12,9), (-8,15), (1,-3) mm. The input is checked unchanged; each output is
independently verified for persistent Constraints, driving Dimensions, intrinsic
radial equations and valid entity domains. Displacement, primary/secondary residuals
and geometry are recorded. First round: three warmups plus nine timed solves per
fixture; repeat round: three warmups plus 30 timed solves (ten per delta). Sampled
p95 uses the nearest-rank observation, not a statistical population guarantee.
These are equivalent deterministic fixtures, not a claim to reproduce the exact
Stage 4.3A hardware, pointer positions or timing values.

## Before/after results

Repeat round; milliseconds per pointer update. Each row has 30 timed samples.

| Fixture | Attached Line end | Baseline median / p95 | Corrected median / p95 |
| --- | --- | ---: | ---: |
| Free Line | start | 0.54 / 1.03 | 0.39 / 0.70 |
| Free Line | end | 0.55 / 1.12 | 0.39 / 0.69 |
| Shared Arc P2 | start | 155.40 / 235.46 | 3.75 / 5.96 |
| Shared Arc P2 | end | 143.52 / 261.61 | 3.15 / 5.00 |
| Arc P2 point-point | start | 685.12 / 978.88 | 3.53 / 4.51 |
| Arc P2 point-point | end | 634.77 / 809.54 | 3.76 / 6.01 |
| Circle center point-point | start | 0.48 / 0.73 | 0.73 / 1.11 |
| Circle center point-point | end | 0.45 / 0.76 | 0.75 / 1.14 |
| Arc point-curve | start | 322.83 / 652.62 | 5.05 / 8.67 |
| Arc point-curve | end | 342.84 / 639.18 | 4.20 / 5.86 |
| Arc + driving Radius | start | 123.46 / 316.33 | 3.11 / 4.67 |
| Arc + driving Radius | end | 121.48 / 319.12 | 3.01 / 5.15 |
| Arc + driving Length | start | 496.73 / 916.21 | 4.61 / 11.81 |
| Arc + driving Length | end | 467.88 / 853.44 | 4.52 / 11.25 |
| Shared Line endpoint | start | 0.24 / 0.36 | 0.44 / 0.75 |
| Shared Line endpoint | end | 0.23 / 0.33 | 0.43 / 0.72 |
| Line joining two Arcs | start | 25.64 / 174.77 | 5.78 / 11.39 |
| Line joining two Arcs | end | 26.52 / 185.89 | 4.47 / 6.03 |

The original slow Arc cases improve in both orientations in both independent rounds.
First-round attached-end medians (baseline → experiment): shared P2 126.82 → 3.76 ms,
point-point 640.47 → 4.37 ms, point-curve 330.21 → 4.75 ms. Repeat-round Arc
medians are 3.01–5.78 ms and sampled p95 values are 4.51–11.81 ms, including
Dimensions and the two-Arc fixture. This small increase in connection complexity
does not introduce a catastrophic cost increase.

All 54 distinct repeat-round outputs (18 fixtures × three deltas) are hard-valid.
Worst hard/intrinsic residual: baseline 9.999e-8 mm; corrected 7.873e-8 mm, both
within the unchanged 1e-7 mm tolerance. Corrected midpoint displacement differs from
requested (12,9), (-8,15), or (1,-3) by at most 8.993e-9 mm. Corrected Line-vector
residual is at most 5.891e-9 mm; the baseline reaches 13.293 mm in the Length fixture.
Thus the speedup neither returns an unchanged preview nor trades away pointer intent
or hard validity. Flexible connected Arc poses can differ because lower-tier objectives
now actually converge. Raw measurements retain coordinates/radii and per-delta residuals.

### Solver work

Representative update: delta (12,9) mm. Entries show baseline → corrected. Tier tuples
are primary / secondary / least; the Line body fixture has no geometric tier.
`J` counts numerical Jacobian constructions; system counts include differentiation and
trial evaluation, not just accepted iterates. The separate timing copies exclude counters.

| Fixture / attached end | Variables / hard rows | Tier iterations | Projection iterations | J | System evaluations | Trial attempts |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Free Line / start | 4 / 0 | 2/2/1 → 2/2/1 | 0 → 0 | 5 → 5 | 60 → 60 | 14 → 14 |
| Free Line / end | 4 / 0 | 2/2/1 → 2/2/1 | 0 → 0 | 5 → 5 | 60 → 60 | 14 → 14 |
| Shared Arc P2 / start | 9 / 2 | 4/102/46 → 4/3/4 | 1,659 → 11 | 1,811 → 22 | 36,914 → 462 | 845 → 32 |
| Shared Arc P2 / end | 9 / 2 | 4/102/46 → 4/3/4 | 1,655 → 11 | 1,807 → 22 | 36,832 → 462 | 843 → 32 |
| Arc P2 point-point / start | 11 / 4 | 4/120/120 → 4/4/4 | 5,123 → 14 | 5,367 → 26 | 131,127 → 634 | 2,562 → 21 |
| Arc P2 point-point / end | 11 / 4 | 4/120/120 → 4/4/4 | 5,123 → 14 | 5,367 → 26 | 131,127 → 634 | 2,562 → 21 |
| Circle center point-point / start | 7 / 2 | 2/2/1 → 2/2/1 | 0 → 0 | 5 → 5 | 90 → 90 | 14 → 14 |
| Circle center point-point / end | 7 / 2 | 2/2/1 → 2/2/1 | 0 → 0 | 5 → 5 | 102 → 102 | 26 → 26 |
| Arc point-curve / start | 11 / 3 | 3/120/113 → 3/4/10 | 3,785 → 13 | 4,021 → 30 | 98,152 → 742 | 1,883 → 38 |
| Arc point-curve / end | 11 / 3 | 3/120/113 → 3/4/10 | 3,785 → 13 | 4,021 → 30 | 98,152 → 742 | 1,883 → 38 |
| Arc + driving Radius / start | 9 / 3 | 4/33/59 → 4/3/4 | 940 → 12 | 1,036 → 23 | 21,105 → 470 | 480 → 20 |
| Arc + driving Radius / end | 9 / 3 | 4/33/59 → 4/3/4 | 940 → 12 | 1,036 → 23 | 21,105 → 470 | 480 → 20 |
| Arc + driving Length / start | 11 / 5 | 4/120/10 → 4/4/4 | 2,865 → 14 | 2,999 → 26 | 73,185 → 634 | 1,342 → 21 |
| Arc + driving Length / end | 11 / 5 | 4/120/10 → 4/4/4 | 2,865 → 14 | 2,999 → 26 | 73,185 → 634 | 1,342 → 21 |
| Shared Line endpoint / start | 4 / 0 | 2/2/1 → 2/2/1 | 0 → 0 | 5 → 5 | 60 → 60 | 14 → 14 |
| Shared Line endpoint / end | 4 / 0 | 2/2/1 → 2/2/1 | 0 → 0 | 5 → 5 | 60 → 60 | 14 → 14 |
| Line joining two Arcs / start | 14 / 4 | 4/2/62 → 4/2/4 | 641 → 9 | 709 → 19 | 21,542 → 580 | 339 → 19 |
| Line joining two Arcs / end | 14 / 4 | 4/2/62 → 4/2/4 | 641 → 9 | 709 → 19 | 21,542 → 580 | 339 → 19 |

Across all sampled deltas the corrected maximum is 742 system evaluations, 30
Jacobians, 16 projection iterations, four secondary iterations and ten least-tier
iterations. Baseline maxima are 131,127, 5,367, 5,123, 120 and 120 respectively.
Work is reduced across the full solve rather than moved into another projection stage.
The Free Line, Line connection and Circle controls retain exactly the same work counts.

### Control timing and Chromium

The repeat round gives Circle/Line controls different amounts of JIT warmup because
the old Arc solver runs far more evaluations. A separate control check uses 400 warmups
per version/fixture, then 300 alternating before/after measurements on the same frozen
documents and deltas. Median / sampled p95, milliseconds:

| Control / attached end | Baseline | Corrected |
| --- | ---: | ---: |
| free / start | 0.253 / 0.411 | 0.252 / 0.450 |
| free / end | 0.246 / 0.537 | 0.256 / 0.486 |
| circle / start | 0.349 / 0.494 | 0.349 / 0.529 |
| circle / end | 0.361 / 0.579 | 0.356 / 0.512 |
| line / start | 0.211 / 0.319 | 0.212 / 0.326 |
| line / end | 0.211 / 0.326 | 0.212 / 0.334 |

With equal warmup the Free Line, Circle and Line controls show no meaningful regression;
their evaluation counts are identical. Chromium independently shows unchanged Line/Circle
point-point median solver time (about 0.7–0.9 ms).

For the browser comparison, the same production-UI Coincidence script runs serially
against baseline and corrected Vite servers on this machine. A temporary Playwright
response wrapper times only `solveDrawingGeometricIntent` with `performance.now()`;
it changes no solver logic or UI state. All 10 scenarios pass on each version. Values
are elapsed time inside the solver, excluding SVG/React rendering and IPC; they are not
profiler-isolated CPU measurements. Each point-point row has 22 calls; curve rows 12.

| Chromium fixture / attached end | Baseline solver median / p95 | Corrected solver median / p95 |
| --- | ---: | ---: |
| manual arc point-point Coincidence at Line start | 304.1 / 566.8 | 5.3 / 10.6 |
| manual arc point-point Coincidence at Line end | 302.5 / 571.8 | 5.4 / 10.2 |
| arc point-curve at Line start | 75.5 / 738.4 | 7.6 / 16.3 |
| arc point-curve at Line end | 55.1 / 649.4 | 8.2 / 17.9 |

Browser Arc point-curve sampled tails reach 16.3–17.9 ms, despite interactive medians;
the approximately 16 ms goal is not guaranteed for every browser update. The first
single-move Arc point-point drag, measured from Playwright mouse dispatch through the
next animation frame, improves from about 491–512 ms to 50–58 ms. That larger number
includes browser event scheduling, IPC, application/render work and frame waiting,
and must not be presented as solver CPU time or pure rendering time. It also shows
that sub-16 ms solver medians do not imply a sub-16 ms complete browser round trip.
No pointer events are skipped or deferred by the production correction.

## Correctness and regression evidence

- Existing Stage 4.2 numerical cases cover first/repeated/reversed preview, shared
  identity, separate point-point identities, point-on-Arc/Circle/Line sliding, both
  endpoint orders, fixed supports, driving circular size, component closure at both
  ends, immutable input and History. All pass.
- Twelve added numerical cases cover the corrected hierarchy: six check bounded
  objective evaluation work, an attained nonzero primary residual, preserved Line
  vector and geometric radius objective taking precedence over canonical stay;
  six cover driving Radius, driving Length and a Line joining two Arcs, in both
  orientations and across three deltas. All 36 defined Coincidence suite cases pass.
- The six new hierarchy cases were also run against the exact baseline compiled
  solver: that run fails; the production run passes. The before/after work and
  residual tables document the mechanism independently of wall-clock timing.
- All 67 Drawing/d2/CAD npm scripts: **baseline 53 PASS / 14 FAIL; production
  53 PASS / the identical 14 FAIL**. Existing Arc manipulation, Circle, Dimensions,
  component solver, constrained mobility, topology, pointer and History suites pass.
- TypeScript and Vite production build (`npm run build`): PASS on both versions.
- Unmodified production-UI Chromium suites: **21/21 Arc** and **10/10 Coincidence**
  scenarios PASS. They include first preview, commit identity, repeated/reversed
  gestures, constraints, driving Radius and 2R endpoint limit, fixed pivots,
  CW/CCW, major/minor, cancellation/capture loss, Undo/Redo, zoom and Circle/Line
  controls. Automated Chromium is supporting evidence, not user acceptance.

The unchanged failures are `test:d2-1b`, `test:d2-1c`, `test:d2-1d`, `test:d2-2a`,
`test:d2-2b`, `test:d2-3`, `test:d2-3a`, `test:drawing-primary-mousedown`,
`test:drawing-box-selection`, `test:drawing-alignment-snap`,
`test:drawing-angular-reference`, `test:drawing-line-authority`,
`test:drawing-live-direction-coexistence`, and
`test:drawing-endpoint-direction-inference`. They were rerun on the exact baseline;
none is introduced or repaired here.

Run numerical regressions with `npm run test:drawing-coincidence-drag`; other commands
and Chromium environment variables remain as documented in
[Stage 4.2 evidence](DRAWING_COINCIDENCE_DRAG_4_2.md).

## Risks and manual review after merge

The solver remains a local numerical hierarchy with its existing rank damping,
line-search and iteration limits. Small-component measurements do not establish
large-sketch or all degenerate-configuration performance. Existing R1–R3, R5 and
invalid-final-position policies remain unchanged; the 14 baseline script failures
remain open. No global optimizer, new model, persistence format, UI, history policy,
Arc workaround, Stage 5/6 work or acceptance change is included.

After a separately approved merge:

1. Drag a free Line, then Lines sharing Arc P2 at each Line end. Confirm responsive
   first preview, pointer tracking and connected geometry.
2. Repeat with manually created point-point Coincidence to Arc P2 and Circle center,
   then point-on-Arc/Circle. Curve relations retain sliding; shared IDs remain shared.
3. Add driving Radius and Length; check connected dragging and constrained mobility.
4. Recheck Arc center translation, radial body grip, P1/P2 opposite-endpoint pivots,
   finite orientation, CW/CCW, major/minor, zoom and reverse dragging.
5. Check Escape, one-step commit, Undo and Redo. Record browser results before any
   decision about Stage 4/4.2/4.3 acceptance; retain the separate empty Undo-step issue.
