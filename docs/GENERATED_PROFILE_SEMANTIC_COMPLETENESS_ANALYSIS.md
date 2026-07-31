# GeneratedProfile semantic-completeness analysis for Profile Offset

## 1. Scope and conclusion

This is a documentation-only analysis of the committed Profile Offset shadow
validation. It does not recommend a production cut-over and it does not treat
the current production mask as automatically correct architecture.

The decisive finding is that `GeneratedProfile` already preserves **structural
element identity** (`straight`, start wall, tip, end wall), directed order, tap
ordinal/count, and first/middle/last status. The missing fact is not “this is a
tip” or “this is the first wall.” The model fails to preserve the generator's
existing boundary-disposition decision for tap walls, and it preserves no
generator-authored semantic disposition that explains why current production
sometimes retains and sometimes filters a source-collinear tap tip.

Consequently there are two different answers:

1. **To reproduce current production exactly (20/20):** every non-collapsed
   element needs a generator-authored, tool-neutral offset disposition. For the
   current compatibility target that disposition must be assigned from the same
   generation-time knowledge that today becomes tap boundary roles, plus an
   explicit generation-time classification for source-collinear tip/support
   behavior. It cannot be reconstructed from `kind` alone.
2. **For the clean long-term semantic model:** preserve element structure and a
   generic manufacturing disposition (`movable-profile` versus
   `fixed-boundary-transition`), not a `profileOffsetEligible` copy of one
   tool's mask. The current automatic mask contains geometric/legacy behavior;
   matching it is a validation compatibility requirement, not proof that all of
   its decisions are enduring manufacturing intent.

No resolver-side geometry is required after that disposition is authored. A
role-only extension such as `elementKind` is insufficient because equivalent
tip and terminal-wall structures have opposite current-production results.

## 2. Method and reading conventions

The diagnostic evaluates 20 profiles and reports 14 profile-level mismatches.
The table below deliberately examines each profile before grouping them. A row
can contain several differing elements. `P/S` means production/shadow; `F/T`
means fixed/eligible. Collapsed straight attachment markers do not project to a
contour segment and are not mismatches. Element references are exact within the
profile: prepend the row's exact profile ID and `:element:` to each listed
reference.

“Direction” is the stored `sourceEdgeDirection`, not an inferred contour
direction. “Tap position” lists `index/total` and therefore makes a one-tap tap
both first and last.

## 3. All 14 mismatches, individually

| # | Profile ID; panel; generator; operation | Source edge and stored direction | Taps and affected position | Generated element reference(s), P/S | Mismatch category | Exact missing semantic fact |
|---:|---|---|---|---|---|---|
| 1 | `profile:TB:TB-tb-counterclockwise-multiple:tb-counterclockwise-multiple-owner:tb-counterclockwise-multiple-owner-edge-0:boundary-profile`; `tb-counterclockwise-multiple-owner`; TB; `operation:TB:TB-tb-counterclockwise-multiple` | `tb-counterclockwise-multiple-owner-edge-0`, `[0,0]→[90,0]` | 1; tap `0/1` (first+last) | `tap-0-tip`, F/T | tip | This source-collinear tip remains fixed under the current production classification; `kind='tap-tip'` does not say so. |
| 2 | `profile:TB:TB-tb-counterclockwise-multiple:tb-counterclockwise-multiple-mate:tb-counterclockwise-multiple-mate-edge-0:boundary-profile`; `tb-counterclockwise-multiple-mate`; TB; `operation:TB:TB-tb-counterclockwise-multiple` | `tb-counterclockwise-multiple-mate-edge-0`, `[120,0]→[210,0]` | 2; tap `0/2` start wall, tap `1/2` end wall | `tap-0-start-wall`, F/T; `tap-1-end-wall`, F/T | both terminal walls | The profile-leading wall of the first tap and profile-trailing wall of the last tap are fixed exterior transitions; the two interior-facing walls remain movable. |
| 3 | `profile:TB:TB-tb-clockwise-one:tb-clockwise-one-mate:tb-clockwise-one-mate-edge-2:boundary-profile`; `tb-clockwise-one-mate`; TB; `operation:TB:TB-tb-clockwise-one` | `tb-clockwise-one-mate-edge-2`, `[210,40]→[210,0]` | 1; tap `0/1` (first+last) | `tap-0-start-wall`, F/T; `tap-0-tip`, F/T; `tap-0-end-wall`, F/T | single-tap, both terminal walls plus tip | Both exterior terminal walls and this full-span source-collinear tip are fixed. First/last flags identify the two walls only when interpreted per wall; they do not encode the tip disposition. |
| 4 | `profile:TB:TB-tb-reversed-source:tb-reversed-source-mate:tb-reversed-source-mate-edge-1:boundary-profile`; `tb-reversed-source-mate`; TB; `operation:TB:TB-tb-reversed-source` | `tb-reversed-source-mate-edge-1`, `[210,0]→[210,40]` | 1; tap `0/1` (first+last) | `tap-0-start-wall`, F/T; `tap-0-tip`, F/T; `tap-0-end-wall`, F/T | single-tap, both terminal walls plus tip | Same semantic facts as row 3; reversal changes coordinates, not the profile-leading/profile-trailing meaning. |
| 5 | `profile:S:S-s-counterclockwise-multiple:s-counterclockwise-multiple-owner:s-counterclockwise-multiple-owner-edge-0:boundary-profile`; `s-counterclockwise-multiple-owner`; S; `operation:S:S-s-counterclockwise-multiple` | `s-counterclockwise-multiple-owner-edge-0`, `[0,0]→[90,0]` | 1; tap `0/1` (first+last) | `tap-0-tip`, F/T | tip | Same fixed source-collinear-tip disposition as row 1, proving that this missing fact is shared by TB and S. |
| 6 | `profile:TB:TB-2-edge-0:2-edge-owner:2-edge-owner-edge-0:boundary-profile`; `2-edge-owner`; TB; `operation:TB:TB-2-edge-0+TB-2-edge-1` | `2-edge-owner-edge-0`, `[0,0]→[90,0]` | 1; tap `0/1` (first+last) | `tap-0-tip`, F/T | tip | Fixed tip disposition; adjacent generated profile topology must not be rediscovered by the resolver. |
| 7 | `profile:TB:TB-2-edge-0:2-edge-mate-0:2-edge-mate-0-edge-0:boundary-profile`; `2-edge-mate-0`; TB; `operation:TB:TB-2-edge-0` | `2-edge-mate-0-edge-0`, `[130,0]→[220,0]` | 2; tap `0/2` start wall, tap `1/2` end wall | `tap-0-start-wall`, F/T; `tap-1-end-wall`, F/T | both terminal walls | Explicit exterior-terminal disposition for leading first wall and trailing last wall; ordinal/count can derive these structurally, but current production agreement still needs the authored fixed/movable meaning. |
| 8 | `profile:TB:TB-2-edge-1:2-edge-mate-1:2-edge-mate-1-edge-0:boundary-profile`; `2-edge-mate-1`; TB; `operation:TB:TB-2-edge-1` | `2-edge-mate-1-edge-0`, `[240,0]→[330,0]` | 1; tap `0/1` (first+last) | `tap-0-start-wall`, F/T; `tap-0-tip`, F/T | leading terminal wall plus tip | The leading wall and this tip are fixed, while `tap-0-end-wall` is eligible. This is direct evidence that “single tap means both walls fixed” does **not** reproduce every current production mask. |
| 9 | `profile:TB:TB-4-edge-0:4-edge-owner:4-edge-owner-edge-0:boundary-profile`; `4-edge-owner`; TB; `operation:TB:TB-4-edge-0+TB-4-edge-1+TB-4-edge-2+TB-4-edge-3` | `4-edge-owner-edge-0`, `[0,0]→[90,0]` | 1; tap `0/1` (first+last) | `tap-0-tip`, F/T | tip | Fixed tip disposition on one edge of a four-profile panel. |
| 10 | `profile:TB:TB-4-edge-2:4-edge-owner:4-edge-owner-edge-2:boundary-profile`; `4-edge-owner`; TB; `operation:TB:TB-4-edge-0+TB-4-edge-1+TB-4-edge-2+TB-4-edge-3` | `4-edge-owner-edge-2`, `[90,60]→[0,60]` | 1; tap `0/1` (first+last) | `tap-0-tip`, F/T | tip | Same fixed tip disposition under the opposite source-edge direction; screen-left/screen-right cannot express it. |
| 11 | `profile:TB:TB-4-edge-0:4-edge-mate-0:4-edge-mate-0-edge-0:boundary-profile`; `4-edge-mate-0`; TB; `operation:TB:TB-4-edge-0` | `4-edge-mate-0-edge-0`, `[130,0]→[220,0]` | 2; tap `0/2` start wall, tap `1/2` end wall | `tap-0-start-wall`, F/T; `tap-1-end-wall`, F/T | both terminal walls | Fixed profile-leading and profile-trailing exterior transitions; interior walls and both tips are eligible in current production. |
| 12 | `profile:TB:TB-4-edge-1:4-edge-mate-1:4-edge-mate-1-edge-0:boundary-profile`; `4-edge-mate-1`; TB; `operation:TB:TB-4-edge-1` | `4-edge-mate-1-edge-0`, `[240,0]→[330,0]` | 1; tap `0/1` (first+last) | `tap-0-start-wall`, F/T; `tap-0-tip`, F/T | leading terminal wall plus tip | Authored fixed disposition for the leading wall and tip; trailing wall remains movable despite also being the last wall. |
| 13 | `profile:TB:TB-4-edge-2:4-edge-mate-2:4-edge-mate-2-edge-0:boundary-profile`; `4-edge-mate-2`; TB; `operation:TB:TB-4-edge-2` | `4-edge-mate-2-edge-0`, `[350,0]→[440,0]` | 2; tap `0/2` start wall, tap `1/2` end wall | `tap-0-start-wall`, F/T; `tap-1-end-wall`, F/T | both terminal walls | Fixed leading/trailing exterior-terminal disposition; all elements between them are eligible in current production. |
| 14 | `profile:TB:TB-4-edge-3:4-edge-mate-3:4-edge-mate-3-edge-0:boundary-profile`; `4-edge-mate-3`; TB; `operation:TB:TB-4-edge-3` | `4-edge-mate-3-edge-0`, `[460,0]→[550,0]` | 1; tap `0/1` (first+last) | `tap-0-start-wall`, F/T; `tap-0-tip`, F/T | leading terminal wall plus tip | Same asymmetric single-tap disposition as rows 8 and 12; first/last booleans alone would incorrectly fix the eligible trailing wall. |

### Per-element eligibility check

The table's compact P/S entries are not a “first difference only” summary. For
rows 2, 7, 11, and 13 the only differences are the two outer terminal walls;
the two tips, two inner walls, and intermediate straight are eligible in both.
For rows 3 and 4 all three tap elements differ. For rows 8, 12, and 14 the
start wall and tip differ, while the end wall and non-collapsed trailing
straight agree as eligible. The five remaining rows differ only at the tip.

## 4. Recurring categories

After individual inspection, the 14 profile mismatches reduce to:

| Category | Profiles | Missing fact |
|---|---:|---|
| Tip only | 5 | A tip-specific fixed/movable disposition; `tap-tip` is not an eligibility rule. |
| Both exterior terminal walls | 4 | Which terminal transitions are fixed versus movable in the authored profile. |
| Both terminal walls plus tip (full single tap) | 2 | Explicit dispositions for all three elements; structural first+last is not enough for the tip. |
| Leading terminal wall plus tip (partial single tap) | 3 | Explicit asymmetric element dispositions; tap ordinal/count cannot reproduce the eligible trailing wall. |

There are 5 tip-only profile mismatches, but tips also differ in the two
full-single and three partial-single rows: **10 tip element differences total**.
There are **15 terminal-wall element differences**: eight in the four two-tap
profiles, four in the two full-single profiles, and three in the asymmetric
single profiles.

## 5. Tap-tip analysis

### What is already represented

`GeneratedProfile.orderedElements` explicitly labels every authored reference
as `straight`, `tap-start-wall`, `tap-tip`, or `tap-end-wall`. These kinds are
assigned by `createGeneratedProfile` while it consumes the generator-authored
four-point tap tuple; they are not reconstructed by the shadow resolver. Every
`GeneratedProfileTap` also retains an exact `tipReference`. In all 20 validation
profiles, every emitted tap has its reference.

An element does not contain mixed semantic meaning in the current model: each
reference has one kind and one directed start/end pair. A collapsed straight is
an attachment marker rather than a segment, but it is not a wall/tip mixture.
That statement is about the authored model; later contour cleanup or future
geometry transformations can merge or split numerical segments, which is why
semantic identity must not be defined by final segment identity.

### Why `kind='tap-tip'` is insufficient

Production does **not** exclude every tip from Profile Offset. It excludes the
tips in rows 1, 3–6, 8–10, 12, and 14, but includes both tips of every mismatching
two-tap mate profile (rows 2, 7, 11, and 13). There is no observed exception
where two otherwise identical semantic tip roles can be distinguished by
`kind`, tap ordinal, or generator type alone.

The current production decision is the intersection of profile membership with
an automatic geometric compensation classifier. That classifier labels a
segment modified when it does not lie on an imported segment and can also add
source-collinear “supporting” segments based on the surrounding modified run.
This is why “tips are fixed” is false and “all authored profile elements move”
is also false. The variation is current geometric compatibility behavior, not a
missing ability to recognize tips.

The generators indisputably know that the segment is a tip when they emit the
tuple: both TB and S author `'tap-tip'` at that point. What they do **not**
currently author into `GeneratedProfile` is the tip's fixed/movable
manufacturing disposition. Recomputing the automatic classifier in the
resolver would violate the experiment.

### Minimum tip fact

Neither another `elementKind` nor a duplicated tip reference helps. The minimum
fact is one value on the element saying whether it is a movable part of this
authored profile or a fixed boundary/support transition. A generic disposition
is cleaner than a tip-specific boolean because the identical distinction is
needed for terminal walls and can be shared by future manufacturing tools.

## 6. Terminal-wall analysis

For every generated tap, the existing model already identifies:

* start wall: `startWallReference`;
* tip: `tipReference`;
* end wall: `endWallReference`;
* ordinal and total: `tapIndex`, `totalTapCount`;
* first/middle/last status: explicit booleans; and
* source-edge direction: stored once on the containing profile.

In the profile's directed authored order, the start wall is the
**profile-leading wall** and the end wall is the **profile-trailing wall**. For
a first tap, its leading wall faces the profile exterior/start attachment; for
a last tap, its trailing wall faces the profile exterior/end attachment. A
first tap's trailing wall and a last tap's leading wall face the profile
interior. Every wall of a middle tap is interior-facing. This remains true
under winding and coordinate reversal.

That structural classification can be derived without geometry:

| Tap position | Start wall | Tip | End wall |
|---|---|---|---|
| first of several | exterior/profile-leading | tip | interior/profile-trailing |
| middle | interior/profile-leading | tip | interior/profile-trailing |
| last of several | interior/profile-leading | tip | exterior/profile-trailing |
| only tap | exterior/profile-leading | tip | exterior/profile-trailing |

However, first/middle/last is **not sufficient to reproduce current
production**. Rows 8, 12, and 14 are single taps whose leading wall is fixed but
whose trailing wall is eligible. Conversely rows 3 and 4 fix both. An explicit
per-wall disposition is therefore required for 20/20. Adding only
`isExternalTerminal` would faithfully describe structure, but it would either
disagree with the asymmetric current masks or force the resolver to infer an
exception.

The existing generator callbacks already decide whether each wall lies on an
imported panel boundary and author `source-boundary-start/end` versus
`tap-side-start/end` on `GeneratedTapGroup`. That is generator-authored data,
but it is not preserved as part of `GeneratedProfile`, and the restricted
resolver correctly may not consult the parallel tap-role channel. The clean
model should preserve the resulting semantic boundary disposition on the
profile element, rather than copy the old role vocabulary or make the resolver
repeat `segmentLiesOnPanelBoundary`.

## 7. Single-tap case

A one-tap record correctly has `isFirstTap=true`, `isLastTap=true`, and
`isMiddleTap=false`. Those booleans are not logically ambiguous when applied to
a specified wall: the start wall is exterior at the profile start and the end
wall is exterior at the profile end. They become ambiguous only if a consumer
collapses them into one tap-level “terminal” decision.

Long-term structural semantics therefore do **not** require another
`isOnlyTap`; it is exactly `totalTapCount === 1`, and adding it would duplicate
truth. Nor do they require “left/right” fields.

Current-production compatibility is a different matter:

* rows 3 and 4: start wall, tip, and end wall are all fixed;
* rows 8, 12, and 14: start wall and tip are fixed, but end wall is eligible;
* rows 1, 5, 6, 9, and 10: both walls and the straights are eligible, but the
  tip is fixed.

Thus neither `first/last`, an explicit `only` classification, nor a generic
“terminal tap” flag can encode the observed masks. Each wall and tip needs its
own authored disposition. If the intended manufacturing rule is eventually
declared to be “both outside walls of an only tap stay fixed,” rows 8, 12, and
14 should intentionally diverge from current production; that would be a later
product/production decision, not a shadow-model defect.

## 8. Direction and orientation

The fixtures cover counter-clockwise contours, clockwise contours, a reversed
source edge, opposite rectangle edges, TB, and S. Rows 3 and 4 show equivalent
full-single behavior when direction is reversed. Rows 1 and 5 show equivalent
tip behavior across TB and S. Rows 9 and 10 show the same tip result on
oppositely directed panel edges.

Screen-space “left wall” and “right wall” are therefore unstable. Source-edge
start/end is also unsafe as the sole vocabulary because the stored SVG edge can
be reversed relative to contour emission. The authoritative coordinate frame
should be the **directed emitted profile order**:

* leading/trailing element and attachment;
* tap ordinal in that order; and
* each tap's leading wall, tip, and trailing wall.

The source-edge direction remains useful provenance, but consumers should not
convert semantic wall sides back from world coordinates. TB and S already emit
the same ordered four-point tap shape into `createGeneratedProfile`; no
generator-specific resolver branch is justified by this validation.

## 9. Element-model analysis

### Is the flat list sufficient?

For the present generator output, **yes, if enriched at element level**. The
flat `orderedElements` list plus `GeneratedProfileTap` references already
represents leading straight, each three-part tap, intervening straights, and
trailing straight. It supplies stable element IDs and a typed `kind`; tap
records group the three tap elements and provide ordinal/count. Turning this
into a second nested union would restate the same relationships.

A typed ordered union would improve type-local discoverability (for example,
making `tapIndex` directly available on a wall element), but it is not the
minimum extension required for the 14 mismatches. It would also require a
larger schema change without changing the decision power. The focused next
step should retain the flat ordered references.

### Identity versus numerical segments

In current authored data, each non-collapsed reference participates in one
semantic element and each tap points to three distinct element IDs. The leading
and trailing straight references can deliberately describe the same geometry
when a no-tap profile is represented, and collapsed attachment markers have no
final segment. Therefore even today element identity is not equivalent to a
unique non-degenerate segment.

Contour cleanup, joins, offsetting, or future merging can split, collapse, or
merge numerical geometry. A final segment can consequently fail to have a
one-to-one relationship with an authored element. Semantic element identity
must remain independent of final segment identity; a separate validated
projection may map one semantic element to zero, one, or several current
segments and must report ambiguous overlap rather than overwrite it.

## 10. Eligibility semantics and production comparison

### Store A, B, or C?

Prefer **B: pure semantic role/disposition**, not A (a direct Profile Offset
boolean) and not C (both).

* A exactly reproduces one tool's current decision but couples a generator
  domain model to Profile Offset and duplicates any later capability policy.
* B records what the generator means: this element is movable generated profile
  material, or it is a fixed boundary/support transition. Profile Offset, Tap
  Clearance, and future manufacturing tools can map that fact through their own
  explicit policies.
* C creates two truths that can disagree and requires validation rules merely
  to keep the duplicate boolean synchronized.

The qualification is important: current production's supporting-segment rule
is a geometric heuristic, not obviously a pure manufacturing fact. To obtain
20/20, generation must classify its result once and preserve it as semantic
disposition. Before production migration, product owners should decide whether
source-collinear supported tips truly mean movable profile material. If not,
the long-term policy should intentionally stop matching those current masks.

### Current rule classification

| Current rule/behavior | Classification | Reproduce now versus long term |
|---|---|---|
| A generator emits a directed start wall, tip, and end wall for each tap | true generator semantics | Preserve unchanged; both current reproduction and long-term model need it. |
| Generator callback labels tap walls as boundary-coincident or tap-side | generator-known fact produced using a geometric predicate | Preserve the semantic result, not the predicate, if it represents intended fixed/movable behavior. Do not rerun it in the resolver. |
| Tap tips are authored as tips | true generator semantics | Preserve; insufficient by itself for eligibility. |
| Profile ID assignment is intersected with the automatic compensation mask | legacy implementation detail | Necessary to reproduce current masks, but should not define long-term ownership. |
| A generated segment is “modified” when it is not collinear with an imported segment | geometric heuristic | Current compatibility only; it is not generator profile membership. |
| A source-collinear segment is re-included when a modified run supplies two supporting attachments | geometric heuristic and potentially accidental current behavior | This explains eligible tips in multi-tap profiles; validate manufacturing intent before elevating it to semantics. |
| Current filtering of exterior terminal walls | required-looking manufacturing behavior implemented via geometry | The fixed terminal transition is a credible semantic rule, but asymmetric single-tap results show current geometry does not consistently implement the structural rule. |
| Scalar, one-ID-per-final-segment projection | legacy implementation detail | Keep out of the semantic authority; it cannot represent merged/multiple claims. |
| A collapsed straight acts as an attachment marker, not an eligible segment | true generator semantics | Preserve in projection behavior; it needs no eligibility decision because no segment exists. |

This classification separates “match today's oracle” from “define the right
oracle.” The shadow exercise can prove compatibility after extension; it cannot
turn a geometric coincidence into correct manufacturing policy.

## 11. Minimum model extension

The smallest coherent extension is one required field on each
`GeneratedSegmentReference`:

| Field | Specification |
|---|---|
| Name | `manufacturingDisposition` (recommended descriptive name; finalize vocabulary only after product semantics review) |
| Type | `'movable-profile' \| 'fixed-boundary-transition'` |
| Owner | The generator-authored `GeneratedSegmentReference` inside one `GeneratedProfile` |
| Assigned | At the existing tap/straight emission boundary, while TB or S still knows the element's structural kind, ordered position, clipping/terminal state, and generator-authored boundary result. The resolver must not assign or infer it. |
| TB/S support | Both. They use the same `createGeneratedProfile` boundary and already emit equivalent ordered tap tuples and wall roles. |
| Transport | Immutable and unchanged through generated snapshot, FinalGeometry shadow transport, and ManufacturingGeometry shadow transport; projection may map it but must not rewrite it. |
| Resolves | Tip-only, both-terminal-wall, full-single, and asymmetric-single categories. |
| Duplication | Does not duplicate `kind`, tap refs, ordinal/count, or direction. It deliberately supersedes eligibility use of the parallel boundary-role channel. It would duplicate production's mask if defined as a Profile Offset boolean, which is why the generic semantic disposition is preferred. |

No new profile-level, tap-level, `isOnlyTap`, direction, or nested-element field
is needed for these 14 mismatches. A profile-level policy cannot encode the
mixed results within one tap. A tap-level policy cannot distinguish its three
elements. Optional disposition is also insufficient: it would force a fallback
heuristic. Native generated profiles should require it; legacy/incomplete data
should fail diagnostically in a future experiment rather than infer.

There is one hard constraint: assigning values that match the production
supporting-segment heuristic cannot honestly be done from tap kind/ordinal
alone. The generator path must already have, or be explicitly given, the
operation/topology result while it emits the element. If the only available
source for a tip remains a later imported-boundary scan, then the field would be
a cached legacy decision rather than newly discovered generator semantics. That
is acceptable only for a 20/20 compatibility experiment and must be labeled as
such; it is not a reason to hide geometry in the resolver.

## 12. Pure semantic resolver simulation

Conceptually, the resolver after the extension is:

```text
for each reference in profile.orderedElements:
    if reference is collapsed:
        emit no segment decision
    else:
        eligible = reference.manufacturingDisposition == 'movable-profile'
        emit (reference.id, eligible)
```

The collapsed check belongs to projection because a zero-length attachment
marker does not map to geometry; it is not an eligibility heuristic. The
resolver does not inspect coordinates, bounds, contour winding, source edges,
corners, legacy segment IDs/roles, compensation masks, or production policy.
It does not special-case TB, S, tips, first/last, or single taps.

This remains appropriately simple because all meaning is authored upstream.
Tap Clearance can independently map the same generic disposition plus the
already-authored wall/tip structure to its own policy; it need not reuse a
Profile Offset boolean.

## 13. Predicted result and representability limits

If every element receives a disposition equal to the generator's intended
fixed/movable classification and the validation projector remains one-to-one
for these fixtures, the extension should produce **20/20 profile matches**. The
prediction is exact for the committed dataset because every disagreement is a
mapped, non-collapsed element for which production is false and the current
shadow is true; no production-true/shadow-false or unmapped mismatch was
reported.

No case in the 20-profile validation set requires geometry **in the resolver**.
All 14 can be represented by the proposed element disposition.

Cases not solved merely by adding the field are projection problems outside
this focused question:

* a semantic element removed, split, or merged during geometry transport;
* one final segment claimed by multiple profile elements;
* ambiguous or missing mapping after a geometry-changing operation; and
* legacy profiles lacking the required disposition.

Those cases require explicit projection provenance or a diagnostic, not
semantic inference. Also, the current production tip-support distinction cannot
be *derived as pure domain semantics* from the existing structural fields. It
can only be represented once the generator authors a disposition (or copied as
a compatibility result). That is the exact semantic-completeness gap exposed
by this validation.

## 14. Recommended next PR (one focused change)

Create one **diagnostic/schema-shadow PR only** that adds the required
`manufacturingDisposition` vocabulary to generator-authored profile elements,
authors it in both TB and S at element creation, proves it survives the existing
shadow transports unchanged, and changes only the validation resolver/report
to compare the semantic decisions. It must not alter production selection,
geometry, serialization, UI, compensation, or production tests.

Before that PR is merged, explicitly record whether its tip dispositions are:

1. approved long-term manufacturing semantics, or
2. a named production-compatibility shadow of the automatic classifier.

Do not combine that decision-preservation PR with a production migration. The
success criterion for the focused PR is 20/20 diagnostic agreement plus proof
that the resolver contains no geometric or legacy fallback; production remains
unchanged.
