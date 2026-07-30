# Tap Clearance architecture and root-cause analysis

## Scope and conclusion

This is an analysis artifact, not a change proposal implemented in production. The investigation compared the generator records with the records reconstructed on the final contour and with the mask consumed by selective offset reconstruction.

**Conclusion: option C is the authoritative model.** Tap Clearance is a property of an ordered, generator-authored profile, not a property that can be recovered reliably from final-contour position, imported-boundary coincidence, or a segment role considered in isolation. `GeneratedTapGroup` already records each tap's three directed segments, and `GeneratedProfileGroup` already records profile identity and attachment points. What is missing is the explicit relationship between those two records: profile membership, stable tap index/count, and explicit terminal ownership.

The opposite failures have one root cause. The current implementation asks a local geometric question—“does this wall lie on any imported panel boundary?”—to answer a structural question—“is this the outer or inner wall of the first/last tap in this generated profile?” Those predicates agree for some single-edge rectangles, disagree at adjacent generated edges, and exclude both walls of a one-tap end-to-end profile. No refinement of the imported-boundary predicate can make the two meanings equivalent.

## Terminology

1. **Profile outer boundary**: one of the two generator-defined limits of a source-edge replacement, in profile traversal order. It is an attachment/terminal concept, not necessarily a contour segment.
2. **First tap outer wall**: the first tap's wall adjacent to the profile-start attachment. With the present emitted point tuple, this is the directed `points[0] -> points[1]` wall after taps have been ordered in profile direction.
3. **First tap inner wall**: the first tap's other wall, toward subsequent elements of the same profile (`points[2] -> points[3]`).
4. **Middle tap wall**: either wall of a tap having both a predecessor and successor in the same ordered profile.
5. **Last tap inner wall**: the last tap's wall toward preceding profile elements (`points[0] -> points[1]`).
6. **Last tap outer wall**: the last tap's wall adjacent to the profile-end attachment (`points[2] -> points[3]`).
7. **Final contour corner**: a vertex in the merged/rebuilt contour consumed by manufacturing. It may have been generated, displaced, or introduced by reconstruction.
8. **Imported panel corner**: a vertex in the source panel contour before TB/S operations.
9. **Generator profile attachment**: the generator-owned start or end point at which a complete source-edge replacement joins the rest of the generated panel contour. An attachment can meet imported geometry or another generated profile.

The words “start” and “end” above refer to **profile traversal**, never screen-left/top and never minimum/maximum coordinates. If canonical source-edge direction is reversed, either the taps and their wall references must be emitted in that direction or the profile must explicitly record the direction mapping. Winding and screen position are irrelevant.

## Architecture and pipeline trace

```text
Imported SvgPanel contour + edgeIds
       |
       v
TB EdgeAssignment / S slot assignment
       |  source operation + source edge + generator segment order
       v
TB/S generator
       |-- GeneratedProfileGroup (identity, operation, edge, attachments)
       `-- GeneratedTapGroup[] (ID embeds tapIndex; 4 points; 3 local roles)
       |
       v
GeneratedGeometrySnapshot (structured clone; structure survives here)
       |
       v
FinalGeometry merge
       |-- one replacementByPanelId entry (last item wins)
       |-- reparses pathD
       |-- re-identifies tap segments by directed coordinate equality
       `-- flattens structure to segmentTapIds / segmentTapRoles
       |
       v
ManufacturingGeometry (clones flattened arrays, not generator groups)
       |
       v
Tap mask = tap ID exists AND role is tap-side-start/end
       |
       v
Selective offset reconstruction (role-dependent protected anchors)
       |
       v
Slot Clearance (generated slots only)
       |
       v
Kerf (terminal stage)
```

| Stage | Profile identity | Tap identity/order | First/last and attachments | Adjacent-operation effect |
|---|---|---|---|---|
| Imported contour | None; only panel/edge IDs | None | Imported edge endpoints only | Imported corner is shared by adjacent source edges. |
| TB/S assignment | Connection/operation and source edge are known | Segment plans are ordered | The operation and selected edge provide direction and limits | Multiple operations may target sides of one panel. |
| Generator | `GeneratedProfileGroup` per operation/edge | `generatedTaps` are appended during ordered segment iteration; the ID includes `tapIndex` | Attachments are emitted, and each tap's start wall/tip/end wall is explicit; first/last are derivable while generating | Both profiles are independently known while their common inset corner is constructed. |
| Snapshot | Profile groups and tap groups remain distinct arrays | Order survives `structuredClone` | Attachments survive, but no explicit tap-to-profile foreign key exists | Structure still exists and is sufficient if joined by panel/edge/operation. |
| FinalGeometry | Profile groups become per-segment `segmentProfileIds` via an imported-geometry walk | Tap IDs/roles are recovered by directed coordinate matching | Ordered groups, count, and attachment ownership are discarded from the contour | A map holds only one panel replacement; within a combined generated item, overlapping segment matches are scalar and a later match can overwrite an earlier one. |
| ManufacturingGeometry | Only flattened segment profile IDs remain | Only scalar segment tap ID/role arrays remain | Not preserved | It cannot represent two owners on one final segment/corner. |
| Tap mask | Profile identity is unused | Tap identity is only a non-null guard; order is unused | Local role alone decides | Boundary coincidence authored earlier becomes the decision. |
| Reconstruction | No profile model | Segment mask is index-aligned until geometry is rebuilt | `source-boundary-*`/`corner-closure` additionally protect anchors | It consumes the ambiguity rather than resolving it. |
| Slot Clearance / kerf | Independent policy stages | No tap semantics | No terminal semantics | They operate after the information loss and do not explain initial eligibility. |

The snapshot is therefore the last stage that retains both structural collections. The final contour does **not** contain enough information to recover intent without heuristics: it has no tap index/count, no ordered profile membership, no direction, no explicit start/end wall references, and only one ID/role slot per contour segment.

## Current competing sources of truth

| Concept | Genuine knowledge or reconstruction? | Appropriate authority |
|---|---|---|
| `GeneratedProfileId`, operation/panel/source-edge IDs | Generator identity | Reuse as profile identity. |
| `attachmentStart` / `attachmentEnd` | Generator-authored profile extent | Reuse, make required once migration is complete. |
| `GeneratedTapId` | Generator identity; its string currently encodes index | Reuse the opaque ID, but store index as data rather than parsing the ID. |
| `GeneratedTapGroup.points` | Generator-authored directed start wall, tip, end wall | Reuse as explicit emitted segment references (prefer stable refs if later cleanup can alter coordinates). |
| Array order of `generatedTaps` | Incidental but currently generator-authored | Useful migration input; make order explicit per profile. |
| `segmentTapIds` / `segmentTapRoles` | Final-contour projection reconstructed by coordinate equality | Keep as a transport/cache if needed; do not make it the semantic authority. |
| `segmentProfileIds` | Final-contour reconstruction intersected with the historical automatic geometric mask | Profile Offset projection, not Tap Clearance authority. |
| `tap-side-*` vs `source-boundary-*` | A local segment label whose boundary variant is chosen by imported-panel coincidence | Diagnostic/rendering metadata only for Tap Clearance. |
| `corner-closure` | Reconstruction-specific topology label | Anchor/reconstruction aid, not tap eligibility. |
| final bounding box/corners | Emergent geometry | Never Tap Clearance authority. |

There are three conflicting definitions of “boundary”: imported edge coincidence in generator role emission, profile attachment extent in `GeneratedProfileGroup`, and provenance-transition anchors in selective reconstruction. The latest regression is caused by treating the first definition as if it were the second.

## Role-model review

`tap-side-start`, `tap-tip`, and `tap-side-end` are local to one directed tap tuple. They distinguish the two walls but do not say which tap is first or last. `source-boundary-start/end` currently replace those wall roles based on coincidence with **any imported panel side**, so they are neither a complete profile role nor a stable statement about the generated profile boundary. `corner-closure` describes a reconstruction join.

Consequently the roles cannot, alone, identify first-inner versus first-outer or last-inner versus last-outer. Reversal happens to work only where tuple order has already been normalized by the generator. Adjacent profiles break the imported-coincidence premise because one profile's attachment is displaced by the neighboring operation. “Source boundary” is overloaded: its name suggests the generator profile's source limit, while its predicate means original-panel-segment coincidence. That overload caused the correction to trade outer-end movement for missing clearance.

## Fixture comparison

The existing deterministic diagnostic uses the same 90 x 40 panels, 5 mm material, and 30 mm TB finger/S slot length where applicable. “Current” below describes the role predicate; “structural” describes the proposed product rule.

| Fixture | Generator evidence retained | Current result / risk | Structural conclusion |
|---|---|---|---|
| One horizontal profile | Ordered emitted tuples, edge, operation, attachments | Works for middle walls; terminal behavior depends on imported-boundary coincidence | First start wall and last end wall fixed. |
| One vertical profile | Same, independent of axes | Same result after rotation | Identical index rule. |
| Two adjacent generated edges | Two profile groups and per-edge tap groups exist before flattening | Shared generated corner is not necessarily on an imported side; terminal wall can remain eligible | Each profile keeps its own two terminals. |
| Blue center panel | Adjacent operations produce a combined panel contour | Its generated/generated attachment fails the imported-boundary proxy, so an outer terminal is labeled `tap-side-*` and offset | Fix both profiles' outer walls by their own index/attachment. |
| Orange side panel | A short/end-to-end profile can contain one tap | Both walls can coincide with adjacent imported sides and become `source-boundary-*`; the role mask is empty | It exposes the unresolved one-tap product decision; do not infer eligibility geometrically. |
| Lower panel | One generated edge meets otherwise unchanged sides | Imported coincidence happens to match profile terminals | Current success is coincidental validation of the proxy, not of the model. |
| TB profile | Tap tuple and index are known in `applyTabsToContour` | Flattened role classifier loses profile order | Join emitted taps to the TB profile. |
| S male profile | Same knowledge exists in `applySTabsToContour` | Same failure class | Use the same generator-neutral profile model. |
| Clockwise / counterclockwise | Generator emits contour-order tuples | Geometry predicates pass common rectangular cases | Eligibility remains index-based. |
| Reversed source edge | Generator mirrors segment plans before emission | Role names are only reliable after that normalization | Record profile direction and order explicitly; no coordinate heuristic. |
| First tap begins at source start | Tap index and first tuple are known | Start wall is excluded only if it coincides with an imported side | First start wall is outer/fixed by index. |
| Last tap ends at source end | Tap index/count and final tuple are known | End wall is excluded only if it coincides with an imported side | Last end wall is outer/fixed by index/count. |
| Straight geometry before first tap | Attachment and first tap points bound the intervening run | Boundary coincidence says nothing about profile ordering | Start attachment remains terminal; first start wall is still outer. |
| Straight geometry after last tap | Symmetric evidence | Same ambiguity | Last end wall is still outer; end attachment remains terminal. |

There is no checked-in colored multi-panel project or serialized screenshot geometry from which to reproduce color labels independently. The orange/blue explanation above maps the reported labels to the two reproducible topology classes and follows directly from the current predicates: an empty role mask versus a generated/generated corner that is not coincident with the imported boundary. A future golden fixture must serialize that exact project instead of relying on its visual colors.

## Profile-level trace findings

`npm run diagnose:tap-roles` now prints, deterministically, every profile in its TB/S fixtures, its generator/operation/panel/source edge and direction, attachments, ordered tap IDs, first/last IDs, and each tap's three explicit segments. It also prints predecessor/successor, structural interior/exterior classification, intended eligibility, and its proof (`tap index i of N`). The older segment trace follows it and proves snapshot cloning, directed final-segment matching, manufacturing cloning, and the current role-based mask.

The trace establishes that both generators already know tap order, the first/last tap, and both tap walls **at emission time**. They also emit profile start/end attachments. The model fails to connect and carry these facts, rather than failing to calculate them. S combines multiple connections into one item and chooses a lexically sorted owner for the item's top-level operation ID, while individual taps/profile groups retain their own operation IDs. Thus ownership is obscured at item level and then lost when groups are flattened; it is not fundamentally absent in the generators.

## Proposed authoritative model

```ts
GeneratedProfile {
  id: GeneratedProfileId
  generatorType: 'TB' | 'S'
  operationId: string
  panelId: string
  sourceEdgeId: string
  direction: { start: Point; end: Point } // or a stable directed edge reference
  startAttachment: Point
  endAttachment: Point
  orderedTapIds: readonly GeneratedTapId[]
}

GeneratedTap {
  id: GeneratedTapId
  profileId: GeneratedProfileId
  index: number
  startWallSegmentRef: GeneratedSegmentRef
  tipSegmentRef: GeneratedSegmentRef
  endWallSegmentRef: GeneratedSegmentRef
}
```

Reuse the current IDs, operation/panel/source-edge fields, attachment points, and three directed tap segments. Add the missing explicit join and index/count. A segment reference may initially be the existing directed point pair, but its contract must support remapping through final-contour construction and report ambiguity rather than silently choosing one owner. Profile records—not flattened contour roles—determine eligibility.

### Eligibility

| Tap position | Start wall | Tip | End wall | Generator-authored proof |
|---|---|---|---|---|
| First of multiple | **fixed outer** | fixed | **eligible inner** | `index === 0`, end wall leads toward tap 1 |
| Middle | **eligible** | fixed | **eligible** | `0 < index < count - 1` |
| Last of multiple | **eligible inner** | fixed | **fixed outer** | `index === count - 1`, start wall follows the preceding tap |
| Only tap | **fixed terminal** | fixed | **fixed terminal** under the literal stated rule | `index === 0 && count === 1` |

For a single tap, the supplied rule says both walls are profile-terminal and terminal boundaries never move; therefore the only non-guessing interpretation is **neither wall moves**. If the intended product fit requires widening a one-tap male feature, that conflicts with the stated terminal-preservation rule and requires an explicit product decision (for example, a separately modeled internal fit boundary), not a geometry exception. Tips remain fixed in all cases.

## Why the failures are opposite

* **Orange/no clearance:** the correction reclassified imported-boundary-coincident tap walls as ineligible. A one-tap/end-to-end profile can have both walls so classified, producing an all-false mask.
* **Blue/outer-end clearance:** at a corner shared by adjacent generated profiles, the neighboring operation moves the attachment away from the imported boundary. The same semantic terminal wall no longer satisfies imported-boundary coincidence, remains `tap-side-*`, and is offset.
* **Lower/correct:** with only one generated edge, unchanged neighboring edges make geometric coincidence accidentally equal semantic terminal ownership.

The final merge has scalar `segmentTapIds` and scalar roles. Coordinate matching assigns them in iteration order, so a segment representable by two authored records cannot retain both claims. Separately, `replacementByPanelId.set` means distinct panel-replacement items are last-writer-wins. Current TB/S builders usually combine a panel's operations before this merge, but the representation itself neither enforces that invariant nor preserves multi-owner provenance. Multiple adjacent operations therefore obscure or lose ownership precisely where terminal identity matters.

## Staged migration (no production fix in this analysis)

1. **PR 1 — freeze and observe.** Preserve current production output; land this analysis and deterministic structural trace. Check in the exact colored failing project as a non-production golden fixture when available.
2. **PR 2 — authoritative records.** Extend/revise the snapshot schema so each generator emits one ordered profile with explicit tap membership, index, direction, attachments, and segment references. Add validation for unique `(profile,index)` and resolvable references. Do not change the mask.
3. **PR 3 — golden structural tests.** Cover horizontal, vertical, both windings, reversed source direction, start/end-aligned taps, leading/trailing straight runs, TB, S male, single tap, and adjacent operations. Assert structure, not compensated coordinates.
4. **PR 4 — shadow eligibility.** Derive the proposed mask from ordered membership alongside production, emit diagnostics on disagreement, and prove deterministic remapping through FinalGeometry/ManufacturingGeometry. Keep output unchanged.
5. **PR 5 — adjacent-operation validation.** Add the center/side/lower project and assert independent terminal ownership at shared corners; reject ambiguous or overwritten references rather than guessing.
6. **PR 6 — production cutover.** Replace the role-based Tap Clearance mask only after shadow results are accepted. Keep roles temporarily for diagnostics/reconstruction anchors.
7. **PR 7 — demotion/removal.** Remove Tap Clearance authority from imported-boundary coincidence, `segmentTapRoles`, final corners/bounds, and automatic profile masks. Separately evaluate whether reconstruction still needs source-boundary/corner-closure anchor hints.

The smallest clean redesign is therefore not a new role: it is one explicit relation between the two generator-owned structures that already exist, carried intact until manufacturing selects the referenced walls. This removes both the boundary heuristic and the growing role-exception stack.

