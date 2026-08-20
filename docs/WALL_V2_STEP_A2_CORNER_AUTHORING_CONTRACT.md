# Wall v2 Step A2: corner-authoring contract (retired)

## Superseded orientation model

Step A2 proposed a local mixed-corner rule that would permit only one of
`WA/WB` and `WB/WA` at a panel corner. Product clarification in Step B1
supersedes that proposal: **there is no independent Wall corner-orientation
restriction**. Same-role and mixed-role adjacent Wall edges are all locally
allowed.

The physical red mouse-hole example is fully explained by reversing Wall A/B
relative to a complete TB connection between the same two panels. The corrected
panel-pair rule prevents that reversal. Consequently no residual physical case
requires `allowedMixedCornerOrientation`, and that input and its proposed
corner service are retired rather than preserved as redundant restrictions.

## Replacement service boundary

The future Wall-owned domain service resolves the TB orientation between the
two candidate Wall panels, independent of which source edges carry TB or Wall.
It then offers both Wall orientations when there is no TB orientation, only the
matching orientation when complete TB evidence is consistent, and none when
complete TB evidence is contradictory. The complete contract is in
`WALL_V2_STEP_B1_TB_ROLE_INHERITANCE_CONTRACT.md`.

Corner topology remains useful evidence that canonical traversal is stable
under winding and rigid transforms, but it does not determine Wall roles.

## Unchanged boundaries

This retirement adds no production Wall generator, authoring workflow, toolbar
button, or persistence. It changes no TB/S geometry, generic ownership,
`panelComposer`, authority/defaults, `FinalGeometry`, manufacturing, or
snapshot/history behavior.
