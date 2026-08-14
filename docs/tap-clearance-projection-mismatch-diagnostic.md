# Tap Clearance projection-mismatch diagnostic

The canonical command is `npm run diagnose:tap-clearance-projection-mismatch`. The former
`npm run diagnose:tap-clearance-production` command remains a temporary convenience alias.

## Contract under test

This is synthetic negative projection-contract coverage. Given a `GeneratedProfile` projection
whose coordinates do not exist in the provided `FinalContour`, Tap Clearance must not guess or
assign semantic ownership to a merely similar or translated segment. A zero projected count is
therefore the expected result for a mismatch, not evidence that production assembly lost a profile.

The fixture directly creates a FinalGeometry-shaped object. It constructs profile projections and
final-contour coordinates independently: for example, `basePoints(40)` supplies the projection
contour while `basePoints(140)` supplies its synthetic final contour. The deliberate +100
translation—and the center-B +80 translation—tests rejection of unrelated geometry; neither is an
actual production coordinate transform.

The fixture does **not** exercise the TB generator, S generator, generated `PANEL_PATH` creation,
`GeneratedGeometryItem` assembly, `createGeneratedGeometrySnapshot`, or `buildFinalGeometry`
provenance construction. It also does not supply production `segmentProfileIds`, `segmentTapIds`,
or `segmentTapRoles` on its synthetic contours.

For each profile the diagnostic reports eligible and projected counts, the expected `match` or
`mismatch` relation, and a result. Translated fixtures must have eligible elements and project zero
segments (`EXPECTED_MISMATCH`). Matching controls must project exactly every eligible segment and
then allow normal Tap Clearance compensation (`PASS`), while retaining the existing Geometry
Services safe-fallback observation. The test also retains tap-side-start/tap-side-end eligibility,
multi-profile mask union, clone identity/order, and zero-valued later-stage checks.

## Separate architectural question

`buildFinalGeometry` currently selects the last panel-boundary replacement for a panel while
generated profile shadows can be flattened from multiple generated items. This observation is
neither classified as fixed nor broken here and this synthetic fixture is not evidence either way.
It **requires real generator-to-FinalGeometry reproduction before classification**.
