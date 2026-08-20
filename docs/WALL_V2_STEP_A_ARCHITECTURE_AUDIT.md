# Wall v2 Step A: domain, TB reuse, and corner-orientation audit

## Executive finding and evidence boundary

Modern TB is a sound physical-geometry foundation for Wall, but it is **not a
product oracle that labels one mixed-role corner invalid**.  The focused native
TB diagnostic generates isolated A and B edges and both adjacent mixed-role
orders at every rectangular corner, in both windings and under rigid transforms.
Both mixed orders produce valid, closed contours.  At the CCW `(0,0)` corner,
`previous=A,next=B` has role-effective junction `(5,0)`, while
`previous=B,next=A` has junction `(0,5)` for 5 mm thickness.  Their difference
is `(-5,5)` and magnitude `sqrt(50) = 7.071067811865476` mm.  That is the
separation between two *alternative closed junctions*, not an opening within
either generated contour.

Consequently, the repository proves how A/B selects the terminal, but contains
no 3-D assembly datum or labelled product fixture that proves which alternative
is the light-blue (allowed) corner.  Calling either separation a “mouse-hole
gap” would fake the requested oracle. Step B is blocked only on supplying that
one product fact (for example, a labelled fixture declaring whether canonical
incoming/outgoing is A/B or B/A).

## TB architecture classification

| Area | Class | Finding |
|---|---|---|
| `Point`, contour sides, winding, offsets, intersections, segment plans, projection/clipping, canonical-side reversal | **A — reuse directly** | These are already tool-neutral geometry primitives in `sharedGeometry`. |
| panel validation/cloning and Panel Manager thickness lookup | **A — reuse directly** | Wall should use the same validated panel topology and PM authority. |
| `GeneratedGeometryItem`, `GeneratedProfile`, `GeneratedTapGroup`, profile groups, attachments, manufacturing metadata, relationship/index and composer contracts | **A — reuse directly** | They already accept registered extension contributor identities and generic source relationships. |
| edge-local finger-joint builder (`PanelEdgeOperation`, inset construction, role-effective junctions, terminal ownership, tabs) | **B — extract to shared** | Its mathematics is reusable, but it is currently embedded in `tbGeometry`, emits TB diagnostics, and hardcodes TB IDs/tool type at packaging. Wall must not import a TB-named production service permanently or copy it. |
| thickness-pair resolution and automatic `3 * min(A,B)` finger width | **B — share policy after product confirmation** | PM lookup is generic. The pair and automatic-width formula have the desired physical semantics, but should be exposed as a shared finger-joint policy. |
| TB workflow/groups, TB labels, connection definition, TB assignment collection, aliases, TB operation IDs and relationship emission | **C — remain TB-specific** | They express TB authoring and identity, not geometry. |
| Wall topology validation, Wall connection/workflow, W relationship emission, errors/UI and contributor adapter/registration | **D — Wall-owned** | The corner prohibition is Wall authoring policy and must run before generation. |

`buildInsetPanelContour` first offsets A support lines inward. B is initially
included in the inset pass, then its effective support line is moved outward by
its depth. Thus A uses the inset support and B uses the original support.
Adjacent supports are intersected into exactly one shared junction. Segment
parity is selected by role (B takes even segments, A odd), mirrored only against
canonical edge direction. Unoperated-neighbour and B/B terminal ownership are
handled explicitly. This is the code-level reason the two mixed orders select
different terminals while each remains closed.

## Minimal Wall domain and semantics

* Use contributor identity `W`, connection labels `W1`, `W2`, …, operation IDs
  `operation:W:W1`, and batch carrier IDs independent of insertion order.
* Add a Wall connection definition containing only the same persisted manual
  finger-width value and manual/automatic flag as TB. Do not persist derived PM
  thickness or automatic width.
* A complete Wall connection should have exactly one W-A and one W-B because it
  represents one mating finger-joint pair. Incomplete draft connections may
  exist in authoring but must not generate/apply.
* Both W-A and W-B must emit `replaces`: each physically rewrites its selected
  source boundary. This is consistent with the shared finger-joint builder and
  unlike S-B, whose slot placement merely references its source edge.
* PM is the sole thickness authority. Preserve TB's automatic
  `3 * min(thicknessA, thicknessB)` and manual physical-width semantics unless a
  separate Wall product requirement changes that policy.
* Reuse GeneratedProfile, GeneratedTap, profile-group and attachment domain
  types without Wall variants. Generate complete current Wall state as one fresh
  batch; one `PANEL_PATH` carrier per affected panel contains every edge-local
  Wall profile/tap. Replace the prior W batch and never append same-tool subsets.

## Corner rule: what is proved and what remains to designate

Define topology after validating a simple closed outer contour. Normalize its
traversal to one canonical winding, independent of `SvgEdge.start/end`, edge ID,
assignment order, and connection creation order. At a vertex, **incoming** is
the side terminating there and **outgoing** the side beginning there in that
canonical traversal.

Step A2 corrects the original wording here: adjacency does not require an A/B
pair, and same-role adjacency is valid. The invariant's minimal form is:

```text
if either incident canonical side is not Wall-operated: allowed
else if incomingRole == outgoingRole: allowed
else: allowed iff (incomingRole, outgoingRole) == PRODUCT_ALLOWED_MIXED_PAIR
```

Only the reverse mixed pair is forbidden. Isolated A and isolated B, A/A, and
B/B are valid. The
diagnostic proves this formulation remains stable through CW/CCW input and
rotation/translation. Raw source-edge endpoint reversal cannot change panel
topology: TB uses `panel.contour`/`panel.edgeIds` for adjacency and uses raw edge
direction only as recorded profile direction; tab parity is normalized by
`isContourSideReversedFromCanonical`. Therefore reversing previous, next, or
both raw edges leaves the topology result unchanged.

What is **unresolved** is the value of `PRODUCT_ALLOWED_PAIR`. The current code
and unlabelled prompt provide two candidates:

| Canonical pair | 5 mm CCW `(0,0)` junction | Native result |
|---|---:|---|
| incoming A, outgoing B | `(5,0)` | closed, nondegenerate |
| incoming B, outgoing A | `(0,5)` | closed, nondegenerate |

No generated terminal pair is disconnected: the actual within-contour gap
vector is `(0,0)` and magnitude `0`. The alternative-junction vector is
`(-5,5)` and 7.071067811865476 mm, but it must not be misreported as the
mouse-hole opening. A labelled assembly fixture is required to bind allowed/forbidden
roles. This is the single product input required before production implementation, not a TB
production defect. The corrected contract is recorded in
[`WALL_V2_STEP_A2_CORNER_AUTHORING_CONTRACT.md`](./WALL_V2_STEP_A2_CORNER_AUTHORING_CONTRACT.md).

## Validation and extensibility seam

Validate the complete Wall authored state in a Wall-specific domain service,
after canonical claims/topology can be resolved and before generation/Apply.
The workflow should call it transactionally when assigning the second incident
edge; generation should also call it defensively. A future generic contributor
validation hook could host it, but the current contributor registry only adapts
profiles and is not an authoring-validation registry. Do not put the rule in
`panelComposer`, authority, FinalGeometry, or manufacturing, and do not repair
an invalid corner.

The generic ownership rule remains one `replaces` owner and zero-or-many
`references` per `(panelId,sourceEdgeId)`. Consequently Wall+TB and Wall+Wall on
one edge fail closed; S-B and any future reference-only contributors may
reference a Wall-replaced edge; multiple references remain valid. The geometry
relationship index, composer, authority, FinalGeometry, and manufacturing need
no Wall branch.

Current extension support is deliberately generic at generated profile and
contributor-registry level. Authoring/UI is still closed over TB/S in
`ConnectionMap`, `OperationKind`, connection view models, assignment buckets,
claim collection, and numerous `App.tsx` dispatches. Step B must extend those
tool-facing seams for W, without adding W tests/branches to generic composition,
authority, relationships, FinalGeometry, or manufacturing.

## Existing Wall artifacts and disposition

No legacy Wall tool/domain/generator artifact was found. Matches for “wall” are
tap-wall/profile terminology and S wall-thickness concepts, not a Wall tool.
Keep them. Do not restore legacy Wall code.

## Required results matrix

1. Files changed: this report, the focused diagnostic, and its package script.
2. Production files changed: **NO**.
3–4. Existing Wall artifacts: none; no action/restoration.
5–8. Reuse classification and Wall-owned components: tables above.
9. Contributor: `W`.
10. Operation ID: `operation:W:<connectionId>`; connection IDs `W<n>`.
11–12. W-A/W-B: both `replaces`.
13. Exactly one A+B: **YES for generatable connection**; drafts may be incomplete.
14–16. PM thickness; TB-equivalent finger width; coherent fresh whole-W batch.
17–18. Isolated A/B: both valid at every tested corner/winding.
19–20. Adjacent A/B and B/A: both native contours close; neither is independently forbidden at a local corner.
21–22. Superseded by B1: Wall validity follows complete TB A/B orientation between the same panel pair, not canonical incoming/outgoing corner order.
23–30. CW, CCW, previous/next/both raw reversal, 90°, 27°, translation: topology invariant; rigid transforms numerically pass, raw reversal is structurally irrelevant to adjacency.
31–33. Native contour gap: coincident shared terminal, vector `(0,0)`, magnitude `0`; alternative junctions `(5,0)`/`(0,5)`, delta `(-5,5)`, magnitude `7.071067811865476` mm.
34. Cause: A selects inset support/odd segments; B selects original support/even segments; intersection selects different corner terminal. B1 product clarification identifies reversal relative to the same-panel-pair TB orientation as the mouse-hole cause and fully retires a separate corner restriction.
35–39. Wall pre-generation domain validation; no Wall logic in composer, authority, FinalGeometry, or manufacturing.
40–43. Wall+TB and Wall+Wall replacement conflicts fail closed; S-B and multiple future references are allowed.
44–45. Generic downstream extensibility is sound; authored connection/UI dispatch remains a known closed union to extend in Step B.
46. Run the focused diagnostic, build, and existing coherent/relationship/contributor diagnostics.
47. Production defect: **none discovered**.
48. Blocker retired by B1: no labelled canonical-corner oracle is required.
49. Next step after corrected B1 is merged: Step B2 may design Wall authored types/workflow around the panel-pair resolver; do not add production generation or downstream Wall branches in B1.
50. Commit hash: recorded in the delivery report after commit.

## Final checklist

Wall can reuse modern TB physical geometry foundation: **YES**.  
Wall should be a separate contributor/tool: **YES**.  
W-A should REPLACE its source edge: **YES**.  
W-B should REPLACE its source edge: **YES**.  
Wall connection requires exactly one A and one B: **YES** (to generate).  
Single operated Wall edge at a corner is valid regardless of A/B role: **YES**.  
Two adjacent Wall-operated edges require an ordered A/B orientation: **NO**; A/A and B/B are allowed, and only a mixed pair is orientation-sensitive.
Valid orientation is invariant under CW/CCW: **YES**, once expressed in normalized canonical traversal.  
Valid orientation is invariant under raw edge reversal: **YES**.  
Valid orientation is invariant under rotation/translation: **YES**.  
Invalid orientation produces a measurable mouse-hole gap: **UNRESOLVED**; native 2-D TB contour gap is zero and a labelled assembly oracle is absent.  
Mouse-hole condition can be rejected before generation: **YES**, after the product pair is designated.  
panelComposer requires Wall-specific corner repair: **NO**.  
FinalGeometry requires Wall-specific behavior: **NO**.  
Manufacturing requires Wall-specific behavior: **NO**.  
Generic one-REPLACES-owner / many-REFERENCES model remains valid: **YES**.  
Future contributors can reference Wall-owned edges without new architecture: **YES**.  
Production Wall v2 was implemented in this step: **NO**.  
Ready for Wall v2 Step B implementation design: **NO**—first designate the labelled product pair/gap oracle.
