# Drawing inference cleanup — Step 1 regression report

## Baseline

- HEAD before work: `2071ec5b2005503d48c4442df0835223505e2981`.
- Commit title: `Fix angular reference snap selection and guides (#473)`.
- Working tree before work: clean.

## Tests added and real pipeline coverage

`tests/drawing-inference-product-regressions.test.mjs` starts with client-pointer
input and invokes the production angular proposal, candidate collector, snap
acquisition/hysteresis arbitration, Line placement resolution, final relation
state, presentation input, and (for click freeze) resolved commit boundary.
It does not mount `DrawingWorkspace`, dispatch browser pointer events, or inspect
rendered SVG/CSS, so this is the highest practical non-browser integration
boundary and is not browser acceptance coverage.

The suite locks these scenarios:

- false angular presentation for acquired Perpendicular geometry at 8°, 18°,
  and 20°;
- true exact angular presentation at 22.5°, 45°, 67.5°, 90°, and reversed 225°;
- Vertical + Y reference and Horizontal + X reference, both with and without a
  compatible Perpendicular candidate;
- X and Y reference intersections with 22.5°, 45°, and 67.5° rays;
- compatible Endpoint + angular, incompatible Endpoint versus angular, and
  Endpoint + angular + reference;
- angular + X reference + Y reference;
- Ctrl suppression after an acquired hysteresis state;
- click freezing of point, endpoint identity, and semantic placement state;
- endpoint acquisition at 0.5x and 4x CTM scales.

Acquisition assertions inspect screen distances and acquired channels. Separate
truth assertions inspect the final model-space point with a `1e-9` geometric
tolerance; acquisition radius is never used as proof of final relation truth.

## Current result

### Currently passing

- Exact positive angular cases, including a reversed direction.
- Vertical + Y reference without Perpendicular: **PASS**.
- Horizontal + X reference without Perpendicular: **PASS**.
- Vertical + Y reference with Perpendicular available: **PASS**.
- Horizontal + X reference with Perpendicular available: **PASS**.
- All six requested angular + single-reference combinations.
- Compatible Endpoint + angular, incompatible Endpoint versus angular, and the
  Endpoint + angular + reference three-way case.
- Ctrl clears current and retained channels and returns the raw point.
- Accepted click geometry and endpoint identity are frozen.
- Endpoint acquisition remains screen-space stable at the tested CTMs.

### Currently failing

1. **8° arbitrary/Perpendicular: FAIL.** Geometry and Perpendicular identity are
   correct, and `snappedAngleDegrees` is null, but `snapActive` is true. Required:
   angular presentation false. `resolveLineEffectivePoint`'s unconditional
   Perpendicular branch sets the generic presentation flag true.
2. **18° arbitrary/Perpendicular: FAIL.** Same actual result, requirement, and
   responsible branch.
3. **20° arbitrary/Perpendicular: FAIL.** Same actual result, requirement, and
   responsible branch.
4. **Angular + X + Y: FAIL.** Final point and angular relation are correct, but
   one reference channel is null. Required: both reference channels remain.
   `resolveDrawingSnap` calls `chooseComposedReference`, which selects one axis
   whenever constructed references are present.

### Three-way result

- Endpoint + Angular + Reference: **PASS**.
- Angular + X + Y: **FAIL**.

### Conflict priority result

The current snap engine uses a fixed, premature type ordering (Endpoint, Line,
Perpendicular, alignment) for position authority. It does not use relation
count, so two weaker reference channels do not outvote Endpoint. The fixed type
ordering can nevertheless discard compatible information, most visibly through
`chooseComposedReference`. The test boundary can express and passes Endpoint
versus incompatible angular direction. Existing focused suites retain H/V over
an incompatible Perpendicular and Perpendicular over generic angular behavior;
Step 1 does not introduce a new scoring or arbitration mechanism.

## Scenarios not yet cleanly expressible at this boundary

- Existing shared topology authority requires document/topology setup beyond
  candidate acquisition; existing topology suites remain authoritative.
- Midpoint and Parallel are not implemented and were not added.
- A durable independent `line-body relation active` presentation channel does
  not exist, so Line-body + angular can only be observed as position plus
  angular state, not as both named final relations.
- Reference, angular/reference target, and Perpendicular zoom coverage need a
  workspace SVG CTM/event harness to reproduce actual browser coordinates
  without fabricating browser state. Endpoint CTM stability is covered here.
- Delayed React state scheduling after click requires a mounted workspace. The
  production resolved-click boundary is covered, but delayed browser events/React
  scheduling is not.

## Stale tests

No existing test was changed or removed. In particular, solver, topology,
constraint persistence, and History tests are untouched.

## Production code

No production code was changed. There are no architectural production changes
and no testability hooks.

## Next core-refactor boundary

The next controlled step must replace the overloaded meaning of
`LineToolInteraction.snapActive`, the unconditional Perpendicular presentation
assignment in `resolveLineEffectivePoint`, and the single-axis collapse in
`chooseComposedReference`. It must also replace premature type-only suppression
inside `resolveDrawingSnap` with compatibility-first conflict arbitration while
preserving the resolved-click boundary. This report does not implement that work.
