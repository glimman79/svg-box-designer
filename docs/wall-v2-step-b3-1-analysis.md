# Wall v2 Step B3.1 analysis evidence

## Apply failure

The production call order is:

1. the Apply button calls `applyPanelPaths`;
2. automatic TB/S dimensions are recalculated;
3. `validateGeometryAuthoring` and `validateWallAuthoringForApply` validate authored state;
4. `buildGeneratedTBGeometryItems`, `buildGeneratedWGeometryItems`, and `buildGeneratedSGeometryItems` create the raw batch;
5. `buildGeneratedWGeometryItems` delegates to `buildGeneratedFingerJointGeometryItems(..., 'W')`, which finishes both W panel items, profile groups, profiles, taps, and source relationships;
6. `selectGeneratedGeometryAuthority` calls `assembleGeneratedGeometryDiagnostics` before selecting or packaging authority;
7. assembly groups profiles by `generatorType`, looks up the W contributor, and calls its `adaptProfiles` function;
8. `defaultPanelContributorRegistry` has deliberately registered W, but points both TB and W to `adaptTBProfilesToPanelContributions`;
9. that legacy alias enters `adaptTBProfilesToShadowContributions`, whose first condition throws unless `profile.generatorType === 'TB'`.

Thus authority selection never returns. `packageComposedPanelGeometry`, `buildFinalGeometry`, manufacturing preparation, and React's `setGeneratedGeometryItems` are not reached. Raw W generation has completed in memory, but no authoritative W geometry is committed or visibly applied.

The throwing adapter accepts the neutral `GeneratedProfile[]` type and emits neutral `PanelReplacedEdgeContribution[]`. Its implementation uses only neutral profile identity, traversal, attachments, ordered elements, projections, and tap metadata after the assertion. Therefore the evidence classifies this as generic finger-joint adaptation with a stale TB-only assertion and legacy name (classification B), coupled with an intentionally registered but incorrectly wired W dispatch entry (classification D as the route, not a missing registration). The smallest B3.2 scope is to provide/register a TB/W-capable finger-joint adapter (or safely generalize this adapter) while preserving the S adapter and contributor registry contracts.

The reproduced W profile has `generatorType: W`, operation `operation:W:W1`, its actual panel/source-edge IDs, `BOUNDARY_PROFILE` group identity, role-effective attachment endpoints, source-edge direction, ordered profile elements/projections/taps, and generator source relationships. An equivalent TB run differs only in intended tool identity: `TB`, `operation:TB:TB1`, TB connection/profile IDs, and relationship operation identity. Both otherwise come from the same kernel. The incorrect divergence is only at the adapter assertion.

The B3 scripts all alias the same geometry-equivalence diagnostic. That diagnostic directly calls the TB and W builders and compares output after globally replacing W identity with TB identity. It never calls `selectGeneratedGeometryAuthority`, `assembleGeneratedGeometryDiagnostics`, the registry, or the throwing adapter; consequently the scripts named native production, coherent batch, mixed authority, FinalGeometry, manufacturing, and restore do not exercise what their names imply. This is the exact Apply-path evidence gap.

## W3 lower-panel failure

The UI call order is `svgModel.edges.map` -> the rendered `.edge-hitbox` closure carrying `edge.id` -> `assignSelectedLabelToEdge(edge.id)` -> `authorWallEdge` -> provisional complementary W role -> `normalizeWallConnection` -> source-edge-to-panel mapping in `assignmentsForConnection` -> `wallRequiredRole` -> `resolveTBRoleForPanel` for both W endpoint panels -> `requiredFirstWallRole` -> error.

The realistic diagnostic completes W1 (top/left), completes W2 (top/right), observes automatic W3 creation and selection, authors W3-A on `left-lower`, then sends the production command for clicked `lower-left`. Production resolves that edge uniquely to `lower`; W3-A remains on `left`; provisional W3-B resolves to `lower`; selection and normalization remain W3. There are no duplicate source-edge owners, generated edges, stale assignments, or placeholder-state errors in the reproduction.

For lower, TB1 (top A/center B), TB2 (left B/center A), and TB3 (right B/center A) are complete but ignored because they have no lower assignment. TB4 is complete (lower B/center A), structurally valid, and alone is counted. The lower result is `TB_ROLE_B`, not ambiguous. The left result is independently `TB_ROLE_B` from TB2. `requiredFirstWallRole` rejects equal non-empty endpoint roles, so B/B becomes `INVALID`; the public error combines “ambiguous or incompatible.” The failure therefore is not wrong click resolution and is not ambiguous evidence on lower. It is the current global per-panel compatibility rule rejecting the legitimate same-role wall-to-wall topology.

The B2.6 fixture covered top A with left B and top A with right B, unique simple IDs, and direct production authoring. It asserted A/B success and separately manufactured A+B ambiguity on one panel. It did not include a lower panel, W3's auto-created transition, or the real same-role B/B wall-to-wall topology. The smallest B3.2 scope is a focused semantic correction to the W endpoint-orientation rule for two consistently resolved same TB roles, with regression coverage for B/B corners; panel lookup and placeholder/session behavior should remain unchanged. Product intent should explicitly confirm how equal A/A and B/B determine W orientation before implementation.

## Independence and readiness

The bugs are independent: Apply fails in generated-profile contribution adaptation after authoring; W3 fails during authoring normalization before Apply. Both exact causes are identified. B3.2 can proceed as two focused changes, subject only to confirming the desired deterministic orientation for equal-role endpoint panels.
